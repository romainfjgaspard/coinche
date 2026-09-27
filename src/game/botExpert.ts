/**
 * Le bot ★ : il joue ses cartes avec le solveur, comme l'analyse de fin de partie.
 *
 * Il ne voit **pas** les mains des autres : sa vue est celle du bot de base (sa main,
 * les cartes tombées, le contrat, la belote annoncée), rien de plus. Il imagine des
 * répartitions des cartes cachées compatibles avec ce qu'il sait — les couleurs où
 * chacun a montré qu'il n'avait plus rien comprises —, résout chacune à cartes ouvertes,
 * et joue la carte qui donne en moyenne le plus de chances à son camp (réussir le
 * contrat, ou le faire chuter), puis le plus de points.
 *
 * Un test vérifie qu'il joue la même carte quelles que soient les vraies mains des autres.
 */
import { type Card, DECK, suitOf, value } from './cards'
import { type BotView, chooseCard } from './bot'
import { cartesImpossibles, hasard, tirerRepartition } from './analyseJoueur'
import { type PlayerId, seatOf } from './players'
import { type Memoire, resoudre } from './solveur'

export interface VueExpert extends BotView {
  contrat: { value: number; capot: boolean; generale: boolean }
  /** Qui a annoncé la belote dans cette donne : c'est public */
  beloteAnnoncee: PlayerId | null
}

export interface OptionsExpert {
  /** Au plus tant de répartitions imaginées */
  echantillons?: number
  /** Au moins tant, même si le temps est écoulé */
  minimum?: number
  /** Temps de réflexion visé, en millisecondes */
  budgetMs?: number
  graine?: number
  /** Voir `TOLERANCE` */
  tolerance?: { chances: number; points: number }
}

/** Le bot ★ sait-il jouer ce contrat ? Sinon il joue comme le bot de base. */
export const expertSaitJouer = (vue: VueExpert): boolean =>
  vue.trump !== null && vue.trump !== 'ta' && !vue.contrat.generale

export function choisirCarteExpert(vue: VueExpert, permis: Card[], options: OptionsExpert = {}): Card {
  if (permis.length === 1) return permis[0]
  if (!expertSaitJouer(vue)) return chooseCard(vue, permis)
  const { echantillons = 40, minimum = 8, budgetMs = 1500 } = options
  const trump = vue.trump
  const siege = (p: PlayerId) => seatOf(p, vue.seating)
  const s = siege(vue.me)
  const monCamp = (s & 1) as 0 | 1
  const preneur = (siege(vue.taker) & 1) as 0 | 1
  const objectif = vue.contrat.capot ? 'plis' : 'points'

  const faits = vue.completed.map((t) => t.plays.map((p) => ({ siege: siege(p.player), carte: p.card })))
  const pli = vue.current.map((p) => ({ siege: siege(p.player), carte: p.card }))
  const joues = [...faits.flat(), ...pli]
  const interdit = cartesImpossibles([...faits, pli], trump)
  const connues = new Set<Card>([...vue.hand, ...joues.map((x) => x.carte)])
  const inconnues = DECK.filter((c) => !connues.has(c))
  const autres = [0, 1, 2, 3].filter((x) => x !== s)
  const places = [0, 1, 2, 3].map((x) =>
    x === s ? vue.hand.length : 8 - vue.completed.length - (pli.some((y) => y.siege === x) ? 1 : 0),
  )

  // Ce que chaque camp a déjà ramassé : points (dix de der compris) ou plis.
  const acquis: [number, number] = [0, 0]
  vue.completed.forEach((t) => {
    const camp = (siege(t.winner) & 1) as 0 | 1
    acquis[camp] += objectif === 'plis' ? 1 : t.plays.reduce((n, p) => n + value(p.card, trump), 0)
  })
  const restePoints = 162 - acquis[0] - acquis[1]
  const entameur = pli.length > 0 ? pli[0].siege : siege(vue.completed.at(-1)?.winner ?? vue.me)

  const passe = (totalPreneur: number, belote: number): boolean =>
    vue.contrat.capot
      ? totalPreneur === 8
      : totalPreneur + belote >= vue.contrat.value && totalPreneur + belote > 162 - totalPreneur
  const aPose = (x: number, c: Card) => joues.some((y) => y.siege === x && y.carte === c)

  const r = hasard(options.graine ?? 1 + joues.length * 97 + s)
  const reussites = new Map<Card, number>(permis.map((c) => [c, 0]))
  const points = new Map<Card, number>(permis.map((c) => [c, 0]))
  const debut = Date.now()
  let n = 0
  for (let k = 0; k < echantillons; k++) {
    if (n >= minimum && Date.now() - debut > budgetMs) break
    const tirage = tirerRepartition(inconnues, places, interdit, autres, r)
    if (!tirage) continue
    const mains = [0, 1, 2, 3].map((x) => (x === s ? vue.hand : tirage[x]))
    // La belote du preneur : annoncée par son camp, ou Roi et Dame dans une même main imaginée.
    const roi = `K${trump}` as Card
    const dame = `Q${trump}` as Card
    const belote =
      objectif === 'points' &&
      ((vue.beloteAnnoncee !== null && (siege(vue.beloteAnnoncee) & 1) === preneur) ||
        [0, 1, 2, 3].some(
          (x) =>
            (x & 1) === preneur &&
            (mains[x].includes(roi) || aPose(x, roi)) &&
            (mains[x].includes(dame) || aPose(x, dame)),
        ))
        ? 20
        : 0
    const memoire: Memoire = new Map()
    for (const c of permis) {
      const v = resoudre(
        {
          mains: mains.map((m, x) => (x === s ? m.filter((y) => y !== c) : m)),
          pli: [...pli, { siege: s, carte: c }],
          entameur,
          plisJoues: vue.completed.length,
          trump,
          equipe: preneur,
          objectif,
        },
        memoire,
      )
      const totalPreneur = acquis[preneur] + v
      if (passe(totalPreneur, belote)) reussites.set(c, reussites.get(c)! + 1)
      const pourMonCamp =
        objectif === 'plis' ? 0 : monCamp === preneur ? totalPreneur : acquis[monCamp] + restePoints - v
      points.set(c, points.get(c)! + pourMonCamp)
    }
    n += 1
  }
  if (n === 0) return chooseCard(vue, permis)

  const pourMoi = (c: Card) => {
    const chances = reussites.get(c)! / n
    return monCamp === preneur ? chances : 1 - chances
  }
  // À égalité de chances et de points, la carte la moins chère : on garde les honneurs.
  const meilleure = [...permis].sort(
    (a, b) =>
      pourMoi(b) - pourMoi(a) ||
      points.get(b)! - points.get(a)! ||
      value(a, trump) - value(b, trump) ||
      suitOf(a).localeCompare(suitOf(b)),
  )[0]

  // Imaginer les mains à cartes ouvertes a un travers : dans chaque tirage, le bot « sait »
  // où sont les cartes, donc tirer atout ne lui paraît jamais urgent. Quand l'écart avec
  // le bon réflexe du bot de base tient dans le bruit des tirages, on garde le réflexe.
  const reflexe = chooseCard(vue, permis)
  const tolerance = options.tolerance ?? TOLERANCE
  if (
    pourMoi(meilleure) - pourMoi(reflexe) <= tolerance.chances &&
    (points.get(meilleure)! - points.get(reflexe)!) / n <= tolerance.points
  )
    return reflexe
  return meilleure
}

/** Jusqu'où le réflexe du bot de base l'emporte : en part de chances (0-1), en points. */
export const TOLERANCE = { chances: 0.05, points: 4 }
