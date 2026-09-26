<script setup lang="ts">
/**
 * Des distributions, une courbe par joueur, sur un même graphe : on voit d'un coup
 * d'œil qui annonce plus haut, qui réfléchit plus longtemps.
 *
 * Les courbes sont à peine lissées et passent toujours par les vraies valeurs : un
 * lissage plus fort inventait des bosses tant qu'il y a peu de parties. La moyenne de
 * chacun est un trait vertical pointillé, de sa couleur. Toucher un nom dans la
 * légende le met en avant et estompe les autres.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useLargeScreen } from '../composables/useLargeScreen'

export interface CurveSeries {
  id: string
  name: string
  color: string
  /** Une valeur (en %) par catégorie de l'axe */
  values: number[]
  /** Position de la moyenne sur l'axe, en unités de catégorie (0 = première) */
  average?: number | null
  /** Ce qu'on écrit après le nom : « moy. 96 », « Passe 64 % » */
  note?: string
}

const props = withDefaults(
  defineProps<{
    series: CurveSeries[]
    categories: string[]
    /** Aucune donnée : on le dit plutôt que de tracer des lignes plates */
    empty?: string
  }>(),
  { empty: 'Pas encore assez de données.' },
)

/**
 * Le repère suit la largeur réelle du graphe : avec une largeur fixe, le dessin était
 * agrandi sur PC, textes compris, qui devenaient plus gros que tout le reste.
 */
const frame = ref<HTMLElement | null>(null)
const width = ref(360)
let observer: ResizeObserver | null = null
onMounted(() => {
  observer = new ResizeObserver(([e]) => {
    if (e.contentRect.width > 0) width.value = Math.round(e.contentRect.width)
  })
  if (frame.value) observer.observe(frame.value)
})
onBeforeUnmount(() => observer?.disconnect())
/** Sur téléphone, des textes plus gros : le graphe y occupe toute la largeur. */
const large = useLargeScreen()
const fontSize = computed(() => (large.value ? 10 : 12))
const W = computed(() => width.value)
const H = computed(() => Math.round(Math.min(260, Math.max(large.value ? 160 : 190, width.value * 0.42))))
const G = computed(() => (large.value ? 30 : 36)) // marge gauche : l'échelle
const D = 8
const TOP = 10
const BOTTOM = computed(() => (large.value ? 22 : 26)) // les étiquettes de l'axe

const focus = ref<string | null>(null)

const max = computed(() => {
  const m = Math.max(0, ...props.series.flatMap((s) => s.values))
  // Une échelle ronde, au-dessus du maximum
  const step = m > 50 ? 20 : m > 20 ? 10 : 5
  return Math.max(step, Math.ceil(m / step) * step)
})
const n = computed(() => props.categories.length)
const x = (i: number): number => G.value + (n.value <= 1 ? 0 : (i / (n.value - 1)) * (W.value - G.value - D))
const y = (v: number): number => TOP + (1 - v / max.value) * (H.value - TOP - BOTTOM.value)

/** Catmull-Rom converti en courbes de Bézier, tension faible, bornée au plancher. */
function curvePath(values: number[]): string {
  const p = values.map((v, i) => ({ x: x(i), y: y(v) }))
  if (p.length === 0) return ''
  const floorBid = y(0)
  const t = 0.18
  let d = `M${p[0].x.toFixed(1)},${p[0].y.toFixed(1)}`
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] ?? p[i]
    const b = p[i]
    const c = p[i + 1]
    const e = p[i + 2] ?? c
    const c1 = { x: b.x + (c.x - a.x) * t, y: Math.min(floorBid, b.y + (c.y - a.y) * t) }
    const c2 = { x: c.x - (e.x - b.x) * t, y: Math.min(floorBid, c.y - (e.y - b.y) * t) }
    d += ` C${c1.x.toFixed(1)},${c1.y.toFixed(1)} ${c2.x.toFixed(1)},${c2.y.toFixed(1)} ${c.x.toFixed(1)},${c.y.toFixed(1)}`
  }
  return d
}

