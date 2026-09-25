/**
 * Tournoi entre deux façons de jouer, sans Firebase : de quoi mesurer qu'un bot est
 * meilleur au lieu de le supposer.
 *
 * Chaque donne est jouée deux fois, les équipes échangeant leurs places : la chance de
 * la distribution s'annule, l'écart ne vient que des enchères et du jeu.
 *
 * Lancement : npm run tournoi — $env:A et $env:B parmi base, expert, hasard (défaut :
 * expert contre base), $env:DONNES pour le nombre de donnes (défaut 100), $env:GRAINE.
 */
import { describe, it } from 'vitest'
import { type Card, DECK, shuffle } from '../src/game/cards'
import { type BiddingState, apply, currentBidder, newBidding, outcome } from '../src/game/bidding'
import { type BotBid, type BotView, chooseBid, chooseCard, doitCoincher } from '../src/game/bot'
import { choisirCarteExpert } from '../src/game/botExpert'
import { dealHands } from '../src/game/deal'
import { applyPlayed, currentPlayer, newPlay, playableFor } from '../src/game/play'
import { DEFAULT_SEATING, type PlayerId, seatOf, teamOfPlayer } from '../src/game/players'
import { hasBelote, scoreDeal } from '../src/game/scoring'

export interface Joueur {
  nom: string
  encherir: (main: Card[], etat: BiddingState, moi: PlayerId) => BotBid | null
  coincher?: (main: Card[], etat: BiddingState, moi: PlayerId) => boolean
  jouer: (
    vue: BotView & {
      contrat: { value: number; capot: boolean; generale: boolean }
      beloteAnnoncee: PlayerId | null
    },
    permis: Card[],
  ) => Card
}

export const JOUEURS: Record<string, Joueur> = {
  base: { nom: 'base', encherir: chooseBid, coincher: doitCoincher, jouer: (v, p) => chooseCard(v, p) },
  expert: {
    nom: 'expert',
    encherir: chooseBid,
    coincher: doitCoincher,
    jouer: (v, p) =>
      choisirCarteExpert(v, p, {
        echantillons: Number(process.env.ECHANTILLONS ?? 16),
        budgetMs: Infinity,
        // $env:TOLERANCE=0 : l'expert seul, sans le réflexe du bot de base
        ...(process.env.TOLERANCE === '0' ? { tolerance: { chances: 0, points: 0 } } : {}),
      }),
  },
  hasard: { nom: 'hasard', encherir: chooseBid, jouer: (_v, p) => p[0] },
}

const S = DEFAULT_SEATING

/** Une donne complète : enchères puis jeu. `equipe0` tient les sièges 0 et 2. Rend les scores. */
export function jouerDonne(
  pile: Card[],
  donneur: PlayerId,
  equipe0: Joueur,
  equipe1: Joueur,
): [number, number] {
  const joueur = (p: PlayerId) => (teamOfPlayer(p, S) === 0 ? equipe0 : equipe1)
  const mains = dealHands(pile, donneur, S)
  let etat = newBidding(donneur, S)
  for (let tour = 0; tour < 40; tour++) {
    const p = currentBidder(etat)
    if (!p) break
    // La coinche se dit à la volée : un adversaire du preneur, avant la parole suivante.
    const coincheur = S.find((q) => joueur(q).coincher?.(mains[q], etat, q))
    if (coincheur) {
      etat = apply(etat, { kind: 'coinche', player: coincheur })
      continue
    }
    // CO-5 — coinché, le preneur ne peut plus que passer.
    const choix = etat.entries.some((e) => e.kind === 'coinche')
      ? null
      : joueur(p).encherir(mains[p], etat, p)
    etat = apply(
      etat,
      choix
        ? { kind: 'contrat', player: p, value: choix.value, suit: choix.trump }
        : { kind: 'passe', player: p },
    )
  }
  const fin = outcome(etat)
  if (fin.status !== 'contrat' || fin.trump === null) return [0, 0]

  const restes = Object.fromEntries(S.map((p) => [p, [...mains[p]]])) as Record<PlayerId, Card[]>
  const beloteDe = S.find((p) => hasBelote(mains[p], fin.trump)) ?? null
  let jeu = newPlay(fin.trump, S[(seatOf(donneur, S) + 1) % 4], S)
  let annoncee: PlayerId | null = null
  for (let i = 0; i < 32; i++) {
    const p = currentPlayer(jeu)!
    const permis = playableFor(jeu, p, restes[p])
    const carte = joueur(p).jouer(
      {
        me: p,
        seating: S,
        hand: restes[p],
        trump: fin.trump,
        taker: fin.taker,
        current: jeu.current,
        completed: jeu.completed,
        contrat: { value: fin.value, capot: fin.capot, generale: fin.generale },
        beloteAnnoncee: annoncee,
      },
      permis,
    )
    if (p === beloteDe && (carte === `K${fin.trump}` || carte === `Q${fin.trump}`)) annoncee = p
    restes[p] = restes[p].filter((c) => c !== carte)
    jeu = applyPlayed(jeu, p, carte)
  }
  const plis = jeu.completed.map((t) => t.plays.map((x) => ({ seat: seatOf(x.player, S), card: x.card })))
  const r = scoreDeal(
    plis,
    {
      takerSeat: seatOf(fin.taker, S),
      value: fin.value,
      trump: fin.trump,
      multiplier: fin.multiplier,
      capot: fin.capot,
      generale: fin.generale,
    },
    undefined,
    beloteDe === null ? null : seatOf(beloteDe, S),
  )
  return r.scores
}

describe('tournoi', () => {
  it('A contre B, donnes jouées deux fois', () => {
    const a = JOUEURS[process.env.A ?? 'expert']
    const b = JOUEURS[process.env.B ?? 'base']
    const N = Number(process.env.DONNES ?? 100)
    let g = Number(process.env.GRAINE ?? 1)
    const rnd = () => (g = (g * 1103515245 + 12345) % 2147483648) / 2147483648
    let pourA = 0
    let pourB = 0
    const ecarts: number[] = []
    const debut = Date.now()
    for (let n = 0; n < N; n++) {
      const pile = shuffle([...DECK], rnd)
      const donneur = S[n % 4]
      const x = jouerDonne(pile, donneur, a, b)
      const y = jouerDonne(pile, donneur, b, a)
      pourA += x[0] + y[1]
      pourB += x[1] + y[0]
      ecarts.push(x[0] + y[1] - x[1] - y[0])
    }
    const moyenne = (pourA - pourB) / N
    const ecartType = Math.sqrt(ecarts.reduce((s, e) => s + (e - moyenne) ** 2, 0) / (N - 1))
    console.log(
      `${a.nom} contre ${b.nom} sur ${N} donnes (×2) : ${pourA} à ${pourB}, ` +
        `soit ${moyenne >= 0 ? '+' : ''}${(moyenne / 2).toFixed(1)} points par donne ` +
        `(± ${((1.96 * ecartType) / Math.sqrt(N) / 2).toFixed(1)}), ${((Date.now() - debut) / 1000).toFixed(0)} s`,
    )
  }, 0)
})
