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
const PARTIE = {
  seats: Object.fromEntries(ROSTER.map((p) => [p, { uid: UID[p] }])),
  seatedUids: ROSTER.map((p) => UID[p]),
  seating: DEFAULT_SEATING,
  dealer: 'benel',
  phase: 'encheres',
  dealNumber: 1,
  scores: [0, 0],
  eventSeq: 5,
  moveSeq: 0,
  createur: 'romain',
}

const partie = (db: Firestore) => doc(db, 'parties', CODE)
const main = (db: Firestore, p: string) => doc(db, 'parties', CODE, 'mains', p)
const evenement = (db: Firestore, id: string) => doc(db, 'parties', CODE, 'evenements', id)

/** Réécrit la partie sans passer par les règles : l'état de départ d'un test. */
const poser = (data: Record<string, unknown>) =>
  env.withSecurityRulesDisabled((ctx) => setDoc(partie(ctx.firestore()), data))

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
    await setDoc(partie(db), PARTIE)
    for (const pid of ROSTER) await setDoc(main(db, pid), { cards: ['As', 'Ks', 'Qs'] })
    await setDoc(doc(db, 'parties', CODE, 'donne', '1'), { hands: {} })
  })
})

const as = (uid: string) => env.authenticatedContext(uid).firestore()

describe('mains — étanchéité', () => {
  it('Roux lit sa propre main', async () => {
    await assertSucceeds(getDoc(main(as(UID.roux), 'roux')))
  })

  it('Roux NE PEUT PAS lire la main de Viv', async () => {
    await assertFails(getDoc(main(as(UID.roux), 'viv')))
  })

  it('un visiteur non authentifié ne lit aucune main', async () => {
    await assertFails(getDoc(main(env.unauthenticatedContext().firestore(), 'roux')))
  })

  it("un compte qui n'occupe aucun siège ne lit rien", async () => {
    await assertFails(getDoc(main(as('uid-inconnu'), 'romain')))
  })

  it("en posant une carte, on la retire de sa main — et c'est tout", async () => {
    await assertSucceeds(updateDoc(main(as(UID.roux), 'roux'), { cards: ['As', 'Ks'] }))
  })

  it('on ne se donne pas de cartes', async () => {
    await assertFails(updateDoc(main(as(UID.roux), 'roux'), { cards: ['As', 'Ks', 'Qs', 'Js'] }))
    await assertFails(updateDoc(main(as(UID.roux), 'roux'), { cards: ['Js', 'Ks'] }))
  })

  it("personne n'écrit la main d'un autre hors distribution, pas même le donneur", async () => {
    await assertFails(updateDoc(main(as(UID.roux), 'viv'), { cards: ['As'] }))
    await assertFails(setDoc(main(as(UID.benel), 'roux'), { cards: ['7h'] }))
  })
})

describe('distribution', () => {
  /** La distribution telle que l'écrit l'app : les mains et la partie, dans la même écriture. */
  async function distribuer(uid: string, dealNumber: number) {
    const db = as(uid)
    const hands = dealHands(shuffle([...DECK]), 'benel', DEFAULT_SEATING)
    const lot = writeBatch(db)
    lot.update(partie(db), { dealNumber, phase: 'encheres', eventSeq: 6 })
    lot.set(evenement(db, 'd'), { type: 'donne_commencee', dealNumber, dealer: 'benel', cut: 3, seq: 6 })
    lot.set(doc(db, 'parties', CODE, 'donne', String(dealNumber)), { hands, cut: 3 })
    for (const p of ROSTER) lot.set(main(db, p), { cards: hands[p] })
    await lot.commit()
    return hands
  }

  beforeEach(() => poser({ ...PARTIE, phase: 'decompte' }))

  it('le donneur écrit les quatre mains en ouvrant la donne ; chacun ne lit que la sienne', async () => {
    const hands = await assertSucceeds(distribuer(UID.benel, 2))
    const seen: string[] = []
    for (const pid of ROSTER) {
      const cards = (await getDoc(main(as(UID[pid]), pid))).data()!.cards as string[]
      expect(cards).toEqual(hands[pid])
      seen.push(...cards)
      for (const other of ROSTER.filter((p) => p !== pid)) {
        await assertFails(getDoc(main(as(UID[pid]), other)))
      }
    }
    expect([...seen].sort()).toEqual([...DECK].sort())
  })

  it('un autre que le donneur ne distribue pas', async () => {
    await assertFails(distribuer(UID.roux, 2))
  })

  it('le donneur ne réécrit pas les mains sans ouvrir de donne', async () => {
    await assertFails(setDoc(main(as(UID.benel), 'roux'), { cards: ['7h'] }))
  })
})

