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

export interface SerieCourbe {
  id: string
  nom: string
  couleur: string
  /** Une valeur (en %) par catégorie de l'axe */
  valeurs: number[]
  /** Position de la moyenne sur l'axe, en unités de catégorie (0 = première) */
  moyenne?: number | null
  /** Ce qu'on écrit après le nom : « moy. 96 », « Passe 64 % » */
  note?: string
}

const props = withDefaults(
  defineProps<{
    series: SerieCourbe[]
    categories: string[]
    /** Aucune donnée : on le dit plutôt que de tracer des lignes plates */
    vide?: string
  }>(),
  { vide: 'Pas encore assez de données.' },
)

/**
 * Le repère suit la largeur réelle du graphe : avec une largeur fixe, le dessin était
 * agrandi sur PC, textes compris, qui devenaient plus gros que tout le reste.
 */
const cadre = ref<HTMLElement | null>(null)
const largeur = ref(360)
let observateur: ResizeObserver | null = null
onMounted(() => {
  observateur = new ResizeObserver(([e]) => {
    if (e.contentRect.width > 0) largeur.value = Math.round(e.contentRect.width)
  })
  if (cadre.value) observateur.observe(cadre.value)
})
onBeforeUnmount(() => observateur?.disconnect())
const W = computed(() => largeur.value)
const H = computed(() => Math.round(Math.min(260, Math.max(160, largeur.value * 0.42))))
const G = 30 // marge gauche : l'échelle
const D = 8
const HAUT = 10
const BAS = 22 // les étiquettes de l'axe

const focus = ref<string | null>(null)

const max = computed(() => {
  const m = Math.max(0, ...props.series.flatMap((s) => s.valeurs))
  // Une échelle ronde, au-dessus du maximum
  const pas = m > 50 ? 20 : m > 20 ? 10 : 5
  return Math.max(pas, Math.ceil(m / pas) * pas)
})
const n = computed(() => props.categories.length)
const x = (i: number): number => G + (n.value <= 1 ? 0 : (i / (n.value - 1)) * (W.value - G - D))
const y = (v: number): number => HAUT + (1 - v / max.value) * (H.value - HAUT - BAS)

/** Catmull-Rom converti en courbes de Bézier, tension faible, bornée au plancher. */
function chemin(valeurs: number[]): string {
  const p = valeurs.map((v, i) => ({ x: x(i), y: y(v) }))
  if (p.length === 0) return ''
  const plancher = y(0)
  const t = 0.18
  let d = `M${p[0].x.toFixed(1)},${p[0].y.toFixed(1)}`
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] ?? p[i]
    const b = p[i]
    const c = p[i + 1]
    const e = p[i + 2] ?? c
    const c1 = { x: b.x + (c.x - a.x) * t, y: Math.min(plancher, b.y + (c.y - a.y) * t) }
    const c2 = { x: c.x - (e.x - b.x) * t, y: Math.min(plancher, c.y - (e.y - b.y) * t) }
    d += ` C${c1.x.toFixed(1)},${c1.y.toFixed(1)} ${c2.x.toFixed(1)},${c2.y.toFixed(1)} ${c.x.toFixed(1)},${c.y.toFixed(1)}`
  }
  return d
}

const courbes = computed(() =>
  props.series.map((s) => ({
    ...s,
    d: chemin(s.valeurs),
    xMoyenne: s.moyenne === null || s.moyenne === undefined ? null : x(s.moyenne),
    opacite: focus.value === null || focus.value === s.id ? 1 : 0.15,
  })),
)
const graduations = computed(() => [0, max.value / 2, max.value].map((v) => ({ v, y: y(v) })))
/** Une étiquette sur deux quand l'axe est trop serré, pour qu'elles restent lisibles. */
const etiquettes = computed(() => {
  const pas = n.value > 1 && (W.value - G - D) / (n.value - 1) < 34 ? 2 : 1
  const dernier = n.value - 1
  return props.categories.map((c, i) => ({
    c,
    x: x(i),
    // Toujours la dernière ; jamais l'avant-dernière quand on en saute une, elles se chevauchaient.
    montre: i === dernier || (i % pas === 0 && !(pas > 1 && i === dernier - 1)),
    // Les extrêmes s'alignent sur le bord : centrées, elles débordaient du graphe.
    ancre: i === dernier ? 'end' : i === 0 ? 'start' : 'middle',
  }))
})
const aDesDonnees = computed(() => props.series.some((s) => s.valeurs.some((v) => v > 0)))
</script>

<template>
  <div ref="cadre">
    <p v-if="!aDesDonnees" class="py-6 text-center text-sm text-sage">{{ vide }}</p>
    <template v-else>
      <svg :viewBox="`0 0 ${W} ${H}`" :width="W" :height="H" class="block max-w-full" role="img">
        <g v-for="g in graduations" :key="g.v">
          <line :x1="G" :x2="W - D" :y1="g.y" :y2="g.y" stroke="rgba(255,255,255,.08)" />
          <text :x="G - 5" :y="g.y + 3.5" text-anchor="end" font-size="10" fill="#8fa89a">
            {{ Math.round(g.v) }}%
          </text>
        </g>
        <text
          v-for="e in etiquettes.filter((v) => v.montre)"
          :key="e.c"
          :x="e.x"
          :y="H - 8"
          :text-anchor="e.ancre"
          font-size="10.5"
          fill="#a9bdb1"
        >
          {{ e.c }}
        </text>
        <g v-for="c in courbes" :key="c.id" :opacity="c.opacite" class="transition-opacity">
          <line
            v-if="c.xMoyenne !== null"
            :x1="c.xMoyenne"
            :x2="c.xMoyenne"
            :y1="HAUT"
            :y2="H - BAS"
            :stroke="c.couleur"
            stroke-width="1.2"
            stroke-dasharray="3 3"
          />
          <path
            :d="c.d"
            fill="none"
            :stroke="c.couleur"
            stroke-width="2"
            stroke-linejoin="round"
            stroke-linecap="round"
          />
          <circle v-for="(v, i) in c.valeurs" :key="i" :cx="x(i)" :cy="y(v)" r="1.8" :fill="c.couleur" />
        </g>
      </svg>
      <!-- La légende : toucher un nom le met en avant, le toucher de nouveau rend tout -->
      <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
        <button
          v-for="c in courbes"
          :key="c.id"
          type="button"
          class="flex cursor-pointer items-center gap-1.5 rounded-full px-1.5 py-0.5 text-xs transition"
          :class="focus === c.id ? 'bg-white/10' : 'hover:bg-white/5'"
          :style="{ opacity: c.opacite === 1 ? 1 : 0.5 }"
          @click="focus = focus === c.id ? null : c.id"
        >
          <span class="h-[3px] w-3.5 rounded-full" :style="{ background: c.couleur }"></span>
          <span class="font-semibold text-ivory">{{ c.nom }}</span>
          <span v-if="c.note" class="text-sage">{{ c.note }}</span>
        </button>
      </div>
    </template>
  </div>
</template>
