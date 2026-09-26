<script setup lang="ts">
/**
 * L'analyse carte par carte, lancée à la demande : chaque carte jugée du point de vue de
 * celui qui l'a jouée, avec ce qu'il savait (voir `cardAnalysis.ts`). Un bilan par
 * joueur, la courbe des chances du contrat au fil des cartes, puis le détail pli par pli.
 */
import { computed } from 'vue'
import type { ReviewedDeal } from '../game/review'
import type { JudgedCard, Quality } from '../game/cardAnalysis'
import { type PlayerId, type Seating, partnerOf, playerAtSeat, seatOf, teamOfPlayer } from '../game/players'
import type { Card } from '../game/cards'
import CardText from './CardText.vue'
import { nameOf } from '../stores/roster'
import { SAMPLES, useCardAnalysis } from '../composables/useCardAnalysis'

const props = defineProps<{ deal: ReviewedDeal; seating: Seating; me: PlayerId | null; us: 0 | 1 }>()
const { judged, pendingAction, done, total, error, launch } = useCardAnalysis()

const QUALITIES: Record<Quality, { label: string; color: string; symbol: string }> = {
  best: { label: 'Meilleure', color: '#52a884', symbol: '!' },
  good: { label: 'Bonne', color: '#8fbf7a', symbol: '✓' },
  inaccuracy: { label: 'Imprécision', color: '#e8c86a', symbol: '?!' },
  mistake: { label: 'Erreur', color: '#e0876a', symbol: '?' },
  blunder: { label: 'Gaffe', color: '#e05a48', symbol: '??' },
  forced: { label: 'Forcée', color: '#6b7f75', symbol: '—' },
}
const QUALITY_ORDER: Quality[] = ['best', 'good', 'inaccuracy', 'mistake', 'blunder']

const nameColor = (p: PlayerId): string =>
  teamOfPlayer(p, props.seating) === props.us ? 'text-gold' : 'text-them'

/** Moi, mon partenaire, puis les deux autres. */
const players = computed<PlayerId[]>(() => {
  const s = props.seating
  const me = props.me && s.includes(props.me) ? props.me : s[0]
  const i = seatOf(me, s)
  return [me, partnerOf(me, s), playerAtSeat(i + 1, s), playerAtSeat(i + 3, s)]
})

/** Par joueur : combien de cartes dans chaque catégorie, et la part de bonnes cartes. */
const balance = computed(() => {
  if (!judged.value) return []
  return players.value.map((p) => {
    const theirs = judged.value!.filter((j) => j.player === p && j.quality !== 'forced')
    const tally = Object.fromEntries(
      QUALITY_ORDER.map((q) => [q, theirs.filter((j) => j.quality === q).length]),
    ) as Record<Quality, number>
    const goodCount = tally['best'] + tally['good']
    return { p, tally, precision: theirs.length ? Math.round((100 * goodCount) / theirs.length) : null }
  })
})