describe("donne distribuée — scellée jusqu'à la fin", () => {
  it('illisible pendant la partie, même par un joueur', async () => {
    await assertFails(getDoc(doc(as(UID.benel), 'parties', CODE, 'donne', '1')))
  })

  it('lisible une fois la partie terminée', async () => {
    await poser({ ...PARTIE, phase: 'terminee' })
    await assertSucceeds(getDoc(doc(as(UID.benel), 'parties', CODE, 'donne', '1')))
  })
})

describe('journal — append-only', () => {
  /** Un événement tel que l'écrit l'app : le numéro alloué par la partie, dans la même écriture. */
  function ecrire(uid: string, event: Record<string, unknown>, seq = PARTIE.eventSeq + 1) {
    const db = as(uid)
    const lot = writeBatch(db)
    lot.update(partie(db), { eventSeq: seq })
    lot.set(evenement(db, `e${seq}`), { ...event, seq })
    return lot.commit()
  }

  it('un joueur ajoute un événement en son nom', async () => {
    await assertSucceeds(
      ecrire(UID.benel, { type: 'enchere', player: 'benel', entry: { kind: 'passe', player: 'benel' } }),
    )
  })

  it("mais pas au nom d'un autre", async () => {
    await assertFails(
      ecrire(UID.benel, { type: 'enchere', player: 'roux', entry: { kind: 'passe', player: 'roux' } }),
    )
  })

  it('ni sous un numéro que la partie ne lui a pas alloué', async () => {
    await assertFails(setDoc(evenement(as(UID.benel), 'x'), { type: 'pli_termine', seq: 99 }))
  })

  it('personne ne peut modifier ni effacer un événement écrit', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(evenement(ctx.firestore(), '1'), { type: 'enchere', seq: 1 }),
    )
    await assertFails(setDoc(evenement(as(UID.benel), '1'), { type: 'triche', seq: 1 }))
    await assertFails(deleteDoc(evenement(as(UID.benel), '1')))
  })

  it('un étranger à la partie ne peut rien écrire', async () => {
    await assertFails(ecrire('uid-intrus', { type: 'pli_termine' }))
  })
})

describe('la partie — ce qu’un joueur peut changer', () => {
  it('suivre le jeu : numéro du journal, phase, scores qui montent', async () => {
    await assertSucceeds(
      updateDoc(partie(as(UID.viv)), { eventSeq: 6, moveSeq: 1, phase: 'jeu', scores: [0, 90] }),
    )
  })

  it('pas finir la partie sans objectif dépassé (pour desceller la donne en cours)', async () => {
    await assertFails(updateDoc(partie(as(UID.viv)), { eventSeq: 6, phase: 'terminee' }))
  })

  it('pas baisser un score, ni en ajouter plus que ne vaut une donne', async () => {
    await poser({ ...PARTIE, scores: [500, 300] })
    await assertFails(updateDoc(partie(as(UID.viv)), { eventSeq: 6, scores: [400, 300] }))
    await assertFails(updateDoc(partie(as(UID.viv)), { eventSeq: 6, scores: [1600, 300] }))
  })

  it('pas vider le document, ni toucher aux sièges ou au placement en cours de partie', async () => {
    await assertFails(setDoc(partie(as(UID.viv)), {}))
    await assertFails(
      updateDoc(partie(as(UID.viv)), { eventSeq: 6, seating: ['viv', 'roux', 'benel', 'romain'] }),
    )
  })

  it('un étranger ne change rien', async () => {
    await assertFails(updateDoc(partie(as('uid-intrus')), { eventSeq: 6, phase: 'jeu' }))
  })

  it('personne ne supprime une partie', async () => {
    await assertFails(deleteDoc(partie(as(UID.viv))))
  })

  it('« Rejouer » note la partie suivante une fois, sur une partie finie', async () => {
    await poser({ ...PARTIE, phase: 'terminee', scores: [1010, 300] })
    await assertSucceeds(updateDoc(partie(as(UID.viv)), { suivante: 'WXYZ' }))
    await assertFails(updateDoc(partie(as(UID.roux)), { suivante: 'QRST' }))
  })

  it('après « Rejouer », les équipes changent avant que tout le monde soit revenu', async () => {
    // Le placement est connu dès la création ; seul Romain est déjà assis.
    await poser({
      ...PARTIE,
      seats: { romain: { uid: UID.romain } },
      seatedUids: [UID.romain],
      phase: 'lobby',
      dealNumber: 0,
    })
    const autre = ['romain', 'viv', 'benel', 'roux']
    await assertSucceeds(updateDoc(partie(as(UID.romain)), { eventSeq: 6, seating: autre, dealer: autre[1] }))
    // Mais pas avec un joueur qui n'était pas de la partie.
    await poser({
      ...PARTIE,
      seats: { romain: { uid: UID.romain } },
      seatedUids: [UID.romain],
      phase: 'lobby',
      dealNumber: 0,
    })
    const intrus = ['romain', 'viv', 'jean', 'roux']
    await assertFails(updateDoc(partie(as(UID.romain)), { eventSeq: 6, seating: intrus, dealer: intrus[1] }))
  })
})

