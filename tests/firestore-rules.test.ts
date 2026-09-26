/**
 * Tests des règles Firestore sur l'émulateur.
 *
 * Deux objectifs : qu'un joueur ne puisse pas lire la main d'un autre, et qu'un inconnu ou
 * un joueur qui bricole depuis la console ne puisse ni usurper un siège, ni réécrire la
 * partie, ni détruire des données. Chaque « attaque » de l'audit du 25/09 a son test.
 *
 * Lancement : npm run test:rules
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  type Firestore,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { DECK, shuffle } from '../src/game/cards'
import { dealHands } from '../src/game/deal'
import { DEFAULT_SEATING } from '../src/game/players'

let env: RulesTestEnvironment
const CODE = 'ABCD'

/** Chaque joueur occupe un siège via un compte anonyme (uid). */
const ROSTER = ['benel', 'roux', 'viv', 'romain'] as const
const UID: Record<string, string> = {
  benel: 'uid-b',
  roux: 'uid-r',
  viv: 'uid-v',
  romain: 'uid-ro',
}
/** Une partie en cours d'enchères, donne 1 : Benel a distribué. */
const GAME = {
  seats: Object.fromEntries(ROSTER.map((p) => [p, { uid: UID[p] }])),
  seatedUids: ROSTER.map((p) => UID[p]),
  seating: DEFAULT_SEATING,
  dealer: 'benel',
  phase: 'bidding',
  dealNumber: 1,
  scores: [0, 0],
  eventSeq: 5,
  moveSeq: 0,
  creatorId: 'romain',
}

const game = (db: Firestore) => doc(db, 'games', CODE)
const hand = (db: Firestore, p: string) => doc(db, 'games', CODE, 'hands', p)
const eventDoc = (db: Firestore, id: string) => doc(db, 'games', CODE, 'events', id)

/** Réécrit la partie sans passer par les règles : l'état de départ d'un test. */
const placeCard = (data: Record<string, unknown>) =>
  env.withSecurityRulesDisabled((ctx) => setDoc(game(ctx.firestore()), data))

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-coinche',
    firestore: {
      rules: (await import('node:fs')).readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  })
})

afterAll(() => env.cleanup())

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(game(db), GAME)
    for (const pid of ROSTER) await setDoc(hand(db, pid), { cards: ['As', 'Ks', 'Qs'] })
    await setDoc(doc(db, 'games', CODE, 'deals', '1'), { hands: {} })
  })
})

const as = (uid: string) => env.authenticatedContext(uid).firestore()

describe('mains — étanchéité', () => {
  it('Roux lit sa propre main', async () => {
    await assertSucceeds(getDoc(hand(as(UID.roux), 'roux')))
  })

  it('Roux NE PEUT PAS lire la main de Viv', async () => {
    await assertFails(getDoc(hand(as(UID.roux), 'viv')))
  })

  it('un visiteur non authentifié ne lit aucune main', async () => {
    await assertFails(getDoc(hand(env.unauthenticatedContext().firestore(), 'roux')))
  })

  it("un compte qui n'occupe aucun siège ne lit rien", async () => {
    await assertFails(getDoc(hand(as('uid-inconnu'), 'romain')))
  })

  it("en posant une carte, on la retire de sa main — et c'est tout", async () => {
    await assertSucceeds(updateDoc(hand(as(UID.roux), 'roux'), { cards: ['As', 'Ks'] }))
  })

  it('on ne se donne pas de cartes', async () => {
    await assertFails(updateDoc(hand(as(UID.roux), 'roux'), { cards: ['As', 'Ks', 'Qs', 'Js'] }))
    await assertFails(updateDoc(hand(as(UID.roux), 'roux'), { cards: ['Js', 'Ks'] }))
  })

  it("personne n'écrit la main d'un autre hors distribution, pas même le donneur", async () => {
    await assertFails(updateDoc(hand(as(UID.roux), 'viv'), { cards: ['As'] }))
    await assertFails(setDoc(hand(as(UID.benel), 'roux'), { cards: ['7h'] }))
  })
})

