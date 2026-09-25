/**
 * L'analyse d'une donne carte par carte, avec l'information du joueur — comme les
 * sites d'échecs, mais pour un jeu où l'on ne voit pas les cartes des autres.
 *
 * Juger à cartes ouvertes serait injuste : une carte excellente vu ce qu'on savait peut
 * être mauvaise une fois tout dévoilé. Pour chaque carte jouée, on tire donc au hasard
 * des répartitions des cartes cachées **compatibles avec ce que le joueur savait** (sa
 * main, les cartes tombées, les couleurs où chacun a montré qu'il n'avait plus rien),
 * on résout chacune à cartes ouvertes, et on fait la moyenne.
 *
 * Le critère est celui qui décide du score : **les chances que le contrat passe**. En
 * coinche on ne marque que le contrat ; perdre dix points quand il est déjà assuré ne
 * coûte rien, en perdre deux au mauvais moment le fait chuter. La meilleure carte est
 * celle qui donne le plus de chances à son camp (au preneur de le réussir, à la défense
 * de le faire chuter) ; les points de cartes départagent les ex æquo.
 */
import { type Atout, type Card, DECK, isTrump, strength, suitOf } from './cards'
import type { DonneRevue } from './revue'
import { type PlayerId, type Seating, seatOf } from './players'
import { type PlayedCard, playableCards } from './trick'
import { type Memoire, resoudre } from './solveur'

export type Qualite = 'meilleure' | 'bonne' | 'imprecision' | 'erreur' | 'gaffe' | 'forcee'

/** Une carte permise, et ce qu'elle promettait en moyenne sur les tirages. */
export interface Option {
  carte: Card
  /** Chances que le contrat passe si on joue cette carte, de 0 à 100 */
  chances: number
  /** Points de cartes espérés par l'équipe du joueur, dix de der compris */
  points: number
}

export interface CarteJugee {
  pli: number
  joueur: PlayerId
  carte: Card
  qualite: Qualite
  /** Chances perdues pour son camp par rapport à la meilleure carte, en points de % */
  perteChances: number
  /** Points de cartes perdus par rapport à la meilleure carte */
  pertePoints: number
  /** La meilleure carte, si ce n'est pas celle jouée */
  meilleure: Card | null
  /** Chances du contrat après la carte jouée : la courbe de la donne */
  chancesApres: number
  /** Chaque carte permise, de la meilleure à la moins bonne pour le joueur */
  options: Option[]
}

/**
 * Au-delà de ces pertes de chances (en points de %), la carte change de catégorie.
 * Sans enjeu pour le contrat, on regarde les points : une carte qui en laisse filer
 * beaucoup reste une imprécision.
 */
export const SEUILS = { bonne: 5, imprecision: 12, erreur: 30 }
export const SEUIL_POINTS = 10
export function qualiteDe(
  perteChances: number,
  pertePoints: number,
  forcee: boolean,
  meilleure: boolean,
): Qualite {
  if (forcee) return 'forcee'
  if (meilleure) return 'meilleure'
  if (perteChances < SEUILS.bonne)
    return pertePoints >= SEUIL_POINTS
      ? 'imprecision'
      : perteChances < 0.5 && pertePoints < 1
        ? 'meilleure'
        : 'bonne'
  if (perteChances < SEUILS.imprecision) return 'imprecision'
  if (perteChances < SEUILS.erreur) return 'erreur'
  return 'gaffe'
}

/**
 * Ce qu'un joueur sait des mains des autres : les cartes qu'ils ne peuvent **pas** avoir,
 * déduites des règles de fourniture (JEU-2 à JEU-8) à chaque carte qu'ils ont posée.
 */
export function cartesImpossibles(plis: { siege: number; carte: Card }[][], trump: Atout): Set<Card>[] {
  const interdit: Set<Card>[] = [new Set(), new Set(), new Set(), new Set()]
  const couleurEntiere = (s: string) => DECK.filter((c) => suitOf(c) === s)
  for (const pli of plis) {
    const joues: PlayedCard[] = []
    for (const { siege, carte } of pli) {
      if (joues.length > 0) {
        const entame = suitOf(joues[0].card)
        // La carte maîtresse avant ce coup, selon les règles du moteur.
        let best = 0
        for (let i = 1; i < joues.length; i++) {
          const c = joues[i].card
          const b = joues[best].card
          if (isTrump(c, trump) && !isTrump(b, trump)) best = i
          else if (
            isTrump(c, trump) === isTrump(b, trump) &&
            suitOf(c) === suitOf(b) &&
            strength(c, trump) > strength(b, trump)
          )
            best = i
          else if (!isTrump(c, trump) && !isTrump(b, trump) && suitOf(b) !== entame && suitOf(c) === entame)
            best = i
        }
        const maitresse = joues[best].card
        const partenaireMaitre = (joues[best].seat & 1) === (siege & 1)
        const plusFortes = (couleur: string, que: Card) =>
          DECK.filter((c) => suitOf(c) === couleur && strength(c, trump) > strength(que, trump))
        if (suitOf(carte) !== entame) {
          // Il n'a pas fourni : il n'a plus de la couleur demandée.
          for (const c of couleurEntiere(entame)) interdit[siege].add(c)
          if (!partenaireMaitre && trump !== null && trump !== 'ta') {
            if (!isTrump(carte, trump)) for (const c of couleurEntiere(trump)) interdit[siege].add(c)
            else if (isTrump(maitresse, trump) && strength(carte, trump) < strength(maitresse, trump)) {
              // Il a sous-coupé : il n'avait pas d'atout plus fort.
              for (const c of plusFortes(trump, maitresse)) interdit[siege].add(c)
            }
          }
        } else if (
          (entame === trump || trump === 'ta') &&
          !partenaireMaitre &&
          suitOf(maitresse) === entame &&
          strength(carte, trump) < strength(maitresse, trump)
        ) {
          // À l'atout, il n'a pas monté : il n'avait pas plus fort.
          for (const c of plusFortes(entame, maitresse)) interdit[siege].add(c)
        }
      }
      joues.push({ seat: siege, card: carte })
    }
  }
  return interdit
}

