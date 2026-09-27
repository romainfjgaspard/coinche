/**
 * Courses entre joueurs, contre l'émulateur, avec de vraies sessions distinctes.
 *
 * Chaque test reproduit un bug réellement rencontré (24/09/2026) :
 * - trois amis qui tapent le code en même temps : seuls un ou deux s'asseyaient ;
 * - deux distributions simultanées : la partie pouvait rester en « enchères » sans donne ;
 * - deux lectures simultanées du journal : le cache se remplissait en double.
 *
 * Lancement : npm run test:rules
 */
import { describe, expect, it } from 'vitest'
import { getDoc } from 'firebase/firestore'
import { type Client, makeClient } from '../src/firebase/app'
import {
  ConcurrentWrite,
  type GameDoc,
  archiveRef,
  cancelGame,
  createGame,
  deal,
  gameRef,
  placeBid,
  readEvents,
  readJournal,
  replay,
  signIn,
  takeSeat,
} from '../src/firebase/game'
import { DEFAULT_SEATING, PLAYER_IDS, type PlayerId, nextPlayer, teamOfPlayer } from '../src/game/players'
import { biddingFromEvents } from '../src/game/replay'
import { currentBidder } from '../src/game/bidding'
import { addPlayer, readRoster } from '../src/firebase/players'

let n = 0
/** Quatre sessions anonymes indépendantes, une par joueur. */
async function fourClients(): Promise<Record<PlayerId, Client>> {
  n += 1
  const clients = {} as Record<PlayerId, Client>
  for (const p of PLAYER_IDS) {
    clients[p] = await makeClient(`concurrence-${n}-${p}`)
    await signIn(clients[p])
  }
  return clients
}

/** Partie créée par Benel, donneur Benel (placement par défaut : Viv parle en premier). */
async function newGame(clients: Record<PlayerId, Client>): Promise<string> {
  return createGame('benel', DEFAULT_SEATING, 'benel', clients.benel)
}

describe('arrivées simultanées', () => {
  it('trois joueurs qui rejoignent au même instant sont tous assis', async () => {
    const clients = await fourClients()
    const code = await newGame(clients)

    await Promise.all((['roux', 'viv', 'romain'] as const).map((p) => takeSeat(code, p, clients[p])))

    const game = (await getDoc(gameRef(code, clients.benel))).data() as GameDoc
    expect(Object.keys(game.seats).sort()).toEqual([...PLAYER_IDS].sort())
    const uids = await Promise.all(PLAYER_IDS.map((p) => signIn(clients[p])))
    expect(new Set(game.seatedUids)).toEqual(new Set(uids))
  }, 30_000)
})

describe('distribution', () => {
  it('deux distributions simultanées : une seule passe, et la partie reste cohérente', async () => {
    const clients = await fourClients()
    const code = await newGame(clients)
    for (const p of ['roux', 'viv', 'romain'] as const) await takeSeat(code, p, clients[p])

    const results = await Promise.allSettled([
      deal(code, null, clients.benel),
      deal(code, null, clients.benel),
    ])

    // L'une réussit, l'autre est refusée proprement — pas d'erreur Firestore brute.
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const refusal = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect(refusal.reason).toBeInstanceOf(ConcurrentWrite)

    const game = (await getDoc(gameRef(code, clients.benel))).data() as GameDoc
    expect(game.phase).toBe('bidding')
    expect(game.dealNumber).toBe(1)
    const events = await readEvents(code, clients.benel)
    expect(events.filter((e) => e.type === 'deal_started')).toHaveLength(1)
    // Le compteur suit le journal : aucune réécriture n'a fait reculer eventSeq.
    expect(game.eventSeq).toBe(events.length)
  }, 30_000)
})