describe('distribution', () => {
  /** La distribution telle que l'écrit l'app : les mains et la partie, dans la même écriture. */
  async function dealIt(uid: string, dealNumber: number) {
    const db = as(uid)
    const hands = dealHands(shuffle([...DECK]), 'benel', DEFAULT_SEATING)
    const batch = writeBatch(db)
    batch.update(game(db), { dealNumber, phase: 'bidding', eventSeq: 6 })
    batch.set(eventDoc(db, 'd'), { type: 'deal_started', dealNumber, dealer: 'benel', cut: 3, seq: 6 })
    batch.set(doc(db, 'games', CODE, 'deals', String(dealNumber)), { hands, cut: 3 })
    for (const p of ROSTER) batch.set(hand(db, p), { cards: hands[p] })
    await batch.commit()
    return hands
  }

  beforeEach(() => placeCard({ ...GAME, phase: 'scoring' }))

  it('le donneur écrit les quatre mains en ouvrant la donne ; chacun ne lit que la sienne', async () => {
    const hands = await assertSucceeds(dealIt(UID.benel, 2))
    const seen: string[] = []
    for (const pid of ROSTER) {
      const cards = (await getDoc(hand(as(UID[pid]), pid))).data()!.cards as string[]
      expect(cards).toEqual(hands[pid])
      seen.push(...cards)
      for (const other of ROSTER.filter((p) => p !== pid)) {
        await assertFails(getDoc(hand(as(UID[pid]), other)))
      }
    }
    expect([...seen].sort()).toEqual([...DECK].sort())
  })

  it('un autre que le donneur ne distribue pas', async () => {
    await assertFails(dealIt(UID.roux, 2))
  })

  it('le donneur ne réécrit pas les mains sans ouvrir de donne', async () => {
    await assertFails(setDoc(hand(as(UID.benel), 'roux'), { cards: ['7h'] }))
  })
})

describe("donne distribuée — scellée jusqu'à la fin", () => {
  it('illisible pendant la partie, même par un joueur', async () => {
    await assertFails(getDoc(doc(as(UID.benel), 'games', CODE, 'deals', '1')))
  })

  it('lisible une fois la partie terminée', async () => {
    await placeCard({ ...GAME, phase: 'finished' })
    await assertSucceeds(getDoc(doc(as(UID.benel), 'games', CODE, 'deals', '1')))
  })
})

describe('journal — append-only', () => {
  /** Un événement tel que l'écrit l'app : le numéro alloué par la partie, dans la même écriture. */
  function write(uid: string, event: Record<string, unknown>, seq = GAME.eventSeq + 1) {
    const db = as(uid)
    const batch = writeBatch(db)
    batch.update(game(db), { eventSeq: seq })
    batch.set(eventDoc(db, `e${seq}`), { ...event, seq })
    return batch.commit()
  }

  it('un joueur ajoute un événement en son nom', async () => {
    await assertSucceeds(
      write(UID.benel, { type: 'bid', player: 'benel', entry: { kind: 'pass', player: 'benel' } }),
    )
  })

  it("mais pas au nom d'un autre", async () => {
    await assertFails(
      write(UID.benel, { type: 'bid', player: 'roux', entry: { kind: 'pass', player: 'roux' } }),
    )
  })

  it('ni sous un numéro que la partie ne lui a pas alloué', async () => {
    await assertFails(setDoc(eventDoc(as(UID.benel), 'x'), { type: 'trick_done', seq: 99 }))
  })

  it('personne ne peut modifier ni effacer un événement écrit', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(eventDoc(ctx.firestore(), '1'), { type: 'bid', seq: 1 }),
    )
    await assertFails(setDoc(eventDoc(as(UID.benel), '1'), { type: 'triche', seq: 1 }))
    await assertFails(deleteDoc(eventDoc(as(UID.benel), '1')))
  })

  it('un étranger à la partie ne peut rien écrire', async () => {
    await assertFails(write('uid-intrus', { type: 'trick_done' }))
  })
})

describe('la partie — ce qu’un joueur peut changer', () => {
  it('suivre le jeu : numéro du journal, phase, scores qui montent', async () => {
    await assertSucceeds(
      updateDoc(game(as(UID.viv)), { eventSeq: 6, moveSeq: 1, phase: 'playing', scores: [0, 90] }),
    )
  })

  it('pas finir la partie sans objectif dépassé (pour desceller la donne en cours)', async () => {
    await assertFails(updateDoc(game(as(UID.viv)), { eventSeq: 6, phase: 'finished' }))
  })

  it('pas baisser un score, ni en ajouter plus que ne vaut une donne', async () => {
    await placeCard({ ...GAME, scores: [500, 300] })
    await assertFails(updateDoc(game(as(UID.viv)), { eventSeq: 6, scores: [400, 300] }))
    await assertFails(updateDoc(game(as(UID.viv)), { eventSeq: 6, scores: [1600, 300] }))
  })

  it('pas vider le document, ni toucher aux sièges ou au placement en cours de partie', async () => {
    await assertFails(setDoc(game(as(UID.viv)), {}))
    await assertFails(
      updateDoc(game(as(UID.viv)), { eventSeq: 6, seating: ['viv', 'roux', 'benel', 'romain'] }),
    )
  })

  it('un étranger ne change rien', async () => {
    await assertFails(updateDoc(game(as('uid-intrus')), { eventSeq: 6, phase: 'playing' }))
  })

  it('personne ne supprime une partie', async () => {
    await assertFails(deleteDoc(game(as(UID.viv))))
  })

  it('« Rejouer » note la partie suivante une fois, sur une partie finie', async () => {
    await placeCard({ ...GAME, phase: 'finished', scores: [1010, 300] })
    await assertSucceeds(updateDoc(game(as(UID.viv)), { nextGame: 'WXYZ' }))
    await assertFails(updateDoc(game(as(UID.roux)), { nextGame: 'QRST' }))
  })
})

