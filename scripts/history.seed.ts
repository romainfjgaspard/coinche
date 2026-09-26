/**
 * Historique fictif pour la page de statistiques globales — **émulateur uniquement**.
 *
 * On ne fabrique pas d'archives à la main : on joue de vraies parties, de bout en bout,
 * à travers le vrai code de `src/firebase/game.ts`. Quatre sessions distinctes tiennent
 * les quatre sièges comme des humains (donc pas de drapeau « bot » : les parties comptent
 * dans les classements), et c'est le cerveau des bots qui décide à leur place. L'archive
 * est déposée par le code de fin de partie, exactement comme en vrai.
 *
 * Chacun a un tempérament pour que les statistiques aient du relief : Benel prudent,
 * Viv et Romain audacieux. Quelques coinches, surcoinches et belotes oubliées au passage.
 *
 * Lancement : npm run emu, puis npm run seed:stats ($env:GAMES pour le nombre, 8 par défaut ;
 * $env:PARTNERS pour ne jouer que certaines affiches, voir balancedSeating).
 * Vraie base : $env:SEED_CONFIRM='coinche-e708b'; npm run seed:stats:prod
 */
import { describe, it } from 'vitest'
import { getDoc } from 'firebase/firestore'
import { type Client, db, makeClient, useEmulators } from '../src/firebase/app'
import {
  type GameDoc,
  createGame,
  deal,
  gameRef,
  handRef,
  placeBid,
  playCard,
  readArchives,
  readJournal,
  signIn,
  tableOf,
  takeSeat,
} from '../src/firebase/game'
import { type BiddingEntry, currentBidder, highestBid, rankOf } from '../src/game/bidding'
import { chooseBid, chooseCard } from '../src/game/bot'
import type { Card } from '../src/game/cards'
import { canDeclareBelote, currentPlayer, playableFor } from '../src/game/play'
import { PLAYER_IDS, type PlayerId, type Seating, partnerOf, teamOfPlayer } from '../src/game/players'
import { biddingFromEvents, currentDeal, playFromEvents } from '../src/game/replay'

const GAMES = Number(process.env.GAMES ?? 8)

/** Écart d'enchère selon le tempérament, en points, appliqué une fois sur deux. */
const TEMPERAMENT: Record<PlayerId, number> = { benel: -10, roux: 0, viv: 10, romain: 20 }

const random = (p: number) => Math.random() < p

async function hand(c: Client, code: string, player: PlayerId): Promise<Card[]> {
  return ((await getDoc(handRef(code, player, c))).data()?.cards ?? []) as Card[]
}

async function speak(clients: Record<PlayerId, Client>, code: string, game: GameDoc, player: PlayerId) {
  const c = clients[player]
  const events = await readJournal(code, c)
  const state = biddingFromEvents(events, game.dealer, tableOf(game))
  if (currentBidder(state) !== player) return
  const coinche = state.entries.some((e) => e.kind === 'coinche')
  if (coinche) {
    // CO-5 : le preneur coinché laisse jouer, ou surcoinche de temps en temps.
    const entry: BiddingEntry = random(0.2)
      ? { kind: 'surcoinche', player: player }
      : { kind: 'pass', player: player }
    await placeBid(code, entry, c)
    return
  }
  const bestOption = highestBid(state)
  const floorBid = bestOption ? rankOf(bestOption) : 0
  const partner = bestOption?.player === partnerOf(player, tableOf(game))
  const hand_ = await hand(c, code, player)

  // Un adversaire du preneur qui se sent fort coinche parfois.
  if (
    bestOption &&
    !partner &&
    bestOption.kind === 'contract' &&
    teamOfPlayer(bestOption.player, tableOf(game)) !== teamOfPlayer(player, tableOf(game)) &&
    random(0.12)
  ) {
    await placeBid(code, { kind: 'coinche', player: player }, c)
    return
  }

  const choice = chooseBid(hand_, state, player)
  if (!choice) {
    await placeBid(code, { kind: 'pass', player: player }, c)
    return
  }
  const gap = random(0.5) ? TEMPERAMENT[player] : 0
  const value = Math.min(160, Math.max(floorBid + 10, 80, choice.value + gap))
  await placeBid(code, { kind: 'contract', player: player, value, suit: choice.trump }, c)
}

async function placeCard(clients: Record<PlayerId, Client>, code: string, game: GameDoc, player: PlayerId) {
  const c = clients[player]
  const events = await readJournal(code, c)
  const state = playFromEvents(events, game.dealer, tableOf(game))
  if (!state || currentPlayer(state) !== player) return
  const hand_ = await hand(c, code, player)
  const playable = playableFor(state, player, hand_)
  const contract = [...currentDeal(events)].reverse().find((e) => e.type === 'contract_set')
  const taker = contract && contract.type === 'contract_set' ? contract.taker : player
  const card = chooseCard(
    {
      me: player,
      seating: tableOf(game),
      hand: hand_,
      trump: state.trump,
      taker: taker,
      current: state.current,
      completed: state.completed,
    },
    playable,
  )
  // BEL-2 : la belote s'annonce… sauf quand on l'oublie.
  const belote = canDeclareBelote(state, player, card, hand_, state.trump) && random(0.8)
  await playCard(code, player, card, belote, c)
}