describe('création de partie', () => {
  const neuve = (uid: string) => ({
    seats: { romain: { uid } },
    seatedUids: [uid],
    seating: null,
    dealer: 'romain',
    phase: 'lobby',
    dealNumber: 0,
    scores: [0, 0],
    eventSeq: 0,
    moveSeq: 0,
    createur: 'romain',
  })

  it('son créateur seul assis, rien de joué', async () => {
    await assertSucceeds(setDoc(doc(as(UID.romain), 'parties', 'NEUF'), neuve(UID.romain)))
  })

  it("pas au nom d'un autre, ni déjà commencée", async () => {
    await assertFails(setDoc(doc(as(UID.viv), 'parties', 'NEUF'), neuve(UID.romain)))
    await assertFails(
      setDoc(doc(as(UID.romain), 'parties', 'NEUF'), { ...neuve(UID.romain), scores: [900, 0] }),
    )
  })

  it('jamais par-dessus une partie existante', async () => {
    await assertFails(setDoc(partie(as(UID.romain)), neuve(UID.romain)))
  })
})

describe('prise de siège', () => {
  const salon = {
    ...PARTIE,
    seats: { benel: { uid: UID.benel } },
    seatedUids: [UID.benel],
    seating: null,
    phase: 'lobby',
    dealNumber: 0,
  }
  beforeEach(() => poser(salon))

  it('un joueur pas encore assis prend un siège libre', async () => {
    await assertSucceeds(
      updateDoc(partie(as(UID.roux)), {
        'seats.roux': { uid: UID.roux },
        seatedUids: [UID.benel, UID.roux],
        dernierSiege: 'roux',
      }),
    )
  })

  it("mais ne déloge personne en s'asseyant", async () => {
    await assertFails(
      updateDoc(partie(as(UID.roux)), {
        'seats.benel': { uid: UID.roux },
        seatedUids: [UID.benel, UID.roux],
        dernierSiege: 'benel',
      }),
    )
    await assertFails(
      updateDoc(partie(as(UID.roux)), {
        'seats.roux': { uid: UID.roux },
        seatedUids: [UID.roux], // Benel a disparu
        dernierSiege: 'roux',
      }),
    )
  })

  it("ni pour quelqu'un d'autre", async () => {
    await assertFails(
      updateDoc(partie(as(UID.roux)), {
        'seats.viv': { uid: UID.viv },
        seatedUids: [UID.benel, UID.viv],
        dernierSiege: 'viv',
      }),
    )
  })
})

describe('sièges en cours de partie : l’audit du 25/09', () => {
  it("un inconnu ne prend pas le siège d'un joueur (pour lire sa main)", async () => {
    await assertFails(
      updateDoc(partie(as('uid-intrus')), {
        'seats.viv': { uid: 'uid-intrus' },
        seatedUids: [...PARTIE.seatedUids, 'uid-intrus'],
        dernierSiege: 'viv',
      }),
    )
  })

  it('un joueur assis ne prend pas non plus celui de son voisin', async () => {
    await assertFails(
      updateDoc(partie(as(UID.roux)), {
        'seats.viv': { uid: UID.roux },
        dernierSiege: 'viv',
      }),
    )
  })

  it("un joueur assis remplace un absent par un bot, qui garde le compte de l'absent", async () => {
    await assertSucceeds(
      updateDoc(partie(as(UID.roux)), {
        'seats.viv': { uid: UID.roux, bot: true, niveau: 'simple', remplace: true, ancien: UID.viv },
        dernierSiege: 'viv',
      }),
    )
    // Seul le compte de Viv reprend sa place.
    await assertFails(
      updateDoc(partie(as('uid-intrus')), {
        'seats.viv': { uid: 'uid-intrus', aideBot: true },
        seatedUids: [...PARTIE.seatedUids, 'uid-intrus'],
        dernierSiege: 'viv',
      }),
    )
    await assertSucceeds(
      updateDoc(partie(as(UID.viv)), { 'seats.viv': { uid: UID.viv, aideBot: true }, dernierSiege: 'viv' }),
    )
  })

  it("un inconnu ne s'empare pas d'un bot ; un joueur assis reprend un bot muet", async () => {
    await poser({
      ...PARTIE,
      seats: { ...PARTIE.seats, viv: { uid: 'uid-hote-disparu', bot: true, niveau: 'compteur' } },
    })
    await assertFails(
      updateDoc(partie(as('uid-intrus')), {
        'seats.viv': { uid: 'uid-intrus', bot: true, niveau: 'compteur' },
        seatedUids: [...PARTIE.seatedUids, 'uid-intrus'],
        dernierSiege: 'viv',
      }),
    )
    await assertSucceeds(
      updateDoc(partie(as(UID.roux)), {
        'seats.viv': { uid: UID.roux, bot: true, niveau: 'compteur' },
        dernierSiege: 'viv',
      }),
    )
  })
})