describe('création de partie', () => {
  const fresh = (uid: string) => ({
    seats: { romain: { uid } },
    seatedUids: [uid],
    seating: null,
    dealer: 'romain',
    phase: 'lobby',
    dealNumber: 0,
    scores: [0, 0],
    eventSeq: 0,
    moveSeq: 0,
    creatorId: 'romain',
  })

  it('son créateur seul assis, rien de joué', async () => {
    await assertSucceeds(setDoc(doc(as(UID.romain), 'games', 'NEUF'), fresh(UID.romain)))
  })

  it("pas au nom d'un autre, ni déjà commencée", async () => {
    await assertFails(setDoc(doc(as(UID.viv), 'games', 'NEUF'), fresh(UID.romain)))
    await assertFails(
      setDoc(doc(as(UID.romain), 'games', 'NEUF'), { ...fresh(UID.romain), scores: [900, 0] }),
    )
  })

  it('jamais par-dessus une partie existante', async () => {
    await assertFails(setDoc(game(as(UID.romain)), fresh(UID.romain)))
  })
})

describe('prise de siège', () => {
  const lobby = {
    ...GAME,
    seats: { benel: { uid: UID.benel } },
    seatedUids: [UID.benel],
    seating: null,
    phase: 'lobby',
    dealNumber: 0,
  }
  beforeEach(() => placeCard(lobby))

  it('un joueur pas encore assis prend un siège libre', async () => {
    await assertSucceeds(
      updateDoc(game(as(UID.roux)), {
        'seats.roux': { uid: UID.roux },
        seatedUids: [UID.benel, UID.roux],
        lastSeat: 'roux',
      }),
    )
  })

  it("mais ne déloge personne en s'asseyant", async () => {
    await assertFails(
      updateDoc(game(as(UID.roux)), {
        'seats.benel': { uid: UID.roux },
        seatedUids: [UID.benel, UID.roux],
        lastSeat: 'benel',
      }),
    )
    await assertFails(
      updateDoc(game(as(UID.roux)), {
        'seats.roux': { uid: UID.roux },
        seatedUids: [UID.roux], // Benel a disparu
        lastSeat: 'roux',
      }),
    )
  })

  it("ni pour quelqu'un d'autre", async () => {
    await assertFails(
      updateDoc(game(as(UID.roux)), {
        'seats.viv': { uid: UID.viv },
        seatedUids: [UID.benel, UID.viv],
        lastSeat: 'viv',
      }),
    )
  })
})

describe('sièges en cours de partie : l’audit du 25/09', () => {
  it("un inconnu ne prend pas le siège d'un joueur (pour lire sa main)", async () => {
    await assertFails(
      updateDoc(game(as('uid-intrus')), {
        'seats.viv': { uid: 'uid-intrus' },
        seatedUids: [...GAME.seatedUids, 'uid-intrus'],
        lastSeat: 'viv',
      }),
    )
  })

  it('un joueur assis ne prend pas non plus celui de son voisin', async () => {
    await assertFails(
      updateDoc(game(as(UID.roux)), {
        'seats.viv': { uid: UID.roux },
        lastSeat: 'viv',
      }),
    )
  })

  it("un joueur assis remplace un absent par un bot, qui garde le compte de l'absent", async () => {
    await assertSucceeds(
      updateDoc(game(as(UID.roux)), {
        'seats.viv': { uid: UID.roux, bot: true, level: 'basic', replaced: true, formerUid: UID.viv },
        lastSeat: 'viv',
      }),
    )
    // Seul le compte de Viv reprend sa place.
    await assertFails(
      updateDoc(game(as('uid-intrus')), {
        'seats.viv': { uid: 'uid-intrus', botAssisted: true },
        seatedUids: [...GAME.seatedUids, 'uid-intrus'],
        lastSeat: 'viv',
      }),
    )
    await assertSucceeds(
      updateDoc(game(as(UID.viv)), { 'seats.viv': { uid: UID.viv, botAssisted: true }, lastSeat: 'viv' }),
    )
  })

  it("un inconnu ne s'empare pas d'un bot ; un joueur assis reprend un bot muet", async () => {
    await placeCard({
      ...GAME,
      seats: { ...GAME.seats, viv: { uid: 'uid-hote-disparu', bot: true, level: 'expert' } },
    })
    await assertFails(
      updateDoc(game(as('uid-intrus')), {
        'seats.viv': { uid: 'uid-intrus', bot: true, level: 'expert' },
        seatedUids: [...GAME.seatedUids, 'uid-intrus'],
        lastSeat: 'viv',
      }),
    )
    await assertSucceeds(
      updateDoc(game(as(UID.roux)), {
        'seats.viv': { uid: UID.roux, bot: true, level: 'expert' },
        lastSeat: 'viv',
      }),
    )
  })
})

