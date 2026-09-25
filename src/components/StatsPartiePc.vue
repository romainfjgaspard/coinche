<script setup lang="ts">
import { ecartsAnnonce, repartitionAnnonces, rolesPrise, tempsParJoueur } from '../game/statsEncheres'
import { couleursPartie } from '../composables/couleursJoueurs'
import StatsEncheres from './StatsEncheres.vue'
import StatsEcarts from './StatsEcarts.vue'
import StatsTemps from './StatsTemps.vue'
import StatsDonnes from './StatsDonnes.vue'
/**
 * Statistiques de la partie en cours, sur grand écran — la maquette validée
 * « Stats — partie en cours — ordinateur ». Dessinée pour 1920 px de large ; le parent
 * la met à l'échelle de l'écran.
 */
import { computed } from 'vue'
import { type PlayerId, partnerOf, playerAtSeat, seatOf, teamOfPlayer } from '../game/players'
import { nomDe } from '../stores/roster'
import { type Chrono, bilan, cascade, enchereMoyenne, moyenne, teamTallies } from '../game/stats'
import { duree } from '../game/display'
import { useSession } from '../stores/session'

const session = useSession()

const OR = '#d9a441'
const BLEU = '#7fa8c9'
const ROUGE = '#e2564a'
const CLAIR = '#cfe0d8'

const nousTeam = computed(() => session.myTeam)
const euxTeam = computed(() => (session.myTeam === 0 ? 1 : 0))
const couleurDe = (p: PlayerId): string => (teamOfPlayer(p, session.seating) === nousTeam.value ? OR : BLEU)
const nom = (p: PlayerId): string => nomDe(p)

const scores = computed<[number, number]>(() => session.game?.scores ?? [0, 0])
const nous = computed(() => scores.value[nousTeam.value])
const eux = computed(() => scores.value[euxTeam.value])

/** Les joueurs de chaque camp, pour l'en-tête et le tableau par équipe. */
const campDe = (team: 0 | 1): PlayerId[] =>
  session.seating.filter((p) => teamOfPlayer(p, session.seating) === team)
const nomCamp = (team: 0 | 1): string => campDe(team).map(nom).join(' & ')
const donnesJouees = computed(() => session.dealSummaries.filter((d) => d.status !== null).length)

// --- Évolution du score : repère de 900 × 250, comme la maquette
const courbe = computed(() => {
  const points = session.scoreCurve
  const n = Math.max(1, points.length - 1)
  const plafond = Math.max(160, ...points.map((p) => Math.max(...p.scores)))
  const max = Math.ceil(plafond / 160) * 160
  const X0 = 40
  const X1 = 886
  const Y0 = 230
  const Y1 = 16
  const x = (i: number) => X0 + (i * (X1 - X0)) / n
  const y = (v: number) => Y0 - (v / max) * (Y0 - Y1)
  const ligne = (t: 0 | 1) => points.map((p, i) => `${x(i).toFixed(1)},${y(p.scores[t]).toFixed(1)}`).join(' ')
  const fin = points.at(-1)
  const dernier = points.length - 1
  // Étiquettes de fin à gauche du dernier point, comme la maquette : celle du camp en
  // tête au-dessus de sa courbe, l'autre en dessous, pour qu'elles ne se croisent jamais.
  const yN = fin ? y(fin.scores[nousTeam.value]) : Y0
  const yE = fin ? y(fin.scores[euxTeam.value]) : Y0
  const nousDessus = fin ? fin.scores[nousTeam.value] >= fin.scores[euxTeam.value] : true
  const pas = max / 4
  return {
    grid: [0, 1, 2, 3, 4].map((k) => ({ v: k * pas, y: y(k * pas) })),
    nous: ligne(nousTeam.value),
    eux: ligne(euxTeam.value),
    finNous: { x: x(dernier), y: yN, lx: x(dernier) - 66, ly: nousDessus ? yN - 10 : yN + 18 },
    finEux: { x: x(dernier), y: yE, lx: x(dernier) - 62, ly: nousDessus ? yE + 18 : yE - 10 },
  }
})