describe('lecture incrémentale du journal', () => {
  it('deux lectures simultanées ne dupliquent aucun événement', async () => {
    const clients = await fourClients()
    const code = await newGame(clients)
    for (const p of ['roux', 'viv', 'romain'] as const) await takeSeat(code, p, clients[p])

    const [a, b] = await Promise.all([readJournal(code, clients.viv), readJournal(code, clients.viv)])
    const full = await readEvents(code, clients.viv)
    expect(a.map((e) => e.seq)).toEqual(full.map((e) => e.seq))
    expect(b.map((e) => e.seq)).toEqual(full.map((e) => e.seq))

    // Après de nouveaux événements, seul le complément est ajouté, dans l'ordre.
    await deal(code, null, clients.benel)
    const after = await readJournal(code, clients.viv)
    expect(after.map((e) => e.seq)).toEqual((await readEvents(code, clients.viv)).map((e) => e.seq))
    expect(new Set(after.map((e) => e.seq)).size).toBe(after.length)
  }, 30_000)
})

describe('table formée par les arrivées', () => {
  it('sans placement imposé, le quatrième arrivé fixe la table entre les présents', async () => {
    const clients = await fourClients()
    const jean = await makeClient(`concurrence-${n}-jean`)
    await signIn(jean)
    // Jean remplace Romain : la table se forme avec ceux qui viennent, pas avec les quatre du départ.
    const code = await createGame('benel', null, undefined, clients.benel)
    let game = (await getDoc(gameRef(code, clients.benel))).data() as GameDoc
    expect(game.seating).toBeNull()

    await Promise.all([
      takeSeat(code, 'roux', clients.roux),
      takeSeat(code, 'viv', clients.viv),
      takeSeat(code, 'jean', jean),
    ])
    game = (await getDoc(gameRef(code, clients.benel))).data() as GameDoc
    expect([...game.seating!].sort()).toEqual(['benel', 'jean', 'roux', 'viv'])
    expect(game.dealer).toBe(game.seating![1])

    // Table complète : Romain arrive trop tard.
    await expect(takeSeat(code, 'romain', clients.romain)).rejects.toThrow('La table est complète')
    // La partie se joue avec Jean.
    await deal(code, null, clients[game.dealer as PlayerId] ?? jean)
    game = (await getDoc(gameRef(code, clients.benel))).data() as GameDoc
    expect(game.phase).toBe('bidding')
  }, 30_000)

  it('un joueur ajouté rejoint la liste, une seule fois', async () => {
    const c = await makeClient(`concurrence-${n}-ajout`)
    const name = `Test ${Date.now() % 100000}`
    const j = await addPlayer(name, c)
    expect(j.id).toMatch(/^test-\d+$/)
    expect(j.existed).toBe(false)
    expect((await readRoster(c)).map((x) => x.id)).toContain(j.id)
    // Le même nom ne crée rien : on retrouve le joueur existant, pour le remettre dans sa liste.
    const still = await addPlayer(name, c)
    expect(still).toEqual({ id: j.id, name, existed: true })
    expect((await readRoster(c)).filter((x) => x.id === j.id)).toHaveLength(1)
  })

  it("un des quatre du départ n'est jamais recréé en base", async () => {
    const c = await makeClient(`concurrence-${n}-fondateur`)
    expect(await addPlayer('viv', c)).toEqual({ id: 'viv', name: 'Viv', existed: true })
    expect((await readRoster(c)).map((x) => x.id)).not.toContain('viv')
  })
})

describe('annulation', () => {
  it('un joueur annule : la partie passe en « annulée » pour tous, sans archive', async () => {
    const clients = await fourClients()
    const code = await newGame(clients)
    for (const p of ['roux', 'viv', 'romain'] as const) await takeSeat(code, p, clients[p])
    await deal(code, null, clients.benel)
    await cancelGame(code, 'viv', clients.viv)
    const game = (await getDoc(gameRef(code, clients.roux))).data() as GameDoc
    expect(game.phase).toBe('cancelled')
    const evts = await readEvents(code, clients.roux)
    expect(evts.at(-1)).toMatchObject({ type: 'game_cancelled', player: 'viv' })
    expect((await getDoc(archiveRef(code, clients.roux))).exists()).toBe(false)
  }, 30_000)
})