const curves = computed(() =>
  props.series.map((s) => ({
    ...s,
    d: curvePath(s.values),
    xAverage: s.average === null || s.average === undefined ? null : x(s.average),
    opacity: focus.value === null || focus.value === s.id ? 1 : 0.15,
  })),
)
const ticks = computed(() => [0, max.value / 2, max.value].map((v) => ({ v, y: y(v) })))
/** Une étiquette sur deux quand l'axe est trop serré, pour qu'elles restent lisibles. */
const tags = computed(() => {
  const step = n.value > 1 && (W.value - G.value - D) / (n.value - 1) < (large.value ? 34 : 40) ? 2 : 1
  const last = n.value - 1
  return props.categories.map((c, i) => ({
    c,
    x: x(i),
    // Toujours la dernière ; jamais l'avant-dernière quand on en saute une, elles se chevauchaient.
    shown: i === last || (i % step === 0 && !(step > 1 && i === last - 1)),
    // Les extrêmes s'alignent sur le bord : centrées, elles débordaient du graphe.
    anchor: i === last ? 'end' : i === 0 ? 'start' : 'middle',
  }))
})
const hasData = computed(() => props.series.some((s) => s.values.some((v) => v > 0)))
</script>

<template>
  <div ref="cadre">
    <p v-if="!hasData" class="py-6 text-center text-[15px] lg:text-sm text-sage">{{ empty }}</p>
    <template v-else>
      <svg :viewBox="`0 0 ${W} ${H}`" :width="W" :height="H" class="block max-w-full" role="img">
        <g v-for="g in ticks" :key="g.v">
          <line :x1="G" :x2="W - D" :y1="g.y" :y2="g.y" stroke="rgba(255,255,255,.08)" />
          <text :x="G - 5" :y="g.y + 3.5" text-anchor="end" :font-size="fontSize" fill="#8fa89a">
            {{ Math.round(g.v) }}%
          </text>
        </g>
        <text
          v-for="e in tags.filter((v) => v.shown)"
          :key="e.c"
          :x="e.x"
          :y="H - (large ? 8 : 7)"
          :text-anchor="e.anchor"
          :font-size="fontSize + 0.5"
          fill="#a9bdb1"
        >
          {{ e.c }}
        </text>
        <g v-for="c in curves" :key="c.id" :opacity="c.opacity" class="transition-opacity">
          <line
            v-if="c.xAverage !== null"
            :x1="c.xAverage"
            :x2="c.xAverage"
            :y1="TOP"
            :y2="H - BOTTOM"
            :stroke="c.color"
            stroke-width="1.2"
            stroke-dasharray="3 3"
          />
          <path
            :d="c.d"
            fill="none"
            :stroke="c.color"
            stroke-width="2"
            stroke-linejoin="round"
            stroke-linecap="round"
          />
          <circle v-for="(v, i) in c.values" :key="i" :cx="x(i)" :cy="y(v)" r="1.8" :fill="c.color" />
        </g>
      </svg>
      <!-- La légende : toucher un nom le met en avant, le toucher de nouveau rend tout -->
      <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
        <button
          v-for="c in curves"
          :key="c.id"
          type="button"
          class="flex cursor-pointer items-center gap-1.5 rounded-full px-1.5 py-0.5 text-[13px] lg:text-xs transition"
          :class="focus === c.id ? 'bg-white/10' : 'hover:bg-white/5'"
          :style="{ opacity: c.opacity === 1 ? 1 : 0.5 }"
          @click="focus = focus === c.id ? null : c.id"
        >
          <span class="h-[3px] w-3.5 rounded-full" :style="{ background: c.color }"></span>
          <span class="font-semibold text-ivory">{{ c.name }}</span>
          <span v-if="c.note" class="text-sage">{{ c.note }}</span>
        </button>
      </div>
    </template>
  </div>
</template>