// --- Momentum en cascade : chaque barre part de la fin de la précédente
const HAUTEUR_MOMENTUM = 240
const momentum = computed(() => {
  const c = cascade(session.momentumBars, nousTeam.value)
  const hi = Math.max(0, ...c.map((b) => Math.max(b.avant, b.apres)))
  const lo = Math.min(0, ...c.map((b) => Math.min(b.avant, b.apres)))
  const y = (v: number) => ((hi - v) / Math.max(1, hi - lo)) * HAUTEUR_MOMENTUM
  return {
    zero: y(0),
    barres: c.map((b) => {
      const haut = y(Math.max(b.avant, b.apres))
      return {
        n: `D${b.deal}`,
        nous: b.nous,
        points: b.points,
        top: haut,
        height: Math.max(2, y(Math.min(b.avant, b.apres)) - haut),
        titre: `Donne ${b.deal} : ${b.points} points pour ${b.nous ? 'nous' : 'eux'}`,
      }
    }),
  }
})

// --- Par équipe
const equipes = computed(() => {
  const t = teamTallies(session.dealSummaries, session.seating)
  return ([nousTeam.value, euxTeam.value] as const).map((team) => {
    const e = t[team]
    return {
      nom: `${team === nousTeam.value ? 'Nous' : 'Eux'} — ${nomCamp(team)}`,
      couleur: team === nousTeam.value ? OR : BLEU,
      cells: [
        String(e.donnesGagnees),
        String(e.prises),
        String(e.reussies),
        e.enchereMoyenne === null ? '—' : String(e.enchereMoyenne),
        `${e.coinches} / ${e.coinchesGagnees}`,
        String(e.etoiles),
        String(scores.value[team]),
      ],
    }
  })
})

// --- Par joueur
const prises = computed(() =>
  session.seating.map((p) => {
    const t = session.playerTallies.get(p)
    const resultats = session.dealSummaries
      .filter((d) => d.taker === p && d.status !== null)
      .map((d) => d.status !== 'chute')
    const b = t ? bilan(t) : 0
    return {
      id: p,
      nom: nom(p),
      prises: t?.prises ?? 0,
      resultats,
      enchere: t ? (enchereMoyenne(t) ?? '—') : '—',
      bilan: `${b > 0 ? '+' : b < 0 ? '−' : ''}${Math.abs(b)}`,
      bilanBrut: b,
      couleur: couleurDe(p),
    }
  }).sort((a, b) => b.bilanBrut - a.bilanBrut),
)


/** Le temps de réflexion : moyenne pour annoncer, pour jouer, et la plus longue hésitation. */
const tempsReflexion = computed(() =>
  [...session.seating].map((p) => {
    const r = session.reflexionsPartie.get(p)
    const m = (c?: Chrono) => (c ? moyenne(c) : null)
    const max = Math.max(r?.encheres.max ?? 0, r?.cartes.max ?? 0)
    return {
      id: p,
      nom: nomDe(p),
      annonce: m(r?.encheres),
      carte: m(r?.cartes),
      max: max > 0 ? max : null,
    }
  }),
)
const aucunTemps = computed(() => tempsReflexion.value.every((t) => t.annonce === null && t.carte === null))

