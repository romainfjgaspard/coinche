/**
 * Pause de la partie, et reprise d'un bot dont l'onglet a disparu — contre l'émulateur.
 * Lancement : npm run test:rules
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { getDoc } from 'firebase/firestore'
import {
  PartieEnPause, createGame, deal, gameRef, placeBid, readEvents, reprendreSiegeBot, setPause, signIn,
  takeSeat, type GameDoc,
} from '../src/firebase/partie'
import { makeClient } from '../src/firebase/app'
import { DEFAULT_SEATING } from '../src/game/players'

const lire = async (code: string) => (await getDoc(gameRef(code))).data() as GameDoc

describe('pause', () => {
  let code: string

  beforeAll(async () => {
    await signIn()
    code = await createGame('benel', DEFAULT_SEATING)
    for (const p of ['roux', 'viv', 'romain'] as const) await takeSeat(code, p)
    await deal(code)
  }, 30_000)

  it('en pause, aucune enchère ne passe, et rien n\'est écrit', async () => {
    await setPause(code, 'roux', true)
    expect((await lire(code)).pause?.par).toBe('roux')
    const avant = (await readEvents(code)).length
    // Benel donne : Viv parle en premier.
    await expect(placeBid(code, { kind: 'passe', player: 'viv' })).rejects.toBeInstanceOf(PartieEnPause)
    expect((await readEvents(code)).length).toBe(avant)
  })

  it('on ne met pas en pause une partie déjà en pause', async () => {
    await expect(setPause(code, 'viv', true)).rejects.toThrow(/déjà en pause/)
  })

  it('à la reprise, on joue de nouveau, et le journal garde la pause', async () => {
    await setPause(code, 'viv', false)
    expect((await lire(code)).pause).toBeNull()
    await placeBid(code, { kind: 'passe', player: 'viv' })
    const types = (await readEvents(code)).map((e) => e.type)
    expect(types).toContain('pause')
    expect(types).toContain('reprise')
    expect(types.at(-1)).toBe('enchere')
  })
})

describe('reprise d\'un bot', () => {
  let code: string

  beforeAll(async () => {
    await signIn()
    code = await createGame('benel', DEFAULT_SEATING)
    for (const p of ['roux', 'viv'] as const) await takeSeat(code, p)
    // Le bot de Romain, assis par l'onglet (disparu depuis) d'un autre joueur.
    await takeSeat(code, 'romain', await makeClient('bots-disparu'), true, 'compteur')
  }, 30_000)

  it('le siège garde le niveau du bot', async () => {
    expect((await lire(code)).seats.romain).toMatchObject({ bot: true, niveau: 'compteur' })
  })

  it('deux onglets le reprennent en même temps : un seul l\'emporte', async () => {
    const ancien = (await lire(code)).seats.romain!.uid
    const [a, b] = [await makeClient('reprise-a'), await makeClient('reprise-b')]
    const resultats = await Promise.allSettled([
      reprendreSiegeBot(code, 'romain', ancien, a),
      reprendreSiegeBot(code, 'romain', ancien, b),
    ])
    expect(resultats.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const siege = (await lire(code)).seats.romain!
    expect(siege.uid).not.toBe(ancien)
    expect(siege).toMatchObject({ bot: true, niveau: 'compteur' })
    expect([a.auth.currentUser?.uid, b.auth.currentUser?.uid]).toContain(siege.uid)
  })

  it('on ne reprend pas le siège d\'un humain', async () => {
    const humain = (await lire(code)).seats.roux!.uid
    await expect(reprendreSiegeBot(code, 'roux', humain, await makeClient('reprise-c'))).rejects.toThrow(/pas tenu par un bot/)
  })
})
