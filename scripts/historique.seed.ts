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
 * Lancement : npm run emu, puis npm run seed:stats ($env:PARTIES pour le nombre, 8 par défaut ;
 * $env:PARTENAIRES pour ne jouer que certaines affiches, voir placementEquilibre).
 * Vraie base : $env:SEED_CONFIRME='coinche-e708b'; npm run seed:stats:prod
 */
import { describe, it } from 'vitest'
import { getDoc } from 'firebase/firestore'
import { type Client, db, makeClient, useEmulators } from '../src/firebase/app'
import {
  type GameDoc, createGame, deal, gameRef, handRef, placeBid, playCard, readArchives, readJournal, signIn, tableDe,
  takeSeat,
} from '../src/firebase/partie'
import { type BiddingEntry, currentBidder, highestBid, rankOf } from '../src/game/bidding'
import { chooseBid, chooseCard } from '../src/game/bot'
import type { Card } from '../src/game/cards'
import { canDeclareBelote, currentPlayer, playableFor } from '../src/game/play'
import { PLAYER_IDS, type PlayerId, type Seating, partnerOf, teamOfPlayer } from '../src/game/players'
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
  const events = await readJournal(code, c)
  const etat = biddingFromEvents(events, game.dealer, tableDe(game))
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
  const partenaire = meilleure?.player === partnerOf(joueur, tableDe(game))
  const dernier = etat.entries.length === 3 && meilleure === null
  const main_ = await main(c, code, joueur)

  // Un adversaire du preneur qui se sent fort coinche parfois.
  if (meilleure && !partenaire && meilleure.kind === 'contrat'
      && teamOfPlayer(meilleure.player, tableDe(game)) !== teamOfPlayer(joueur, tableDe(game))
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
  const events = await readJournal(code, c)
  const etat = playFromEvents(events, game.dealer, tableDe(game))
  if (!etat || currentPlayer(etat) !== joueur) return
  const main_ = await main(c, code, joueur)
  const jouables = playableFor(etat, joueur, main_)
  const contrat = [...currentDeal(events)].reverse().find((e) => e.type === 'contrat_fixe')
  const preneur = contrat && contrat.type === 'contrat_fixe' ? contrat.taker : joueur
  const carte = chooseCard({
    me: joueur, seating: tableDe(game), hand: main_, trump: etat.trump, taker: preneur,
    current: etat.current, completed: etat.completed,
  }, jouables, 'compteur')
  // BEL-2 : la belote s'annonce… sauf quand on l'oublie.
  const belote = canDeclareBelote(etat, joueur, carte, main_, etat.trump) && hasard(0.8)
  await playCard(code, joueur, carte, belote, c)
}

/**
 * Les trois affiches possibles à quatre : Romain avec chacun des trois autres.
 * Chaque partie prend l'affiche la moins jouée parmi les archives déjà déposées — y
 * compris celles d'avant le semis — pour que chaque duo ait autant de matchs.
 */
function afficheDe(seating: Seating): string {
  return [[seating[0], seating[2]], [seating[1], seating[3]]]
    .map((duo) => [...duo].sort().join('+'))
    .sort()
    .join(' vs ')
}

async function placementEquilibre(c: Client): Promise<Seating> {
  const autres = PLAYER_IDS.filter((p) => p !== 'romain')
  // $env:PARTENAIRES="benel,roux" : seulement les affiches où Romain joue avec eux,
  // pour rattraper des appariements en retard ailleurs (en prod, par exemple).
  const voulus = (process.env.PARTENAIRES ?? '').split(',').map((p) => p.trim()).filter(Boolean)
  const affiches: Seating[] = autres
    .filter((partenaire) => voulus.length === 0 || voulus.includes(partenaire))
    .map((partenaire) => {
      const [a, b] = autres.filter((p) => p !== partenaire)
      return ['romain', a, partenaire, b] as const
    })
  const jouees = new Map<string, number>()
  for (const archive of await readArchives(c)) {
    const cle = afficheDe(archive.seating)
    jouees.set(cle, (jouees.get(cle) ?? 0) + 1)
  }
  const moins = Math.min(...affiches.map((s) => jouees.get(afficheDe(s)) ?? 0))
  const candidates = affiches.filter((s) => (jouees.get(afficheDe(s)) ?? 0) === moins)
  const choisie = candidates[Math.floor(Math.random() * candidates.length)]
  // Même affiche, mais la place de chacun et le premier donneur varient d'une partie à l'autre.
  const decalage = Math.floor(Math.random() * 4)
  const siege = (i: number): PlayerId => choisie[(i + decalage) % 4]
  return [siege(0), siege(1), siege(2), siege(3)]
}

async function jouerUnePartie(n: number): Promise<void> {
  const lecteur = await makeClient(`historique-${n}-lecteur-${Date.now()}`)
  await signIn(lecteur)
  const seating = await placementEquilibre(lecteur)
  console.log(`partie ${n} : ${afficheDe(seating)}`)
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
      const events = await readJournal(code, clients[createur])
      const qui = currentBidder(biddingFromEvents(events, game.dealer, tableDe(game)))
      if (qui) await parler(clients, code, game, qui)
    } else if (game.phase === 'jeu') {
      const events = await readJournal(code, clients[createur])
      const etat = playFromEvents(events, game.dealer, tableDe(game))
      const qui = etat ? currentPlayer(etat) : null
      if (qui) await poser(clients, code, game, qui)
    }
  }
  throw new Error(`partie ${n} (${code}) : pas terminée après 5000 actions`)
}

describe('historique fictif', () => {
  it(`joue ${PARTIES} parties complètes et dépose leurs archives`, async () => {
    // La vraie base seulement sur demande explicite, en nommant le projet visé.
    const projet = db.app.options.projectId
    if (!useEmulators && process.env.SEED_CONFIRME !== projet) {
      throw new Error(`Refus : vraie base (${projet}). Confirmer avec SEED_CONFIRME=${projet}`)
    }
    console.log(`semis de ${PARTIES} parties sur ${useEmulators ? 'l\'émulateur' : `la VRAIE base ${projet}`}`)
    for (let n = 1; n <= PARTIES; n++) await jouerUnePartie(n)
  }, 60 * 60 * 1000)
})