// --- Ce qui s'est passé
const faits = computed(() => {
  const list = session.dealSummaries.filter((d) => d.status !== null)
  const etoiles = list.filter((d) => d.etoile)
  const oublis = list.filter((d) => d.beloteForgottenBy)
  const plusGrosse = [...list].sort((a, b) => Math.max(...b.scores) - Math.max(...a.scores))[0]
  const coinchees = list.filter((d) => d.coincheurs.length > 0)
  const t = teamTallies(session.dealSummaries, session.seating)
  const coinchesGagnees = t[0].coinchesGagnees + t[1].coinchesGagnees
  const coinchesDonnees = t[0].coinches + t[1].coinches
  return [
    {
      titre: etoiles.length > 1 ? 'Étoiles de la honte' : 'Étoile de la honte',
      valeur: etoiles.length ? etoiles.map((d) => nom(d.etoile!)).join(', ') : 'aucune',
      couleur: etoiles.length ? ROUGE : CLAIR,
      detail: etoiles.map((d) => `capot à la donne ${d.dealNumber}, annoncé ${d.value}`).join(' · '),
    },
    {
      titre: oublis.length > 1 ? 'Belotes oubliées' : 'Belote oubliée',
      valeur: oublis.length ? oublis.map((d) => nom(d.beloteForgottenBy!)).join(', ') : 'aucune',
      couleur: oublis.length ? ROUGE : CLAIR,
      detail: oublis.map((d) => `20 points laissés donne ${d.dealNumber}`).join(' · '),
    },
    {
      titre: 'Plus grosse donne',
      valeur: plusGrosse ? `${Math.max(...plusGrosse.scores)} points` : '—',
      couleur: OR,
      detail: plusGrosse?.taker
        ? `${nom(plusGrosse.taker)}, contrat${plusGrosse.multiplier > 1 ? ' coinché' : ''} donne ${plusGrosse.dealNumber}`
        : '',
    },
    {
      titre: 'Coinches',
      valeur: coinchesDonnees
        ? `${coinchesDonnees} donnée${coinchesDonnees > 1 ? 's' : ''}, ${coinchesGagnees} gagnée${coinchesGagnees > 1 ? 's' : ''}`
        : 'aucune',
      couleur: CLAIR,
      detail: coinchees.map((d) => `${d.coincheurs.map(nom).join(' et ')} donne ${d.dealNumber}`).join(', '),
    },
  ]
})

// --- Les sous-onglets : enchères, écarts, temps et donnes, comme sur téléphone.
defineProps<{ vue: string }>()
const joueursPartie = computed<PlayerId[]>(() => {
  const t = session.seating
  const moi = session.playerId && t.includes(session.playerId) ? session.playerId : t[0]
  const i = seatOf(moi, t)
  return [moi, partnerOf(moi, t), playerAtSeat(i + 1, t), playerAtSeat(i + 3, t)]
})
const couleursJoueursPartie = computed(() => couleursPartie(joueursPartie.value))
const annoncesPartie = computed(() => repartitionAnnonces(session.events))
const rolesPartie = computed(() => rolesPrise(session.events, session.seating))
const ecartsPartie = computed(() => ecartsAnnonce(session.events, session.seating))
const tempsPartie = computed(() => tempsParJoueur(session.events))
</script>

