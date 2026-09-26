/**
 * Parcours complet contre l'émulateur, à travers le vrai code de `src/firebase/game.ts` :
 * création → prise des quatre sièges → distribution → journal.
 * Lancement : npm run test:rules
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { getDoc, getDocs, orderBy, query, setDoc, updateDoc } from 'firebase/firestore'
import {
  ConcurrentWrite,
  appendEvent,
  archiveGame,
  archiveRef,
  createGame,
  deal,
  eventsRef,
  gameRef,
  moveCount,
  handRef,
  placeBid,
  playCard,
  readArchives,
  readEvents,
  signIn,
  takeSeat,
  type GameDoc,
} from '../src/firebase/game'
import { biddingFromEvents, playFromEvents } from '../src/game/replay'
import { outcome } from '../src/game/bidding'
import { currentPlayer, playableFor } from '../src/game/play'
import type { Card } from '../src/game/cards'
import { DEFAULT_SEATING, PLAYER_IDS } from '../src/game/players'
import { DECK, gatherAndCut } from '../src/game/cards'
import { dealHands } from '../src/game/deal'
import { ENGINE_VERSION } from '../src/game/rules'

let code: string

beforeAll(async () => {
  await signIn()
  // Benel crée la partie et s'y assoit dans le même geste.
  // Placement explicite : les tests s'appuient sur « Benel donne, Viv parle en premier ».
  code = await createGame('benel', DEFAULT_SEATING)
  // Un seul compte occupe les quatre sièges : suffisant pour valider la mécanique,
  // l'étanchéité entre joueurs étant couverte par firestore-rules.test.ts.
  for (const p of PLAYER_IDS.filter((p) => p !== 'benel')) await takeSeat(code, p)
  await deal(code)
}, 30_000)

describe('parcours complet', () => {
  it('crée une partie avec un code de 4 lettres', () => {
    expect(code).toMatch(/^[A-Z]{4}$/)
  })

  it('assoit les quatre joueurs et passe aux enchères', async () => {
    const game = (await getDoc(gameRef(code))).data() as GameDoc
    expect(Object.keys(game.seats).sort()).toEqual([...PLAYER_IDS].sort())
    // Un ensemble de comptes : ici un seul client tient les quatre sièges, comme les bots
    // d'un même onglet. Ce qui compte, c'est que chaque compte assis y figure.
    expect(new Set(game.seatedUids)).toEqual(new Set(Object.values(game.seats).map((s) => s!.uid)))
    expect(game.phase).toBe('bidding')
    expect(game.dealNumber).toBe(1)
  })

  it('distribue 8 cartes à chacun, soit le paquet entier', async () => {
    const all: string[] = []
    for (const p of PLAYER_IDS) {
      const cards = (await getDoc(handRef(code, p))).data()!.cards as string[]
      expect(cards).toHaveLength(8)
      all.push(...cards)
    }
    expect([...all].sort()).toEqual([...DECK].sort())
  })

  it('journalise tout, en séquence continue et sans trou', async () => {
    const snap = await getDocs(query(eventsRef(code), orderBy('seq')))
    const events = snap.docs.map((d) => d.data())

    expect(events.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6])
    expect(events.map((e) => e.type)).toEqual([
      'game_created',
      'player_joined',
      'player_joined',
      'player_joined',
      'player_joined',
      'deal_started',
    ])
  })

  it('embarque le snapshot des règles dans la partie', async () => {
    const snap = await getDocs(query(eventsRef(code), orderBy('seq')))
    const created = snap.docs[0].data()
    expect(created.engineVersion).toBe(ENGINE_VERSION)
    // Sans cette copie, une partie archivée devient ininterprétable
    // dès qu'un réglage change.
    expect(created.rules.target).toBe(1000)
    expect(created.rules.capotValue).toBe(250)
    expect(created.rules.sameDealerWhenAllPass).toBe(true)
  })
})

describe('enchères à travers le journal', () => {
  it('rejoue les enchères depuis les seuls événements et fixe le contrat', async () => {
    const game = (await getDoc(gameRef(code))).data() as GameDoc
    expect(game.phase).toBe('bidding')

    // Donneur Benel → Viv parle en premier.
    await placeBid(code, { kind: 'pass', player: 'viv' })
    await placeBid(code, { kind: 'contract', player: 'roux', value: 100, suit: 'h' })
    await placeBid(code, { kind: 'coinche', player: 'romain' })
    await placeBid(code, { kind: 'pass', player: 'roux' })

    const events = await readEvents(code)
    const state = biddingFromEvents(events, 'benel')
    expect(outcome(state)).toMatchObject({
      status: 'contract',
      taker: 'roux',
      value: 100,
      trump: 'h',
      multiplier: 2,
    })

    // Le contrat est journalisé, et la partie passe au jeu de la carte.
    const contract = events.find((e) => e.type === 'contract_set')
    expect(contract).toMatchObject({ taker: 'roux', value: 100, multiplier: 2 })
    expect(((await getDoc(gameRef(code))).data() as GameDoc).phase).toBe('playing')
  })

  it('refuse une enchère illégale sans rien écrire', async () => {
    const before = (await readEvents(code)).length
    await expect(
      placeBid(code, { kind: 'contract', player: 'benel', value: 110, suit: 's' }),
    ).rejects.toThrow()
    expect(await readEvents(code)).toHaveLength(before)
  })
})

describe('une donne complète, jouée à travers Firestore', () => {
  it('enchaîne 8 plis, décompte la donne et fait tourner le donneur', async () => {
    // On joue toujours la première carte jouable : peu importe la qualité du jeu,
    // ce qui compte est que les 32 cartes passent par les règles et par le journal.
    for (let i = 0; i < 32; i++) {
      const events = await readEvents(code)
      const state = playFromEvents(events, 'benel')!
      const player = currentPlayer(state)!
      const hand = ((await getDoc(handRef(code, player))).data()!.cards ?? []) as Card[]
      await playCard(code, player, playableFor(state, player, hand)[0])
    }

    const events = await readEvents(code)
    const tricks = events.filter((e) => e.type === 'trick_done')
    expect(tricks).toHaveLength(8)
    expect(tricks.reduce((sum, t) => sum + (t as { points: number }).points, 0)).toBe(152)

    const done = events.find((e) => e.type === 'deal_done')!
    expect(done).toBeDefined()
    const deal = done as unknown as { cardPoints: [number, number]; scores: [number, number] }
    expect(deal.cardPoints[0] + deal.cardPoints[1]).toBe(162)

    // Un seul camp marque, et il marque la valeur de l'enchère coinchée : 100 × 2.
    expect(deal.scores.filter((s) => s > 0)).toEqual([200])

    const game = (await getDoc(gameRef(code))).data() as GameDoc
    expect(game.scores[0] + game.scores[1]).toBe(200)
    expect(game.phase).toBe('scoring')
    expect(game.dealer).toBe('viv') // MAT-3 : le donneur tourne vers la gauche
  }, 60_000)

  it("aucun événement ne laisse filtrer la main d'un joueur", async () => {
    // Le journal est lisible par les quatre : rien de ce qu'il contient ne doit
    // permettre de reconstituer la main d'un adversaire.
    const events = await readEvents(code)
    const cards = events.filter((e) => e.type === 'card_played')
    expect(cards).toHaveLength(32)
    for (const e of cards) {
      const champs = Object.keys(e)
      expect(champs).not.toContain('handBefore')
      expect(champs).not.toContain('playableBefore')
      expect(champs).toEqual(
        expect.arrayContaining(['type', 'player', 'card', 'trickNumber', 'position', 'seq', 'at']),
      )
    }
  })

  it('toutes les mains sont vides à la fin de la donne', async () => {
    for (const p of PLAYER_IDS) {
      const cards = ((await getDoc(handRef(code, p))).data()!.cards ?? []) as string[]
      expect(cards).toHaveLength(0)
    }
  })

  it('DIS-2 — la donne suivante ne rebat pas : on ramasse les plis, on coupe', async () => {
    const tricks = (await readEvents(code)).flatMap((e) => (e.type === 'trick_done' ? [e.cards] : []))
    await deal(code)
    const start = [...(await readEvents(code))].reverse().find((e) => e.type === 'deal_started')!
    if (start.type !== 'deal_started') throw new Error('pas de donne')
    const expected = dealHands(gatherAndCut(tricks, start.cut), start.dealer, DEFAULT_SEATING)
    for (const p of PLAYER_IDS) {
      expect((await getDoc(handRef(code, p))).data()!.cards).toEqual(expected[p])
    }
  })
})

describe('écriture concurrente', () => {
  it('refuse un coup fondé sur un état dépassé, sans corrompre le journal', async () => {
    const before = await readEvents(code)

    await expect(
      appendEvent(code, { type: 'chat_message', player: 'viv', text: 'trop tard' }, moveCount(before) - 1),
    ).rejects.toThrow(ConcurrentWrite)

    // Rien n'a été écrit : le journal est intact.
    expect(await readEvents(code)).toHaveLength(before.length)
  })

  it("accepte le coup fondé sur l'état courant", async () => {
    const before = await readEvents(code)
    await appendEvent(code, { type: 'chat_message', player: 'viv', text: 'bien joué' }, moveCount(before))
    expect(await readEvents(code)).toHaveLength(before.length + 1)
  })

  it('une conséquence écrite entre-temps ne fait pas refuser le coup suivant', async () => {
    // Le cas réel : la quatrième carte d'un pli écrit aussi `trick_done`, et le
    // joueur suivant se voyait refuser son tour alors que rien n'avait bougé pour lui.
    const before = await readEvents(code)
    const moves = moveCount(before)

    // une conséquence quelconque s'intercale
    await appendEvent(code, {
      type: 'trick_done',
      trickNumber: 99,
      winner: 'viv',
      points: 0,
      cut: false,
      overcut: false,
    })

    // le joueur, lui, décide sur le même état de jeu : ça doit passer
    await expect(
      appendEvent(code, { type: 'chat_message', player: 'roux', text: 'à moi' }, moves),
    ).resolves.toBeGreaterThan(0)
  })

  it('une conséquence sans revendication passe malgré la bousculade', async () => {
    // Quatre clients écrivent en même temps des événements qui ne décident de rien :
    // aucun ne doit échouer, et le journal doit contenir les quatre.
    const before = await readEvents(code)
    const seqs = await Promise.all(
      PLAYER_IDS.map((p) => appendEvent(code, { type: 'chat_message', player: p, text: `moi aussi (${p})` })),
    )

    expect(new Set(seqs).size).toBe(4)
    const after = await readEvents(code)
    expect(after).toHaveLength(before.length + 4)
    // Aucun numéro de séquence n'a été écrasé
    expect(new Set(after.map((e) => e.seq)).size).toBe(after.length)
  })
})

describe('archive de fin de partie', () => {
  it('descelle les donnes, calcule la force des mains et dépose le condensé', async () => {
    // On force la fin de partie sans jouer douze donnes : la phase déclenche le descellement.
    // Les règles veulent un numéro de journal à chaque écriture, des scores qui montent d'au
    // plus une donne, et un objectif dépassé pour finir : deux pas.
    const g = (await getDoc(gameRef(code))).data() as GameDoc
    await updateDoc(gameRef(code), { eventSeq: g.eventSeq + 1, scores: [g.scores[0] + 510, g.scores[1]] })
    await updateDoc(gameRef(code), {
      eventSeq: g.eventSeq + 2,
      phase: 'finished',
      scores: [g.scores[0] + 1010, g.scores[1]],
    })
    const archive = await archiveGame(code, DEFAULT_SEATING)

    expect(archive.code).toBe(code)
    expect(archive.seating).toEqual(DEFAULT_SEATING)
    expect(archive.deals).toBe(1)

    // Le preneur de la donne jouée plus haut a bien sa prise, avec sa force de main
    const takes = PLAYER_IDS.flatMap((p) => archive.players[p].detail)
    expect(takes).toHaveLength(1)
    expect(takes[0].value).toBe(100)
    // La main a été descellée et mesurée. Sa valeur dépend du hasard de la donne — le test
    // annonce 100 quelle que soit la main — et peut valoir 0 : c'est `null` qui trahirait
    // une donne restée scellée.
    expect(takes[0].strength).toEqual(expect.any(Number))
  }, 30_000)

  it('le condensé est relu par la page globale', async () => {
    const archives = await readArchives()
    expect(archives.some((a) => a.code === code)).toBe(true)
  })

  it('une archive déposée ne peut plus être retouchée', async () => {
    await expect(setDoc(archiveRef(code), { code, dummy: true })).rejects.toThrow()
  })
})
