/**
 * Pause de la partie, et reprise d'un bot dont l'onglet a disparu — contre l'émulateur.
 * Lancement : npm run test:rules
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { getDoc } from 'firebase/firestore'
import {
  GamePaused,
  createGame,
  deal,
  gameRef,
  placeBid,
  readEvents,
  replaceWithBot,
  reclaimSeat,
  takeOverBotSeat,
  setPause,
  signIn,
  takeSeat,
  type GameDoc,
} from '../src/firebase/game'
import { makeClient } from '../src/firebase/app'
import { DEFAULT_SEATING } from '../src/game/players'

const read = async (code: string) => (await getDoc(gameRef(code))).data() as GameDoc

describe('pause', () => {
  let code: string

  beforeAll(async () => {
    await signIn()
    code = await createGame('benel', DEFAULT_SEATING)
    for (const p of ['roux', 'viv', 'romain'] as const) await takeSeat(code, p)
    await deal(code)
  }, 30_000)

  it("en pause, aucune enchère ne passe, et rien n'est écrit", async () => {
    await setPause(code, 'roux', true)
    expect((await read(code)).pause?.by).toBe('roux')
    const before = (await readEvents(code)).length
    // Benel donne : Viv parle en premier.
    await expect(placeBid(code, { kind: 'pass', player: 'viv' })).rejects.toBeInstanceOf(GamePaused)
    expect((await readEvents(code)).length).toBe(before)
  })

  it('on ne met pas en pause une partie déjà en pause', async () => {
    await expect(setPause(code, 'viv', true)).rejects.toThrow(/déjà en pause/)
  })

  it('à la reprise, on joue de nouveau, et le journal garde la pause', async () => {
    await setPause(code, 'viv', false)
    expect((await read(code)).pause).toBeNull()
    await placeBid(code, { kind: 'pass', player: 'viv' })
    const types = (await readEvents(code)).map((e) => e.type)
    expect(types).toContain('pause')
    expect(types).toContain('resume')
    expect(types.at(-1)).toBe('bid')
  })
})

describe("reprise d'un bot", () => {
  let code: string
  // Deux autres joueurs, chacun dans son onglet : seul un joueur assis reprend un bot.
  let a: Awaited<ReturnType<typeof makeClient>>
  let b: Awaited<ReturnType<typeof makeClient>>

  beforeAll(async () => {
    await signIn()
    code = await createGame('benel', DEFAULT_SEATING)
    a = await makeClient('reprise-a')
    b = await makeClient('reprise-b')
    await takeSeat(code, 'roux', a)
    await takeSeat(code, 'viv', b)
    // Le bot de Romain, assis par l'onglet (disparu depuis) d'un autre joueur.
    await takeSeat(code, 'romain', await makeClient('bots-disparu'), true, 'expert')
  }, 30_000)

  it('le siège garde le niveau du bot', async () => {
    expect((await read(code)).seats.romain).toMatchObject({ bot: true, level: 'expert' })
  })

  it("deux onglets le reprennent en même temps : un seul l'emporte", async () => {
    const formerUid = (await read(code)).seats.romain!.uid
    const outcomes = await Promise.allSettled([
      takeOverBotSeat(code, 'romain', formerUid, a),
      takeOverBotSeat(code, 'romain', formerUid, b),
    ])
    expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const seat = (await read(code)).seats.romain!
    expect(seat.uid).not.toBe(formerUid)
    expect(seat).toMatchObject({ bot: true, level: 'expert' })
    expect([a.auth.currentUser?.uid, b.auth.currentUser?.uid]).toContain(seat.uid)
  })

  it("on ne reprend pas le siège d'un humain", async () => {
    const human = (await read(code)).seats.roux!.uid
    await expect(takeOverBotSeat(code, 'roux', human, await makeClient('reprise-c'))).rejects.toThrow(
      /pas tenu par un bot/,
    )
  })
})

describe('un joueur absent remplacé par un bot', () => {
  let code: string
  let viv: Awaited<ReturnType<typeof makeClient>>
  let roux: Awaited<ReturnType<typeof makeClient>>

  beforeAll(async () => {
    await signIn()
    code = await createGame('benel', DEFAULT_SEATING)
    viv = await makeClient('absente-viv')
    roux = await makeClient('remplacant-roux')
    await takeSeat(code, 'viv', viv)
    await takeSeat(code, 'roux', roux)
    await takeSeat(code, 'romain')
  }, 30_000)

  it('un autre joueur confie la place de Viv à un bot', async () => {
    const formerUid = (await read(code)).seats.viv!.uid
    // Roux, assis, fait tourner le bot chez lui ; le siège garde le compte de Viv.
    await replaceWithBot(code, 'viv', formerUid, 'basic', roux)
    expect((await read(code)).seats.viv).toMatchObject({
      bot: true,
      level: 'basic',
      replaced: true,
      formerUid: viv.auth.currentUser?.uid,
    })
  })

  it('on ne remplace pas deux fois : le bot tient déjà la place', async () => {
    const currentHolder = (await read(code)).seats.viv!.uid
    await expect(replaceWithBot(code, 'viv', currentHolder, 'basic')).rejects.toThrow(/déjà/)
  })

  it('Viv revient et reprend sa place ; la partie reste marquée « avec bot »', async () => {
    await reclaimSeat(code, 'viv', viv)
    const seat = (await read(code)).seats.viv!
    expect(seat.uid).toBe(viv.auth.currentUser?.uid)
    expect(seat.bot).toBeUndefined()
    expect(seat.botAssisted).toBe(true)
  })

  it("reprendre une place qui n'est pas tenue par un bot est refusé", async () => {
    await expect(reclaimSeat(code, 'viv', viv)).rejects.toThrow(/pas tenue par un bot/)
  })
})

describe('parties non finies', () => {
  it('une partie commencée et non terminée est listée, avec ses joueurs et ses donnes', async () => {
    const { readUnfinishedGames } = await import('../src/firebase/game')
    await signIn()
    const code = await createGame('benel', DEFAULT_SEATING)
    for (const p of ['roux', 'viv', 'romain'] as const) await takeSeat(code, p)
    await deal(code)
    const list = await readUnfinishedGames()
    const there = list.find((p) => p.code === code)
    expect(there).toMatchObject({ deals: 1, cancelled: false })
    expect(there!.players.sort()).toEqual(['benel', 'romain', 'roux', 'viv'])
  })
})
