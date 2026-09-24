<script setup lang="ts">
/**
 * Statistiques de la partie en cours, sur grand écran — la maquette validée
 * « Stats — partie en cours — ordinateur ». Dessinée pour 1920 px de large ; le parent
 * la met à l'échelle de l'écran.
 */
import { computed } from 'vue'
import { PLAYER_IDS, PLAYER_NAMES, type PlayerId, teamOfPlayer } from '../game/players'
import { bilan, enchereMoyenne, teamTallies } from '../game/stats'
import { useSession } from '../stores/session'

const session = useSession()

const OR = '#d9a441'
const BLEU = '#7fa8c9'
const ROUGE = '#e2564a'
const CLAIR = '#cfe0d8'

const nousTeam = computed(() => session.myTeam)
const euxTeam = computed(() => (session.myTeam === 0 ? 1 : 0))
const couleurDe = (p: PlayerId): string => (teamOfPlayer(p, session.seating) === nousTeam.value ? OR : BLEU)
const nom = (p: PlayerId): string => PLAYER_NAMES[p]

const scores = computed<[number, number]>(() => session.game?.scores ?? [0, 0])
const nous = computed(() => scores.value[nousTeam.value])
const eux = computed(() => scores.value[euxTeam.value])

/** Les joueurs de chaque camp, pour l'en-tête et le tableau par équipe. */
const campDe = (team: 0 | 1): PlayerId[] =>
  PLAYER_IDS.filter((p) => teamOfPlayer(p, session.seating) === team)
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

// --- Momentum : la barre monte pour nous, descend pour eux
const barres = computed(() => {
  const list = session.momentumBars
  const max = Math.max(1, ...list.map((b) => b.points))
  return list.map((b) => {
    const h = `${Math.round((b.points / max) * 120)}px`
    const haut = b.team === nousTeam.value
    return { n: `D${b.deal}`, hHaut: haut ? h : '0px', hBas: haut ? '0px' : h, titre: `Donne ${b.deal} : ${b.points} points` }
  })
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
  PLAYER_IDS.map((p) => {
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
</script>

<template>
  <div class="mt-[26px] grid grid-cols-2 gap-10">
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
      <p class="mb-2 text-[11px] text-sage">Points gagnés par donne — vers le haut pour nous, vers le bas pour eux</p>
      <p v-if="!barres.length" class="text-sm text-sage">Aucune donne terminée.</p>
      <div v-else class="flex h-[270px] items-stretch gap-1">
        <div v-for="b in barres" :key="b.n" class="flex max-w-[88px] grow flex-col items-center" :title="b.titre">
          <div class="flex w-full grow basis-0 items-end justify-center">
            <div class="w-[70%] rounded-t bg-gold" :style="{ height: b.hHaut }"></div>
          </div>
          <div class="h-px w-full bg-white/18"></div>
          <div class="flex w-full grow basis-0 items-start justify-center">
            <div class="w-[70%] rounded-b bg-them" :style="{ height: b.hBas }"></div>
          </div>
          <span class="mt-1 text-[11px] text-dusk">{{ b.n }}</span>
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

      <h2 class="mt-6 mb-2.5 text-[13px] font-semibold">Ce qui s'est passé</h2>
      <div class="grid grid-cols-2 gap-2.5">
        <div v-for="f in faits" :key="f.titre" class="rounded-[10px] border border-white/8 bg-white/4 px-3.5 py-3">
          <p class="text-[11px] text-sage">{{ f.titre }}</p>
          <p class="mt-1 text-[15px] font-semibold" :style="{ color: f.couleur }">{{ f.valeur }}</p>
          <p v-if="f.detail" class="mt-0.5 text-xs text-mist">{{ f.detail }}</p>
        </div>
      </div>
    </section>
  </div>
</template>