/** Un générateur déterministe : une analyse se rejoue à l'identique. */
export function hasard(graine: number): () => number {
  let g = graine % 2147483647 || 1
  return () => {
    g = (g * 16807) % 2147483647
    return g / 2147483647
  }
}

/**
 * Une répartition des cartes inconnues entre les trois autres, qui respecte le nombre de
 * cartes de chacun et ce qu'on sait qu'ils n'ont pas. Nulle si le tirage échoue.
 */
export function tirerRepartition(
  inconnues: Card[],
  places: number[],
  interdit: Set<Card>[],
  sieges: number[],
  r: () => number,
): Card[][] | null {
  for (let essai = 0; essai < 50; essai++) {
    const mains: Card[][] = [[], [], [], []]
    const reste = [...places]
    // Les cartes les plus contraintes d'abord : moins d'impasses.
    const ordre = inconnues
      .map((c) => ({ c, possibles: sieges.filter((s) => !interdit[s].has(c)), tri: r() }))
      .sort((a, b) => a.possibles.length - b.possibles.length || a.tri - b.tri)
    let ok = true
    for (const { c, possibles } of ordre) {
      const libres = possibles.filter((s) => reste[s] > 0)
      if (libres.length === 0) {
        ok = false
        break
      }
      const s = libres[Math.floor(r() * libres.length)]
      mains[s].push(c)
      reste[s] -= 1
    }
    if (ok) return mains
  }
  return null
}

export interface OptionsAnalyse {
  /** Répartitions tirées par carte jouée : plus il y en a, plus le jugement est sûr */
  echantillons: number
  graine?: number
  /** Seulement ces cartes (index dans la donne, de 0 à 31) : pour répartir le calcul */
  seulement?: number[]
  /** Prévenu à chaque carte analysée : la barre de progression */
  progression?: (fait: number, total: number) => void
}

