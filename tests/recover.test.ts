/**
 * Une donne jouée jusqu'au bout mais jamais décomptée — la partie DXZV du 13/10 : le
 * dernier pli est au journal, le décompte n'a jamais suivi (quota épuisé entre les deux).
 * Lancement : npm run test:rules
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { getDoc } from 'firebase/firestore'
import {
  appendEvent,
  createGame,
  deal,
  gameRef,
  handRef,
  placeBid,
  playCard,
  readEvents,
  recoverDeal,
  signIn,
  takeSeat,
  type GameDoc,
} from '../src/firebase/game'
import { playFromEvents } from '../src/game/replay'
import { applyPlayed, currentPlayer, playableFor, trickFlags } from '../src/game/play'
import type { Card } from '../src/game/cards'
import { DEFAULT_SEATING, PLAYER_IDS } from '../src/game/players'

let code: string

beforeAll(async () => {
  await signIn()
  code = await createGame('benel', DEFAULT_SEATING)
  for (const p of PLAYER_IDS.filter((p) => p !== 'benel')) await takeSeat(code, p)
  await deal(code)
  // Donneur Benel → Viv parle en premier ; Roux prend à 80 cœur.
  await placeBid(code, { kind: 'contract', player: 'viv', value: 80, suit: 'h' })
  for (const player of ['roux', 'romain', 'benel'] as const) await placeBid(code, { kind: 'pass', player })

  // 31 cartes par le vrai chemin…
  for (let i = 0; i < 31; i++) {
    const state = playFromEvents(await readEvents(code), 'benel')!
    const player = currentPlayer(state)!
    const hand = ((await getDoc(handRef(code, player))).data()!.cards ?? []) as Card[]
    await playCard(code, player, playableFor(state, player, hand)[0])
  }
  // … et la dernière comme le 13/10 : la carte et le pli écrits, puis plus rien.
  const state = playFromEvents(await readEvents(code), 'benel')!
  const player = currentPlayer(state)!
  const card = ((await getDoc(handRef(code, player))).data()!.cards as Card[])[0]
  await appendEvent(code, { type: 'card_played', player, card, trickNumber: 8, position: 3 })
  const after = applyPlayed(state, player, card)
  const trick = after.completed[7]
  await appendEvent(code, {
    type: 'trick_done',
    trickNumber: 8,
    winner: trick.winner,
    cards: trick.plays.map((p) => p.card),
    points: trick.points,
    ...trickFlags(trick, after.trump),
  })
}, 90_000)

describe('donne jouée mais jamais décomptée', () => {
  it('reste figée en « jeu » tant que personne ne la reprend', async () => {
    const events = await readEvents(code)
    expect(events.filter((e) => e.type === 'trick_done')).toHaveLength(8)
    expect(events.some((e) => e.type === 'deal_done')).toBe(false)
    expect(((await getDoc(gameRef(code))).data() as GameDoc).phase).toBe('playing')
  })

  it('les quatre téléphones la reprennent ensemble : un seul décompte', async () => {
    const results = await Promise.all(PLAYER_IDS.map(() => recoverDeal(code)))
    expect(results.filter(Boolean)).toHaveLength(1)

    const events = await readEvents(code)
    const done = events.filter((e) => e.type === 'deal_done')
    expect(done).toHaveLength(1)
    const game = (await getDoc(gameRef(code))).data() as GameDoc
    expect(game.phase).toBe('scoring')
    expect(game.scores[0] + game.scores[1]).toBeGreaterThan(0)
    expect(game.dealer).toBe('viv')
  })

  it('une fois décomptée, une reprise ne fait plus rien', async () => {
    const before = (await readEvents(code)).length
    expect(await recoverDeal(code)).toBe(false)
    expect(await readEvents(code)).toHaveLength(before)
  })
})