<template>
  <div class="mt-[26px] grid grid-cols-2 items-start gap-x-10">
    <template v-if="vue === 'score'">
    <section>
      <div class="flex items-baseline gap-3.5">
        <div>
          <p class="text-[11px] tracking-[.1em] text-gold">NOUS</p>
          <p class="mt-0.5 font-display text-[46px] leading-none">{{ nous }}</p>
        </div>
        <p class="text-[22px] text-dusk">·</p>
        <div>
          <p class="text-[11px] tracking-[.1em] text-them">EUX</p>
          <p class="mt-0.5 font-display text-[46px] leading-none text-mist">{{ eux }}</p>
        </div>
      </div>

      <h2 class="mt-[22px] mb-0.5 text-[13px] font-semibold">Évolution du score</h2>
      <p class="mb-2 text-[11px] text-sage">Cumul après chaque donne</p>
      <p v-if="session.scoreCurve.length < 2" class="text-sm text-sage">Aucune donne terminée.</p>
      <svg
        v-else
        viewBox="0 0 900 250"
        width="100%"
        height="250"
        role="img"
        :aria-label="`Évolution du score : Nous ${nous}, Eux ${eux} après ${donnesJouees} donnes`"
      >
        <g stroke="rgba(255,255,255,.08)" stroke-width="1">
          <line v-for="g in courbe.grid" :key="g.v" x1="34" :y1="g.y" x2="886" :y2="g.y" />
        </g>
        <text
          v-for="g in courbe.grid"
          :key="`t${g.v}`"
          x="28"
          :y="g.y + 4"
          text-anchor="end"
          font-size="11"
          fill="#6f8f82"
        >
          {{ g.v }}
        </text>
        <polyline :points="courbe.nous" fill="none" :stroke="OR" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
        <polyline :points="courbe.eux" fill="none" :stroke="BLEU" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
        <circle :cx="courbe.finNous.x" :cy="courbe.finNous.y" r="5" :fill="OR" stroke="#0a2a1f" stroke-width="2" />
        <circle :cx="courbe.finEux.x" :cy="courbe.finEux.y" r="5" :fill="BLEU" stroke="#0a2a1f" stroke-width="2" />
        <text :x="courbe.finNous.lx" :y="courbe.finNous.ly" font-size="13" font-weight="700" :fill="OR">
          {{ `Nous ${nous}` }}
        </text>
        <text :x="courbe.finEux.lx" :y="courbe.finEux.ly" font-size="13" font-weight="700" :fill="BLEU">
          {{ `Eux ${eux}` }}
        </text>
      </svg>

      <h2 class="mt-4 mb-0.5 text-[13px] font-semibold">Momentum</h2>
      <p class="mb-2 text-[11px] text-sage">
        Points gagnés par donne, en cascade : chaque barre part de la fin de la précédente —
        vers le haut pour nous, vers le bas pour eux
      </p>
      <p v-if="!momentum.barres.length" class="text-sm text-sage">Aucune donne terminée.</p>
      <div v-else>
        <div class="relative mt-5 mb-5" :style="{ height: `${HAUTEUR_MOMENTUM}px` }">
          <!-- Le zéro : au-dessus, nous menons ; en dessous, eux -->
          <div class="absolute inset-x-0 h-px bg-white/18" :style="{ top: `${momentum.zero}px` }"></div>
          <div class="absolute inset-0 flex gap-1">
            <div v-for="b in momentum.barres" :key="b.n" class="relative max-w-[88px] grow" :title="b.titre">
              <div
                class="absolute left-[15%] w-[70%] rounded-sm"
                :class="b.nous ? 'bg-gold' : 'bg-them'"
                :style="{ top: `${b.top}px`, height: `${b.height}px` }"
              ></div>
              <!-- Les points au bout de la barre : au-dessus quand elle monte, dessous quand elle descend -->
              <span
                class="absolute inset-x-0 text-center text-[11px] font-semibold tabular-nums"
                :class="b.nous ? 'text-gold' : 'text-them'"
                :style="b.nous ? { top: `${b.top - 17}px` } : { top: `${b.top + b.height + 3}px` }"
              >{{ b.points }}</span>
            </div>
          </div>
        </div>
        <div class="flex gap-1">
          <span v-for="b in momentum.barres" :key="b.n" class="max-w-[88px] grow text-center text-[11px] text-dusk">{{ b.n }}</span>
        </div>
      </div>
    </section>

    <section>
      <h2 class="mb-2.5 text-[13px] font-semibold">Par équipe</h2>
      <table class="mb-[22px] w-full border-collapse text-[13px]">
        <thead>
          <tr class="text-left text-[11px] tracking-[.06em] text-sage">
            <th class="pr-[18px] pb-2 font-semibold">ÉQUIPE</th>
            <th
              v-for="c in ['DONNES GAGN.', 'PRISES', 'RÉUSSIES', 'ENCH. MOY', 'COINCHES', '★', 'SCORE']"
              :key="c"
              class="pb-2 text-right font-semibold [&:not(:last-child)]:pr-[18px]"
            >
              {{ c }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in equipes" :key="e.nom" class="border-t border-white/7">
            <td class="py-[11px] pr-[18px] font-semibold" :style="{ color: e.couleur }">{{ e.nom }}</td>
            <td
              v-for="(v, i) in e.cells"
              :key="i"
              class="py-[11px] text-right text-mist tabular-nums [&:not(:last-child)]:pr-[18px]"
            >
              {{ v }}
            </td>
          </tr>
        </tbody>
      </table>

      <h2 class="mb-2.5 text-[13px] font-semibold">Par joueur, donne par donne</h2>
      <table class="w-full border-collapse text-[13px]">
        <thead>
          <tr class="text-left text-[11px] tracking-[.06em] text-sage">
            <th class="pr-[18px] pb-2 font-semibold">JOUEUR</th>
            <th class="pr-[18px] pb-2 text-right font-semibold">PRISES</th>
            <th class="pr-[18px] pb-2 font-semibold">RÉSULTAT</th>
            <th class="pr-[18px] pb-2 text-right font-semibold">ENCHÈRE MOY.</th>
            <th class="pb-2 text-right font-semibold">BILAN</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in prises" :key="p.id" class="border-t border-white/7">
            <td class="py-[11px] pr-[18px] font-semibold">{{ p.nom }}</td>
            <td class="py-[11px] pr-[18px] text-right text-mist tabular-nums">{{ p.prises }}</td>
            <td class="py-[11px] pr-[18px]">
              <span class="flex gap-1">
                <span
                  v-for="(ok, i) in p.resultats"
                  :key="i"
                  class="size-[15px] rounded-[3px] border"
                  :class="ok ? 'border-gold bg-gold' : 'border-gold/45'"
                  :title="ok ? 'contrat réussi' : 'contrat chuté'"
                ></span>
              </span>
            </td>
            <td class="py-[11px] pr-[18px] text-right text-mist tabular-nums">{{ p.enchere }}</td>
            <td class="py-[11px] text-right font-bold tabular-nums" :style="{ color: p.couleur }">{{ p.bilan }}</td>
          </tr>
        </tbody>
      </table>
      <p class="mt-2.5 text-[11px] leading-normal text-dusk">
        Carré plein = contrat réussi, creux = chuté. Aucun pourcentage : sur deux ou trois prises, un ratio ne dit
        rien.
      </p>

    </section>
    </template>

    <template v-else-if="vue === 'encheres'">
      <StatsEncheres :joueurs="joueursPartie" :couleurs="couleursJoueursPartie" :annonces="annoncesPartie" :roles="rolesPartie" />
    </template>

    <template v-else-if="vue === 'jeu'">
      <StatsEcarts :joueurs="joueursPartie" :couleurs="couleursJoueursPartie" :ecarts="ecartsPartie" />
      <section>
      <h2 class="mt-6 mb-2 text-[15px] font-semibold">Temps de réflexion</h2>
      <p v-if="aucunTemps" class="text-sm text-sage">Pas encore mesuré sur cette partie.</p>
      <table v-else class="w-full border-collapse text-[13px]">
        <thead>
          <tr class="text-[11px] tracking-[.06em] text-sage">
            <th class="pb-2 text-left font-semibold">JOUEUR</th>
            <th class="pb-2 text-right font-semibold">POUR ANNONCER</th>
            <th class="pb-2 text-right font-semibold">POUR JOUER</th>
            <th class="pb-2 text-right font-semibold">PLUS LONGUE HÉSITATION</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in tempsReflexion" :key="t.id" class="border-t border-white/7">
            <td class="py-2 font-semibold">{{ t.nom }}</td>
            <td class="py-2 text-right tabular-nums text-mist">{{ t.annonce === null ? '—' : duree(t.annonce) }}</td>
            <td class="py-2 text-right tabular-nums text-mist">{{ t.carte === null ? '—' : duree(t.carte) }}</td>
            <td class="py-2 text-right tabular-nums text-mist">{{ t.max === null ? '—' : duree(t.max) }}</td>
          </tr>
        </tbody>
      </table>
      <p class="mt-2 text-[11px] leading-relaxed text-dusk">
        Moyennes, mesurées sur l'écran de chacun depuis que c'est à lui. La coinche, prise hors tour, n'en a pas.
      </p>

      </section>
      <StatsTemps :joueurs="joueursPartie" :couleurs="couleursJoueursPartie" :temps="tempsPartie" />
    </template>

    <template v-else>
      <StatsDonnes :events="session.events" :seating="session.seating" :nous="session.myTeam" />
      <section>
      <h2 class="mt-5 mb-2.5 text-[15px] font-semibold">Ce qui s'est passé</h2>
      <div class="grid grid-cols-2 gap-2.5">
        <div v-for="f in faits" :key="f.titre" class="rounded-[10px] border border-white/8 bg-white/4 px-3.5 py-3">
          <p class="text-[11px] text-sage">{{ f.titre }}</p>
          <p class="mt-1 text-[15px] font-semibold" :style="{ color: f.couleur }">{{ f.valeur }}</p>
          <p v-if="f.detail" class="mt-0.5 text-xs text-mist">{{ f.detail }}</p>
        </div>
      </div>
      </section>
    </template>
  </div>
</template>
