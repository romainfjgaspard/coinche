/**
 * Historique fictif pour la page de statistiques globales — **émulateur uniquement**.
 *
 * On ne fabrique pas d'archives à la main : on joue de vraies parties, de bout en bout,
 * à travers le vrai code de `src/firebase/partie.ts`. Quatre sessions distinctes tiennent
 * les quatre sièges comme des humains (donc pas de drapeau « bot » : les parties comptent
 * dans les classements), et c'est le cerveau des bots qui décide à leur place. L'archive
 * est déposée par le code de fin de partie, exactement comme en vrai.
 *
 * Chacun a un tempérament pour que les statistiques aient du relief : Benel prudent,
 * Viv et Romain audacieux. Quelques coinches, surcoinches et belotes oubliées au passage.
 *
 * Lancement : npm run emu, puis npm run seed:stats [-- nombre de parties, 8 par défaut]
 */
import { describe, it } from 'vitest'
import { getDoc } from 'firebase/firestore'
import { type Client, makeClient, useEmulators } from '../src/firebase/app'
import {
  type GameDoc, createGame, deal, gameRef, handRef, placeBid, playCard, readEvents, signIn, takeSeat,
} from '../src/firebase/partie'
import { type BiddingEntry, currentBidder, highestBid, rankOf } from '../src/game/bidding'
import { chooseBid, chooseCard } from '../src/game/bot'
import type { Card } from '../src/game/cards'
import { canDeclareBelote, currentPlayer, playableFor } from '../src/game/play'
import { PLAYER_IDS, type PlayerId, partnerOf, randomSeating, teamOfPlayer } from '../src/game/players'
import { biddingFromEvents, currentDeal, playFromEvents } from '../src/game/replay'

const PARTIES = Number(process.env.PARTIES ?? 8)

/** Écart d'enchère selon le tempérament, en points, appliqué une fois sur deux. */
const TEMPERAMENT: Record<PlayerId, number> = { benel: -10, roux: 0, viv: 10, romain: 20 }

const hasard = (p: number) => Math.random() < p

async function main(c: Client, code: string, joueur: PlayerId): Promise<Card[]> {
  return ((await getDoc(handRef(code, joueur, c))).data()?.cards ?? []) as Card[]
}

async function parler(clients: Record<PlayerId, Client>, code: string, game: GameDoc, joueur: PlayerId) {
  const c = clients[joueur]
  const events = await readEvents(code, c)
  const etat = biddingFromEvents(events, game.dealer, game.seating)
  if (currentBidder(etat) !== joueur) return
  const coinche = etat.entries.some((e) => e.kind === 'coinche')
  if (coinche) {
    // CO-5 : le preneur coinché laisse jouer, ou surcoinche de temps en temps.
    const entry: BiddingEntry = hasard(0.2)
      ? { kind: 'surcoinche', player: joueur }
      : { kind: 'passe', player: joueur }
    await placeBid(code, entry, c)
    return
  }
  const meilleure = highestBid(etat)
  const plancher = meilleure ? rankOf(meilleure) : 0
  const partenaire = meilleure?.player === partnerOf(joueur, game.seating)
  const dernier = etat.entries.length === 3 && meilleure === null
  const main_ = await main(c, code, joueur)

  // Un adversaire du preneur qui se sent fort coinche parfois.
  if (meilleure && !partenaire && meilleure.kind === 'contrat'
      && teamOfPlayer(meilleure.player, game.seating) !== teamOfPlayer(joueur, game.seating)
      && hasard(0.12)) {
    await placeBid(code, { kind: 'coinche', player: joueur }, c)
    return
  }

  const choix = chooseBid(main_, plancher, partenaire, dernier)
  if (!choix) {
    await placeBid(code, { kind: 'passe', player: joueur }, c)
    return
  }
  const ecart = hasard(0.5) ? TEMPERAMENT[joueur] : 0
  const value = Math.min(160, Math.max(plancher + 10, 80, choix.value + ecart))
  await placeBid(code, { kind: 'contrat', player: joueur, value, suit: choix.trump }, c)
}

async function poser(clients: Record<PlayerId, Client>, code: string, game: GameDoc, joueur: PlayerId) {
  const c = clients[joueur]
  const events = await readEvents(code, c)
  const etat = playFromEvents(events, game.dealer, game.seating)
  if (!etat || currentPlayer(etat) !== joueur) return
  const main_ = await main(c, code, joueur)
  const jouables = playableFor(etat, joueur, main_)
  const contrat = [...currentDeal(events)].reverse().find((e) => e.type === 'contrat_fixe')
  const preneur = contrat && contrat.type === 'contrat_fixe' ? contrat.taker : joueur
  const carte = chooseCard({
    me: joueur, seating: game.seating, hand: main_, trump: etat.trump, taker: preneur,
    current: etat.current, completed: etat.completed,
  }, jouables, 'compteur')
  // BEL-2 : la belote s'annonce… sauf quand on l'oublie.
  const belote = canDeclareBelote(etat, joueur, carte, main_, etat.trump) && hasard(0.8)
  await playCard(code, joueur, carte, belote, c)
}

async function jouerUnePartie(n: number): Promise<void> {
  const seating = randomSeating()
  const clients = {} as Record<PlayerId, Client>
  for (const p of PLAYER_IDS) {
    clients[p] = await makeClient(`historique-${n}-${p}-${Date.now()}`)
    await signIn(clients[p])
  }
  const createur = seating[0]
  const code = await createGame(createur, seating, seating[1], clients[createur])
  for (const p of PLAYER_IDS) if (p !== createur) await takeSeat(code, p, clients[p])

  for (let tour = 0; tour < 5000; tour++) {
    const game = (await getDoc(gameRef(code, clients[createur]))).data() as GameDoc
    if (game.phase === 'terminee') {
      console.log(`partie ${n} (${code}) : ${game.scores.join(' – ')} en ${game.dealNumber} donnes`)
      return
    }
    if (game.phase === 'lobby' || game.phase === 'decompte') {
      await deal(code, null, clients[game.dealer])
    } else if (game.phase === 'encheres') {
      const events = await readEvents(code, clients[createur])
      const qui = currentBidder(biddingFromEvents(events, game.dealer, game.seating))
      if (qui) await parler(clients, code, game, qui)
    } else if (game.phase === 'jeu') {
      const events = await readEvents(code, clients[createur])
      const etat = playFromEvents(events, game.dealer, game.seating)
      const qui = etat ? currentPlayer(etat) : null
      if (qui) await poser(clients, code, game, qui)
    }
  }
  throw new Error(`partie ${n} (${code}) : pas terminée après 5000 actions`)
}

describe('historique fictif', () => {
  it(`joue ${PARTIES} parties complètes et dépose leurs archives`, async () => {
    // Deux verrous valent mieux qu'un : jamais la vraie base.
    if (!useEmulators) throw new Error('Refus : ce script ne tourne que sur l\'émulateur')
    for (let n = 1; n <= PARTIES; n++) await jouerUnePartie(n)
  }, 60 * 60 * 1000)
})
