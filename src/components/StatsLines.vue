<script setup lang="ts">
/**
 * Le tableau des pages Duos et Joueurs : les mêmes colonnes pour un duo et pour un joueur,
 * sur PC comme sur téléphone (où il glisse de côté, le nom restant fixé à gauche).
 * Chaque colonne se trie d'un clic.
 */
import { computed, ref } from 'vue'
import type { Line } from '../game/statsGlobal'

const props = defineProps<{
  rows: { key: string; name: string; line: Line }[]
  /** Un duo compte les plis de son camp (repère 50 %), un joueur les siens (repère 25 %). */
  kind: 'duo' | 'player'
  phone?: boolean
}>()

const GOOD = '#52a884'
const BAD = '#cc6b4a'
const LIGHT = '#cfe0d8'

const rate = (a: number, b: number): number => (b === 0 ? 0 : Math.round((a / b) * 100))
/** Un nombre à une décimale, virgule française, signe toujours écrit. */
const signed = (v: number): string =>
  v === 0 ? '0' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1).replace('.', ',')}`

interface Cell {
  v: string
  /** Valeur de tri : -1 quand il n'y a rien à comparer */
  sort: number
  c: string
  w: string
  background: string
}
const cell = (v: string | number, sort: number, opt: Partial<Cell> = {}): Cell => ({
  v: String(v),
  sort,
  c: opt.c ?? LIGHT,
  w: opt.w ?? '400',
  background: opt.background ?? 'transparent',
})
/** Dégradé séquentiel autour du repère : plus le taux est élevé, plus le fond est soutenu. */
const rateCell = (a: number, b: number, low = 35, span = 40): Cell => {
  if (b === 0) return cell('—', -1, { c: '#6f8f82' })
  const v = rate(a, b)
  const t = Math.max(0, Math.min(1, (v - low) / span))
  return cell(`${v} %`, v, {
    c: '#faf9f5',
    w: '600',
    background: `rgba(82,168,132,${(0.08 + t * 0.42).toFixed(2)})`,
  })
}
/** « réussis / tentés », trié sur le taux de réussite puis sur le nombre de tentatives. */
const ratioCell = (a: number, b: number): Cell =>
  cell(b ? `${a}/${b}` : '—', b ? a / b + b / 1e6 : -1, { c: b ? LIGHT : '#6f8f82' })

const GROUPS = [
  { t: 'PARTIES', span: 5 },
  { t: 'DONNES', span: 10 },
  { t: 'PLIS', span: 1 },
]
/** En-têtes, et la colonne qui ouvre chaque groupe, séparée par un filet. */
const columns = computed(() => [
  { t: 'JOUÉES' },
  { t: 'GAGNÉES' },
  { t: '%' },
  { t: 'SCORE MOY' },
  { t: 'PIRE SCORE' },
  { t: 'JOUÉES' },
  { t: 'GAGNÉES', title: 'son contrat tenu, ou celui de l’adversaire chuté' },
  { t: '%' },
  { t: 'PRISES' },
  { t: 'RÉUSSIES' },
  { t: '%' },
  { t: 'BILAN', title: 'net par donne : marqué en prenant, moins offert en chutant' },
  { t: 'ENCH. MOY', title: 'contrats chiffrés pris, capots et générales à part' },
  { t: 'COINCHES', title: 'gagnées / tentées' },
  { t: 'CAP./GÉN.', title: 'capots et générales : réussis / annoncés' },
  {
    t: '%',
    title:
      props.kind === 'duo'
        ? 'plis ramassés par le duo, sur les plis joués'
        : 'plis ramassés par le joueur, sur les plis joués (25 % en moyenne)',
  },
])
const FIRST_OF_GROUP = new Set([0, 5, 15])

const lines = computed(() =>
  props.rows.map((r) => {
    const l = r.line
    const balance = l.deals ? (l.scoredPoints - l.conceded) / l.deals : 0
    return {
      key: r.key,
      name: r.name,
      cells: [
        cell(l.games, l.games),
        cell(l.won, l.won),
        rateCell(l.won, l.games),
        cell(l.averageScore, l.averageScore),
        cell(l.worstScore ?? '—', l.worstScore ?? -1),
        cell(l.deals, l.deals),
        cell(l.dealsWon, l.dealsWon),
        rateCell(l.dealsWon, l.deals),
        cell(l.takes, l.takes),
        cell(l.made, l.made),
        rateCell(l.made, l.takes),
        cell(signed(balance), balance, { c: balance >= 0 ? GOOD : BAD, w: '700' }),
        cell(l.averageBid ?? '—', l.averageBid ?? -1),
        ratioCell(l.coinchesWon, l.coinches),
        ratioCell(l.bigMade, l.bigTakes),
        props.kind === 'duo'
          ? rateCell(l.tricks, l.tricksPlayed)
          : rateCell(l.tricks, l.tricksPlayed, 15, 20),
      ],
    }
  }),
)

/** Trié par défaut sur le pourcentage de parties gagnées. */
const sort = ref<{ col: number; desc: boolean }>({ col: 2, desc: true })
const sorted = computed(() => {
  const { col, desc } = sort.value
  return [...lines.value].sort((a, b) => (desc ? -1 : 1) * (a.cells[col].sort - b.cells[col].sort))
})
function sortBy(col: number): void {
  sort.value = { col, desc: sort.value.col === col ? !sort.value.desc : true }
}

const SEP = '1px solid rgba(255,255,255,.14)'
/** La marge de la page, portée sur téléphone par la colonne fixe. */
const edge = computed(() => (props.phone ? 'pl-5 max-[380px]:pl-4' : ''))
</script>

<template>
  <!-- Sur téléphone, le tableau va jusqu'aux bords : la marge est portée par la colonne fixe,
       sinon les cellules qui glissent dessous se voyaient dans la marge. -->
  <div class="overflow-x-auto" :class="phone ? '-mx-5 max-[380px]:-mx-4' : ''">
    <table class="w-full border-collapse text-[13px]">
      <thead>
        <tr class="text-[10px] tracking-[.1em] text-dusk">
          <th class="sticky left-0 z-[1] bg-felt-dark pb-[5px]" :class="edge"></th>
          <th
            v-for="g in GROUPS"
            :key="g.t"
            :colspan="g.span"
            class="border-b border-l border-white/14 pb-[5px] text-center font-semibold"
          >
            {{ g.t }}
          </th>
        </tr>
        <tr class="tracking-[.05em] text-sage" :class="phone ? 'text-[11px]' : 'text-[10px]'">
          <th
            class="sticky left-0 z-[1] bg-felt-dark pt-[7px] pr-3 pb-2 text-left font-semibold"
            :class="edge"
          >
            {{ kind === 'duo' ? 'DUO' : 'JOUEUR' }}
          </th>
          <th
            v-for="(c, i) in columns"
            :key="i"
            class="cursor-pointer pt-[7px] pr-3 pb-2 pl-1 text-right font-semibold whitespace-nowrap select-none hover:text-ivory"
            :style="{ borderLeft: FIRST_OF_GROUP.has(i) ? SEP : 'none' }"
            :title="c.title"
            :aria-sort="sort.col === i ? (sort.desc ? 'descending' : 'ascending') : undefined"
            @click="sortBy(i)"
          >
            {{ c.t }}<span v-if="sort.col === i" class="text-gold">{{ sort.desc ? ' ▾' : ' ▴' }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in sorted" :key="r.key" class="border-t border-white/7">
          <td
            class="sticky left-0 z-[1] bg-felt-dark py-2.5 pr-3 font-semibold"
            :class="[edge, phone ? 'max-w-[9rem] min-w-[8rem] leading-tight' : 'whitespace-nowrap']"
          >
            {{ r.name }}
          </td>
          <td
            v-for="(v, i) in r.cells"
            :key="i"
            class="py-2.5 pr-3 pl-1 text-right"
            :style="{ borderLeft: FIRST_OF_GROUP.has(i) ? SEP : 'none' }"
          >
            <span
              class="inline-block rounded-[5px] px-[7px] py-0.5 whitespace-nowrap tabular-nums"
              :style="{ background: v.background, color: v.c, fontWeight: v.w }"
              >{{ v.v }}</span
            >
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