/**
 * Les trois affiches possibles à quatre : Romain avec chacun des trois autres.
 * Chaque partie prend l'affiche la moins jouée parmi les archives déjà déposées — y
 * compris celles d'avant le semis — pour que chaque duo ait autant de matchs.
 */
function matchupKey(seating: Seating): string {
  return [
    [seating[0], seating[2]],
    [seating[1], seating[3]],
  ]
    .map((duo) => [...duo].sort().join('+'))
    .sort()
    .join(' vs ')
}

async function balancedSeating(c: Client): Promise<Seating> {
  const others = PLAYER_IDS.filter((p) => p !== 'romain')
  // $env:PARTNERS="benel,roux" : seulement les affiches où Romain joue avec eux,
  // pour rattraper des appariements en retard ailleurs (en prod, par exemple).
  const wanted = (process.env.PARTNERS ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  const matchups: Seating[] = others
    .filter((partner) => wanted.length === 0 || wanted.includes(partner))
    .map((partner) => {
      const [a, b] = others.filter((p) => p !== partner)
      return ['romain', a, partner, b] as const
    })
  const playedCards = new Map<string, number>()
  for (const archive of await readArchives(c)) {
    const key = matchupKey(archive.seating)
    playedCards.set(key, (playedCards.get(key) ?? 0) + 1)
  }
  const fewest = Math.min(...matchups.map((s) => playedCards.get(matchupKey(s)) ?? 0))
  const candidates = matchups.filter((s) => (playedCards.get(matchupKey(s)) ?? 0) === fewest)
  const chosenOne = candidates[Math.floor(Math.random() * candidates.length)]
  // Même affiche, mais la place de chacun et le premier donneur varient d'une partie à l'autre.
  const offset = Math.floor(Math.random() * 4)
  const seat = (i: number): PlayerId => chosenOne[(i + offset) % 4]
  return [seat(0), seat(1), seat(2), seat(3)]
}

async function playAGame(n: number): Promise<void> {
  const reader = await makeClient(`historique-${n}-lecteur-${Date.now()}`)
  await signIn(reader)
  const seating = await balancedSeating(reader)
  console.log(`partie ${n} : ${matchupKey(seating)}`)
  const clients = {} as Record<PlayerId, Client>
  for (const p of PLAYER_IDS) {
    clients[p] = await makeClient(`historique-${n}-${p}-${Date.now()}`)
    await signIn(clients[p])
  }
  const creatorId = seating[0]
  const code = await createGame(creatorId, seating, seating[1], clients[creatorId])
  for (const p of PLAYER_IDS) if (p !== creatorId) await takeSeat(code, p, clients[p])

  for (let turn = 0; turn < 5000; turn++) {
    const game = (await getDoc(gameRef(code, clients[creatorId]))).data() as GameDoc
    if (game.phase === 'finished') {
      console.log(`partie ${n} (${code}) : ${game.scores.join(' – ')} en ${game.dealNumber} donnes`)
      return
    }
    if (game.phase === 'lobby' || game.phase === 'scoring') {
      await deal(code, null, clients[game.dealer])
    } else if (game.phase === 'bidding') {
      const events = await readJournal(code, clients[creatorId])
      const who = currentBidder(biddingFromEvents(events, game.dealer, tableOf(game)))
      if (who) await speak(clients, code, game, who)
    } else if (game.phase === 'playing') {
      const events = await readJournal(code, clients[creatorId])
      const state = playFromEvents(events, game.dealer, tableOf(game))
      const who = state ? currentPlayer(state) : null
      if (who) await placeCard(clients, code, game, who)
    }
  }
  throw new Error(`partie ${n} (${code}) : pas terminée après 5000 actions`)
}

describe('historique fictif', () => {
  it(
    `joue ${GAMES} parties complètes et dépose leurs archives`,
    async () => {
      // La vraie base seulement sur demande explicite, en nommant le projet visé.
      const project = db.app.options.projectId
      if (!useEmulators && process.env.SEED_CONFIRM !== project) {
        throw new Error(`Refus : vraie base (${project}). Confirmer avec SEED_CONFIRM=${project}`)
      }
      console.log(
        `semis de ${GAMES} parties sur ${useEmulators ? "l'émulateur" : `la VRAIE base ${project}`}`,
      )
      for (let n = 1; n <= GAMES; n++) await playAGame(n)
    },
    60 * 60 * 1000,
  )
})