describe('table complétée par le quatrième arrivé', () => {
  const threeSeated = {
    ...GAME,
    seats: { benel: { uid: UID.benel }, roux: { uid: UID.roux }, viv: { uid: UID.viv } },
    seatedUids: [UID.benel, UID.roux, UID.viv],
    seating: null,
    phase: 'lobby',
    dealNumber: 0,
  }
  const arrival = {
    'seats.romain': { uid: UID.romain },
    seatedUids: [...threeSeated.seatedUids, UID.romain],
    lastSeat: 'romain',
    seating: DEFAULT_SEATING,
    dealer: DEFAULT_SEATING[1],
  }

  it("fixe le placement et le donneur en s'asseyant", async () => {
    await placeCard(threeSeated)
    await assertSucceeds(updateDoc(game(as(UID.romain)), arrival))
  })

  it('mais ne peut plus changer un placement déjà fixé', async () => {
    await placeCard({ ...threeSeated, seating: ['viv', 'roux', 'benel', 'romain'] })
    await assertFails(updateDoc(game(as(UID.romain)), arrival))
  })

  it("et un cinquième ne s'assied pas", async () => {
    await placeCard(GAME)
    await assertFails(
      updateDoc(game(as('uid-cinq')), {
        'seats.jean': { uid: 'uid-cinq' },
        seatedUids: [...GAME.seatedUids, 'uid-cinq'],
        lastSeat: 'jean',
      }),
    )
  })
})

describe('archives', () => {
  const archive = { code: CODE, scores: [1010, 300] }

  it('pas avant la fin de la partie (une fausse archive bloquerait la vraie)', async () => {
    await assertFails(setDoc(doc(as(UID.viv), 'archives', CODE), archive))
  })

  it('une fois la partie finie, par un joueur, une seule fois', async () => {
    await placeCard({ ...GAME, phase: 'finished', scores: [1010, 300] })
    await assertFails(setDoc(doc(as('uid-intrus'), 'archives', CODE), archive))
    await assertSucceeds(setDoc(doc(as(UID.viv), 'archives', CODE), archive))
    await assertFails(setDoc(doc(as(UID.roux), 'archives', CODE), { ...archive, scores: [0, 2000] }))
  })
})

describe('joueurs ajoutés', () => {
  const newPlayer = (name: string) => ({ name, createdAt: serverTimestamp() })

  it('tout joueur connecté peut en ajouter un', async () => {
    await assertSucceeds(setDoc(doc(as(UID.viv), 'players', 'jean-eric'), newPlayer('Jean-Éric')))
  })

  it('refuse un identifiant mal formé ou un nom trop long', async () => {
    await assertFails(setDoc(doc(as(UID.viv), 'players', 'Jean Éric'), newPlayer('Jean Éric')))
    await assertFails(setDoc(doc(as(UID.viv), 'players', 'long'), newPlayer('x'.repeat(21))))
  })

  it('refuse un identifiant de bot', async () => {
    await assertFails(setDoc(doc(as(UID.viv), 'players', 'bot-basic-1'), newPlayer('Bot')))
  })

  it('refuse un champ en trop', async () => {
    await assertFails(setDoc(doc(as(UID.viv), 'players', 'jean'), { ...newPlayer('Jean'), admin: true }))
  })

  it('ne se modifie ni ne se supprime', async () => {
    await assertSucceeds(setDoc(doc(as(UID.viv), 'players', 'jean'), newPlayer('Jean')))
    await assertFails(setDoc(doc(as(UID.roux), 'players', 'jean'), newPlayer('Jeannot')))
    await assertFails(deleteDoc(doc(as(UID.roux), 'players', 'jean')))
  })

  it('refuse un anonyme non connecté', async () => {
    await assertFails(
      setDoc(doc(env.unauthenticatedContext().firestore(), 'players', 'jean'), newPlayer('Jean')),
    )
  })
})
