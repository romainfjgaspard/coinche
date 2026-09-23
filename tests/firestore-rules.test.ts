/**
 * Tests des règles Firestore sur l'émulateur.
 * Objectif principal : garantir qu'un joueur ne peut pas lire la main d'un autre.
 * Lancement : npm run test:rules
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore'
import { DECK, shuffle } from '../src/game/cards'
import { dealHands } from '../src/game/deal'
import { DEFAULT_SEATING } from '../src/game/players'

let env: RulesTestEnvironment
const CODE = 'ABCD'

/** Roster figé. Chaque joueur occupe un siège via un compte anonyme (uid). */
const ROSTER = ['benel', 'roux', 'viv', 'romain'] as const
const UID: Record<string, string> = {
  benel: 'uid-b', roux: 'uid-r', viv: 'uid-v', romain: 'uid-ro',
}
const PARTIE = {
  seats: Object.fromEntries(ROSTER.map((p) => [p, { uid: UID[p] }])),
  seatedUids: ROSTER.map((p) => UID[p]),
  dealer: 'benel',
  phase: 'encheres',
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-coinche',
    firestore: { rules: (await import('node:fs')).readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})

afterAll(() => env.cleanup())

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'parties', CODE), PARTIE)
    for (const pid of ROSTER) {
      await setDoc(doc(db, 'parties', CODE, 'mains', pid), { cards: ['As', 'Ks'] })
    }
    await setDoc(doc(db, 'parties', CODE, 'donne', '1'), { hands: {} })
  })
})

const as = (uid: string) => env.authenticatedContext(uid).firestore()

describe('mains — étanchéité', () => {
  it('Roux lit sa propre main', async () => {
    await assertSucceeds(getDoc(doc(as(UID.roux), 'parties', CODE, 'mains', 'roux')))
  })

  it('Roux NE PEUT PAS lire la main de Viv', async () => {
    await assertFails(getDoc(doc(as(UID.roux), 'parties', CODE, 'mains', 'viv')))
  })

  it('un visiteur non authentifié ne lit aucune main', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'parties', CODE, 'mains', 'roux')))
  })

  it('le donneur peut écrire la main des autres (distribution)', async () => {
    await assertSucceeds(setDoc(doc(as(UID.benel), 'parties', CODE, 'mains', 'roux'), { cards: [] }))
  })

  it('un joueur qui n\'est pas donneur ne peut pas écrire la main d\'un autre', async () => {
    await assertFails(setDoc(doc(as(UID.roux), 'parties', CODE, 'mains', 'viv'), { cards: [] }))
  })

  it('un compte qui n\'occupe aucun siège ne lit rien', async () => {
    await assertFails(getDoc(doc(as('uid-inconnu'), 'parties', CODE, 'mains', 'romain')))
  })
})

describe('donne distribuée — scellée jusqu\'à la fin', () => {
  it('illisible pendant la partie, même par un joueur', async () => {
    await assertFails(getDoc(doc(as(UID.benel), 'parties', CODE, 'donne', '1')))
  })

  it('lisible une fois la partie terminée', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'parties', CODE), { ...PARTIE, phase: 'terminee' })
    })
    await assertSucceeds(getDoc(doc(as(UID.benel), 'parties', CODE, 'donne', '1')))
  })
})

describe('journal — append-only', () => {
  it('un joueur peut ajouter un événement', async () => {
    await assertSucceeds(setDoc(doc(as(UID.benel), 'parties', CODE, 'evenements', '1'), { type: 'enchere' }))
  })

  it('personne ne peut modifier un événement écrit', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'parties', CODE, 'evenements', '1'), { type: 'enchere' })
    })
    await assertFails(setDoc(doc(as(UID.benel), 'parties', CODE, 'evenements', '1'), { type: 'triche' }))
    await assertFails(deleteDoc(doc(as(UID.benel), 'parties', CODE, 'evenements', '1')))
  })

  it('un étranger à la partie ne peut rien écrire', async () => {
    await assertFails(setDoc(doc(as('uid-intrus'), 'parties', CODE, 'evenements', '2'), { type: 'enchere' }))
  })
})


describe('distribution complète — bout en bout', () => {
  it('le donneur distribue, chacun ne lit que sa main, et le paquet est intact', async () => {
    const hands = dealHands(shuffle([...DECK]), 'benel', DEFAULT_SEATING)

    // Benel est donneur : lui seul peut écrire les quatre mains.
    for (const pid of ROSTER) {
      await assertSucceeds(
        setDoc(doc(as(UID.benel), 'parties', CODE, 'mains', pid), { cards: hands[pid] }),
      )
    }

    // Chacun relit la sienne, et seulement la sienne.
    const seen: string[] = []
    for (const pid of ROSTER) {
      const snap = await getDoc(doc(as(UID[pid]), 'parties', CODE, 'mains', pid))
      const cards = snap.data()!.cards as string[]
      expect(cards).toHaveLength(8)
      seen.push(...cards)

      for (const other of ROSTER.filter((p) => p !== pid)) {
        await assertFails(getDoc(doc(as(UID[pid]), 'parties', CODE, 'mains', other)))
      }
    }

    // Les 32 cartes sont là, une seule fois chacune.
    expect(seen).toHaveLength(32)
    expect(new Set(seen).size).toBe(32)
    expect([...seen].sort()).toEqual([...DECK].sort())
  })
})

describe('prise de siège', () => {
  it('un joueur pas encore assis peut prendre son siège', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'parties', CODE), {
        seats: { benel: { uid: UID.benel } },
        seatedUids: [UID.benel],
        dealer: 'benel',
        phase: 'lobby',
      })
    })
    await assertSucceeds(
      setDoc(doc(as(UID.roux), 'parties', CODE), {
        seats: { benel: { uid: UID.benel }, roux: { uid: UID.roux } },
        seatedUids: [UID.benel, UID.roux],
        dealer: 'benel',
        phase: 'lobby',
      }),
    )
  })

  it('mais il ne peut pas déloger quelqu\'un en s\'asseyant', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'parties', CODE), {
        seats: { benel: { uid: UID.benel } },
        seatedUids: [UID.benel],
        dealer: 'benel',
        phase: 'lobby',
      })
    })
    await assertFails(
      setDoc(doc(as(UID.roux), 'parties', CODE), {
        seats: { roux: { uid: UID.roux } },
        seatedUids: [UID.roux], // Benel a disparu
        dealer: 'benel',
        phase: 'lobby',
      }),
    )
  })
})