describe('table complétée par le quatrième arrivé', () => {
  const troisAssis = {
    ...PARTIE,
    seats: { benel: { uid: UID.benel }, roux: { uid: UID.roux }, viv: { uid: UID.viv } },
    seatedUids: [UID.benel, UID.roux, UID.viv],
    seating: null,
    phase: 'lobby',
    dealNumber: 0,
  }
  const arrivee = {
    'seats.romain': { uid: UID.romain },
    seatedUids: [...troisAssis.seatedUids, UID.romain],
    dernierSiege: 'romain',
    seating: DEFAULT_SEATING,
    dealer: DEFAULT_SEATING[1],
  }

  it("fixe le placement et le donneur en s'asseyant", async () => {
    await poser(troisAssis)
    await assertSucceeds(updateDoc(partie(as(UID.romain)), arrivee))
  })

  it('mais ne peut plus changer un placement déjà fixé', async () => {
    await poser({ ...troisAssis, seating: ['viv', 'roux', 'benel', 'romain'] })
    await assertFails(updateDoc(partie(as(UID.romain)), arrivee))
  })

  it("et un cinquième ne s'assied pas", async () => {
    await poser(PARTIE)
    await assertFails(
      updateDoc(partie(as('uid-cinq')), {
        'seats.jean': { uid: 'uid-cinq' },
        seatedUids: [...PARTIE.seatedUids, 'uid-cinq'],
        dernierSiege: 'jean',
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
    await poser({ ...PARTIE, phase: 'terminee', scores: [1010, 300] })
    await assertFails(setDoc(doc(as('uid-intrus'), 'archives', CODE), archive))
    await assertSucceeds(setDoc(doc(as(UID.viv), 'archives', CODE), archive))
    await assertFails(setDoc(doc(as(UID.roux), 'archives', CODE), { ...archive, scores: [0, 2000] }))
  })
})

describe('joueurs ajoutés', () => {
  const nouveau = (nom: string) => ({ nom, creeLe: serverTimestamp() })

  it('tout joueur connecté peut en ajouter un', async () => {
    await assertSucceeds(setDoc(doc(as(UID.viv), 'joueurs', 'jean-eric'), nouveau('Jean-Éric')))
  })

  it('refuse un identifiant mal formé ou un nom trop long', async () => {
    await assertFails(setDoc(doc(as(UID.viv), 'joueurs', 'Jean Éric'), nouveau('Jean Éric')))
    await assertFails(setDoc(doc(as(UID.viv), 'joueurs', 'long'), nouveau('x'.repeat(21))))
  })

  it('refuse un identifiant de bot', async () => {
    await assertFails(setDoc(doc(as(UID.viv), 'joueurs', 'bot-simple-1'), nouveau('Bot')))
  })

  it('refuse un champ en trop', async () => {
    await assertFails(setDoc(doc(as(UID.viv), 'joueurs', 'jean'), { ...nouveau('Jean'), admin: true }))
  })

  it('ne se modifie ni ne se supprime', async () => {
    await assertSucceeds(setDoc(doc(as(UID.viv), 'joueurs', 'jean'), nouveau('Jean')))
    await assertFails(setDoc(doc(as(UID.roux), 'joueurs', 'jean'), nouveau('Jeannot')))
    await assertFails(deleteDoc(doc(as(UID.roux), 'joueurs', 'jean')))
  })

  it('refuse un anonyme non connecté', async () => {
    await assertFails(
      setDoc(doc(env.unauthenticatedContext().firestore(), 'joueurs', 'jean'), nouveau('Jean')),
    )
  })
})