/** Juge chaque carte de la donne, du point de vue de celui qui l'a jouée. */
export function analyserCartes(donne: DonneRevue, seating: Seating, options: OptionsAnalyse): CarteJugee[] {
  const contrat = donne.contrat
  if (!donne.mains || !contrat || contrat.generale || donne.blitz) return []
  const d = contrat.declaration
  const trump: Atout = d === 'ta' ? 'ta' : d === 'sa' ? null : d
  if (!contrat.capot && (trump === null || trump === 'ta')) return []
  const objectif = contrat.capot ? 'plis' : 'points'
  const siege = (p: PlayerId) => seatOf(p, seating)
  const preneur = (siege(contrat.taker) & 1) as 0 | 1
  const restantes: Card[][] = seating.map((p) => [...donne.mains![p]])
  const faits: { siege: number; carte: Card }[][] = []
  const out: CarteJugee[] = []
  const total = donne.plis.reduce((n, p) => n + p.cartes.length, 0)
  const seulement = options.seulement ? new Set(options.seulement) : null
  let fait = 0
  let index = 0
  let entameur = siege(donne.plis[0].cartes[0].player)
  // Ce que chaque camp a déjà ramassé : points (dix de der compris) ou plis.
  const acquis: [number, number] = [0, 0]

  /** Le contrat passe-t-il, si le preneur finit avec ce total et cette belote ? */
  const passe = (totalPreneur: number, belote: number): boolean =>
    contrat.capot
      ? totalPreneur === 8
      : totalPreneur + belote >= contrat.value && totalPreneur + belote > 162 - totalPreneur

  for (const p of donne.plis) {
    const pli: { siege: number; carte: Card }[] = []
    for (const { player, card } of p.cartes) {
      const s = siege(player)
      const monCamp = (s & 1) as 0 | 1
      const joues = pli.map((x) => ({ seat: x.siege, card: x.carte }))
      const permis = playableCards(restantes[s], joues, trump, s)
      const aJuger = !seulement || seulement.has(index)

      if (aJuger && permis.length === 1) {
        out.push({
          pli: p.numero,
          joueur: player,
          carte: card,
          qualite: 'forcee',
          perteChances: 0,
          pertePoints: 0,
          meilleure: null,
          chancesApres: -1,
          options: [],
        })
      } else if (aJuger) {
        // Ce que le joueur sait : sa main, les cartes tombées, et les cartes impossibles.
        const interdit = cartesImpossibles([...faits, pli], trump)
        const connues = new Set<Card>([
          ...restantes[s],
          ...faits.flat().map((x) => x.carte),
          ...pli.map((x) => x.carte),
        ])
        const inconnues = DECK.filter((c) => !connues.has(c))
        const autres = [0, 1, 2, 3].filter((x) => x !== s)
        const places = restantes.map((m) => m.length)
        const r = hasard((options.graine ?? 1) * 1000 + index)
        const reussites = new Map<Card, number>(permis.map((c) => [c, 0]))
        const points = new Map<Card, number>(permis.map((c) => [c, 0]))
        const restePoints = 162 - acquis[0] - acquis[1]
        let n = 0
        for (let k = 0; k < options.echantillons; k++) {
          const tirage = tirerRepartition(inconnues, places, interdit, autres, r)
          if (!tirage) continue
          const mains = [0, 1, 2, 3].map((x) => (x === s ? restantes[s] : tirage[x]))
          // La belote du preneur, si son camp tient Roi et Dame d'atout dans une même main.
          const belote =
            !contrat.capot &&
            trump !== null &&
            trump !== 'ta' &&
            [0, 1, 2, 3].some(
              (x) =>
                (x & 1) === preneur &&
                (mains[x].includes(`K${trump}` as Card) ||
                  faits
                    .flat()
                    .concat(pli)
                    .some((y) => y.siege === x && y.carte === `K${trump}`)) &&
                (mains[x].includes(`Q${trump}` as Card) ||
                  faits
                    .flat()
                    .concat(pli)
                    .some((y) => y.siege === x && y.carte === `Q${trump}`)),
            )
              ? 20
              : 0
          // Mêmes mains, même camp : les positions calculées pour une carte servent aux autres.
          const memoire: Memoire = new Map()
          for (const c of permis) {
            const v = resoudre(
              {
                mains: mains.map((m, x) => (x === s ? m.filter((y) => y !== c) : m)),
                pli: [...pli, { siege: s, carte: c }],
                entameur,
                plisJoues: p.numero - 1,
                trump,
                equipe: preneur,
                objectif,
              },
              memoire,
            )
            const totalPreneur = acquis[preneur] + v
            if (passe(totalPreneur, belote)) reussites.set(c, reussites.get(c)! + 1)
            if (objectif === 'points') {
              const pourMonCamp = monCamp === preneur ? totalPreneur : acquis[monCamp] + restePoints - v
              points.set(c, points.get(c)! + pourMonCamp)
            }
          }
          n += 1
        }
        const optionsTriees: Option[] = permis.map((c) => ({
          carte: c,
          chances: n ? (100 * reussites.get(c)!) / n : 0,
          points: n ? points.get(c)! / n : 0,
        }))
        // Du point de vue du joueur : le preneur veut des chances, la défense n'en veut pas.
        const pourMoi = (o: Option) => (monCamp === preneur ? o.chances : 100 - o.chances)
        optionsTriees.sort((a, b) => pourMoi(b) - pourMoi(a) || b.points - a.points)
        const meilleure = optionsTriees[0]
        const jouee = optionsTriees.find((o) => o.carte === card)!
        const perteChances = Math.max(0, pourMoi(meilleure) - pourMoi(jouee))
        const pertePoints = Math.max(0, meilleure.points - jouee.points)
        const estLaMeilleure =
          meilleure.carte === card || (perteChances === 0 && Math.abs(meilleure.points - jouee.points) < 0.5)
        const qualite = qualiteDe(perteChances, pertePoints, false, estLaMeilleure)
        out.push({
          pli: p.numero,
          joueur: player,
          carte: card,
          qualite,
          perteChances,
          pertePoints,
          // Une carte jugée « meilleure » n'a pas de meilleure à proposer.
          meilleure: qualite === 'meilleure' ? null : meilleure.carte,
          chancesApres: jouee.chances,
          options: optionsTriees,
        })
      }
      restantes[s] = restantes[s].filter((c) => c !== card)
      pli.push({ siege: s, carte: card })
      index += 1
      if (aJuger) {
        fait += 1
        options.progression?.(fait, seulement ? seulement.size : total)
      }
    }
    faits.push(pli)
    const gagnant = siege(p.gagnant)
    acquis[(gagnant & 1) as 0 | 1] += objectif === 'plis' ? 1 : p.points + (p.numero === 8 ? 10 : 0)
    entameur = gagnant
  }
  return out
}