describe('temps de réflexion', () => {
  it("l'annonce porte le temps mesuré par le joueur, et rien quand il n'est pas connu", async () => {
    const clients = await fourClients()
    const code = await newGame(clients)
    for (const p of ['roux', 'viv', 'romain'] as const) await takeSeat(code, p, clients[p])
    await deal(code, null, clients.benel)
    // Placement par défaut, Benel donne : Viv parle en premier, puis Roux.
    await placeBid(code, { kind: 'pass', player: 'viv' }, clients.viv, 4321.4)
    await placeBid(code, { kind: 'pass', player: 'roux' }, clients.roux)
    const evts = await readEvents(code, clients.romain)
    const [viv, roux] = evts.filter((e) => e.type === 'bid')
    expect(viv.thinkMs).toBe(4321)
    expect('thinkMs' in roux).toBe(false)
  }, 30_000)
})

describe('coinche hors enchères', () => {
  it('une fois le contrat fixé, on ne coinche plus', async () => {
    const clients = await fourClients()
    const code = await newGame(clients)
    for (const p of ['roux', 'viv', 'romain'] as const) await takeSeat(code, p, clients[p])
    await deal(code, null, clients.benel)
    await placeBid(code, { kind: 'contract', player: 'viv', value: 80, suit: 'h' }, clients.viv)
    await placeBid(code, { kind: 'pass', player: 'roux' }, clients.roux)
    await placeBid(code, { kind: 'pass', player: 'romain' }, clients.romain)
    await placeBid(code, { kind: 'pass', player: 'benel' }, clients.benel)
    const game = (await getDoc(gameRef(code, clients.benel))).data() as GameDoc
    expect(game.phase).toBe('playing')
    await expect(placeBid(code, { kind: 'coinche', player: 'benel' }, clients.benel)).rejects.toThrow(
      'Les enchères sont closes',
    )
  }, 30_000)
})

describe('partie en 500, en blitz, puis « Rejouer »', () => {
  it('trois capots non joués finissent la partie, archivée avec ses règles ; la suivante reprend les équipes', async () => {
    const clients = await fourClients()
    const code = await createGame('benel', DEFAULT_SEATING, 'benel', clients.benel, {
      target: 500,
      blitz: true,
    })
    for (const p of ['roux', 'viv', 'romain'] as const) await takeSeat(code, p, clients[p])

    for (let dealN = 1; dealN <= 3; dealN++) {
      const before = (await getDoc(gameRef(code, clients.benel))).data() as GameDoc
      await deal(code, null, clients[before.dealer as PlayerId])
      const evts = await readEvents(code, clients.benel)
      const first = currentBidder(biddingFromEvents(evts, before.dealer, before.seating!))!
      // Toujours la même équipe (Romain et Viv) : on passe jusqu'à elle, elle annonce le capot.
      let who = first
      while (teamOfPlayer(who, before.seating!) !== 0) {
        await placeBid(code, { kind: 'pass', player: who }, clients[who])
        who = nextPlayer(who, before.seating!)
      }
      await placeBid(code, { kind: 'capot', player: who, declaration: 's' }, clients[who])
      for (let i = 0; i < 3; i++) {
        who = nextPlayer(who, before.seating!)
        await placeBid(code, { kind: 'pass', player: who }, clients[who])
      }
      const end = (await readEvents(code, clients.benel)).filter((e) => e.type === 'deal_done').at(-1)
      expect(end).toMatchObject({ blitz: true, status: 'capot' })
    }

    const finished = (await getDoc(gameRef(code, clients.benel))).data() as GameDoc
    expect(finished.phase).toBe('finished')
    const archive = (await getDoc(archiveRef(code, clients.benel))).data()
    // Première partie de la chaîne : elle est sa propre soirée.
    expect(archive).toMatchObject({ target: 500, blitz: true, evening: code })

    const nextGame = await replay(code, 'benel', clients.benel)
    expect(await replay(code, 'benel', clients.benel)).toBe(nextGame) // un seul « Rejouer »
    const fresh = (await getDoc(gameRef(nextGame, clients.benel))).data() as GameDoc
    expect(fresh.seating).toEqual(finished.seating)
    expect(fresh.dealer).toBe(nextPlayer(finished.dealer, finished.seating!))
    // « Rejouer » garde la soirée : celle de la première partie.
    expect(fresh).toMatchObject({ target: 500, blitz: true, phase: 'lobby', evening: code })
    expect(((await getDoc(gameRef(code, clients.viv))).data() as GameDoc).nextGame).toBe(nextGame)
  }, 60_000)
})