/** La courbe : les chances du contrat avant la première carte, puis après chacune. */
const W = 360
const H = 120
const curve = computed(() => {
  const j = judged.value
  if (!j) return null
  const first = j.find((x) => x.options.length > 0)
  const start = first ? Math.max(...first.options.map((o) => o.odds)) : 50
  const values: number[] = [start]
  for (const x of j) values.push(x.oddsAfter >= 0 ? x.oddsAfter : values[values.length - 1])
  const X = (i: number) => 26 + (i / (values.length - 1)) * (W - 34)
  const Y = (v: number) => 8 + (1 - v / 100) * (H - 24)
  return {
    pathD: values.map((v, i) => `${i === 0 ? 'M' : 'L'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' '),
    points: j
      .map((x, i) => ({ x: X(i + 1), y: Y(values[i + 1]), q: x.quality }))
      .filter((pt) => pt.q === 'inaccuracy' || pt.q === 'mistake' || pt.q === 'blunder'),
    tricks: [...Array(9).keys()].map((k) => ({ k, x: X(k * 4) })),
    Y,
  }
})

const perTrick = computed(() => {
  if (!judged.value) return []
  return props.deal.tricks.map((p) => ({
    number: p.number,
    cards: judged.value!.filter((j) => j.trick === p.number),
  }))
})
const oddsOf = (j: JudgedCard, c: Card): number => Math.round(j.options.find((o) => o.card === c)?.odds ?? 0)
</script>

<template>
  <section class="mt-5 border-t border-white/10 pt-4">
    <h3 class="text-[15px] font-semibold">Carte par carte</h3>
    <p class="mt-1 text-xs leading-relaxed text-sage">
      Chaque carte jugée avec ce que le joueur savait : sa main et les cartes tombées, pas celles des autres.
      Le critère, c'est ce qui compte au score — les chances que le contrat passe.
    </p>

    <button
      v-if="!judged && !pendingAction"
      type="button"
      class="mt-3 h-11 w-full cursor-pointer rounded-xl bg-gold text-sm font-bold text-felt transition hover:brightness-110"
      @click="launch(deal, seating)"
    >
      Analyser chaque carte · une dizaine de secondes
    </button>

    <div v-else-if="pendingAction" class="mt-3">
      <div class="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          class="h-full rounded-full bg-gold transition-all"
          :style="{ width: `${total ? (100 * done) / total : 0}%` }"
        ></div>
      </div>
      <p class="mt-1.5 text-center text-xs text-sage">
        {{ done }} / {{ total }} cartes · {{ SAMPLES }} répartitions essayées pour chacune
      </p>
    </div>
    <p v-if="error" class="mt-3 text-sm text-red-card">{{ error }}</p>

    <template v-if="judged">
      <!-- Le bilan de chacun -->
      <table class="mt-3 w-full border-collapse text-[13px] tabular-nums">
        <thead>
          <tr class="text-[11px] text-sage">
            <th class="pb-1 text-left font-semibold">Joueur</th>
            <th
              v-for="q in QUALITY_ORDER"
              :key="q"
              class="pb-1 text-center font-semibold"
              :title="QUALITIES[q].label"
            >
              <span :style="{ color: QUALITIES[q].color }">{{ QUALITIES[q].symbol }}</span>
            </th>
            <th class="pb-1 text-right font-semibold">Justes</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="b in balance" :key="b.p" class="border-t border-white/8">
            <td class="py-1.5 font-semibold" :class="nameColor(b.p)">{{ nameOf(b.p) }}</td>
            <td
              v-for="q in QUALITY_ORDER"
              :key="q"
              class="py-1.5 text-center"
              :class="b.tally[q] ? '' : 'text-dusk'"
            >
              {{ b.tally[q] }}
            </td>
            <td class="py-1.5 text-right font-semibold">
              {{ b.precision === null ? '—' : `${b.precision} %` }}
            </td>
          </tr>
        </tbody>
      </table>
      <p class="mt-1 text-[11px] text-dusk">
        ! meilleure · ✓ bonne · ?! imprécision · ? erreur · ?? gaffe. « Justes » : la part de ses cartes (non
        forcées) meilleures ou bonnes.
      </p>

      <!-- Les chances du contrat au fil des cartes -->
      <h4 class="mt-4 text-[13px] font-semibold">Chances du contrat, carte après carte</h4>
      <svg v-if="curve" :viewBox="`0 0 ${W} ${H}`" class="mt-1 w-full" role="img">
        <line
          v-for="v in [0, 50, 100]"
          :key="v"
          x1="26"
          :x2="W - 8"
          :y1="curve.Y(v)"
          :y2="curve.Y(v)"
          stroke="rgba(255,255,255,.08)"
        />
        <text
          v-for="v in [0, 50, 100]"
          :key="`t${v}`"
          x="22"
          :y="curve.Y(v) + 3"
          text-anchor="end"
          font-size="8"
          fill="#8fa89a"
        >
          {{ v }}%
        </text>
        <text
          v-for="p in curve.tricks.slice(0, 8)"
          :key="`p${p.k}`"
          :x="p.x + 2"
          :y="H - 4"
          font-size="8"
          fill="#8fa89a"
        >
          pli {{ p.k + 1 }}
        </text>
        <path :d="curve.pathD" fill="none" stroke="#d9a441" stroke-width="2" stroke-linejoin="round" />
        <circle
          v-for="(pt, i) in curve.points"
          :key="i"
          :cx="pt.x"
          :cy="pt.y"
          r="3.2"
          :fill="QUALITIES[pt.q].color"
        />
      </svg>

      <!-- Pli par pli -->
      <div v-for="p in perTrick" :key="p.number" class="mt-3">
        <p class="text-xs font-semibold text-sage">Pli {{ p.number }}</p>
        <div
          v-for="j in p.cards"
          :key="j.card"
          class="flex items-baseline gap-2 border-b border-white/5 py-1 text-[13px]"
        >
          <span class="w-16 shrink-0 truncate font-semibold" :class="nameColor(j.player)">{{
            nameOf(j.player)
          }}</span>
          <span class="w-9 shrink-0"><CardText :card="j.card" /></span>
          <span
            class="shrink-0 rounded-full px-1.5 text-[11px] font-bold"
            :style="{ color: QUALITIES[j.quality].color, background: `${QUALITIES[j.quality].color}22` }"
            >{{ QUALITIES[j.quality].label }}</span
          >
          <span v-if="j.bestOption" class="min-w-0 text-xs text-mist">
            mieux :
            <CardText :card="j.bestOption" />
            <span v-if="oddsOf(j, j.bestOption) !== oddsOf(j, j.card)" class="text-sage">
              · contrat {{ oddsOf(j, j.bestOption) }} % au lieu de {{ oddsOf(j, j.card) }} %</span
            >
            <span v-else class="text-sage">
              · {{ Math.round(j.pointsLoss) }} point{{ Math.round(j.pointsLoss) > 1 ? 's' : '' }} de plus en
              moyenne</span
            >
          </span>
        </div>
      </div>
      <p class="mt-3 text-xs text-dusk">
        Estimé en essayant {{ SAMPLES }} répartitions des cartes cachées compatibles avec ce que le joueur
        savait : une indication fiable à quelques points près, pas une vérité absolue.
      </p>
    </template>
  </section>
</template>
