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
  ConcurrentWrite, type GameDoc, createGame, deal, gameRef, readEvents, readJournal, signIn, takeSeat,
} from '../src/firebase/partie'
import { DEFAULT_SEATING, PLAYER_IDS, type PlayerId } from '../src/game/players'
import { addPlayer, readRoster } from '../src/firebase/joueurs'

let n = 0
/** Quatre sessions anonymes indépendantes, une par joueur. */
async function quatreClients(): Promise<Record<PlayerId, Client>> {
  n += 1
  const clients = {} as Record<PlayerId, Client>
  for (const p of PLAYER_IDS) {
    clients[p] = await makeClient(`concurrence-${n}-${p}`)
    await signIn(clients[p])
  }
  return clients
}

/** Partie créée par Benel, donneur Benel (placement par défaut : Viv parle en premier). */
async function nouvellePartie(clients: Record<PlayerId, Client>): Promise<string> {
  return createGame('benel', DEFAULT_SEATING, 'benel', clients.benel)
}

describe('arrivées simultanées', () => {
  it('trois joueurs qui rejoignent au même instant sont tous assis', async () => {
    const clients = await quatreClients()
    const code = await nouvellePartie(clients)

    await Promise.all(
      (['roux', 'viv', 'romain'] as const).map((p) => takeSeat(code, p, clients[p])),
    )

    const game = (await getDoc(gameRef(code, clients.benel))).data() as GameDoc
    expect(Object.keys(game.seats).sort()).toEqual([...PLAYER_IDS].sort())
    const uids = await Promise.all(PLAYER_IDS.map((p) => signIn(clients[p])))
    expect(new Set(game.seatedUids)).toEqual(new Set(uids))
  }, 30_000)
})

describe('distribution', () => {
  it('deux distributions simultanées : une seule passe, et la partie reste cohérente', async () => {
    const clients = await quatreClients()
    const code = await nouvellePartie(clients)
    for (const p of ['roux', 'viv', 'romain'] as const) await takeSeat(code, p, clients[p])

    const issues = await Promise.allSettled([deal(code, null, clients.benel), deal(code, null, clients.benel)])

    // L'une réussit, l'autre est refusée proprement — pas d'erreur Firestore brute.
    expect(issues.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const refus = issues.find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect(refus.reason).toBeInstanceOf(ConcurrentWrite)

    const game = (await getDoc(gameRef(code, clients.benel))).data() as GameDoc
    expect(game.phase).toBe('encheres')
    expect(game.dealNumber).toBe(1)
    const events = await readEvents(code, clients.benel)
    expect(events.filter((e) => e.type === 'donne_commencee')).toHaveLength(1)
    // Le compteur suit le journal : aucune réécriture n'a fait reculer eventSeq.
    expect(game.eventSeq).toBe(events.length)
  }, 30_000)
})

describe('lecture incrémentale du journal', () => {
  it('deux lectures simultanées ne dupliquent aucun événement', async () => {
    const clients = await quatreClients()
    const code = await nouvellePartie(clients)
    for (const p of ['roux', 'viv', 'romain'] as const) await takeSeat(code, p, clients[p])

    const [a, b] = await Promise.all([readJournal(code, clients.viv), readJournal(code, clients.viv)])
    const complet = await readEvents(code, clients.viv)
    expect(a.map((e) => e.seq)).toEqual(complet.map((e) => e.seq))
    expect(b.map((e) => e.seq)).toEqual(complet.map((e) => e.seq))

    // Après de nouveaux événements, seul le complément est ajouté, dans l'ordre.
    await deal(code, null, clients.benel)
    const apres = await readJournal(code, clients.viv)
    expect(apres.map((e) => e.seq)).toEqual((await readEvents(code, clients.viv)).map((e) => e.seq))
    expect(new Set(apres.map((e) => e.seq)).size).toBe(apres.length)
  }, 30_000)
})

describe('table formée par les arrivées', () => {
  it('sans placement imposé, le quatrième arrivé fixe la table entre les présents', async () => {
    const clients = await quatreClients()
    const jean = await makeClient(`concurrence-${n}-jean`)
    await signIn(jean)
    // Jean remplace Romain : la table se forme avec ceux qui viennent, pas avec les quatre du départ.
    const code = await createGame('benel', null, undefined, clients.benel)
    let game = (await getDoc(gameRef(code, clients.benel))).data() as GameDoc
    expect(game.seating).toBeNull()

    await Promise.all([takeSeat(code, 'roux', clients.roux), takeSeat(code, 'viv', clients.viv), takeSeat(code, 'jean', jean)])
    game = (await getDoc(gameRef(code, clients.benel))).data() as GameDoc
    expect([...game.seating!].sort()).toEqual(['benel', 'jean', 'roux', 'viv'])
    expect(game.dealer).toBe(game.seating![1])

    // Table complète : Romain arrive trop tard.
    await expect(takeSeat(code, 'romain', clients.romain)).rejects.toThrow('La table est complète')
    // La partie se joue avec Jean.
    await deal(code, null, clients[game.dealer as PlayerId] ?? jean)
    game = (await getDoc(gameRef(code, clients.benel))).data() as GameDoc
    expect(game.phase).toBe('encheres')
  }, 30_000)

  it('un joueur ajouté rejoint la liste, une seule fois', async () => {
    const c = await makeClient(`concurrence-${n}-ajout`)
    const nom = `Test ${Date.now() % 100000}`
    const j = await addPlayer(nom, c)
    expect(j.id).toMatch(/^test-\d+$/)
    expect((await readRoster(c)).map((x) => x.id)).toContain(j.id)
    await expect(addPlayer(nom, c)).rejects.toThrow('existe déjà')
  })
})
