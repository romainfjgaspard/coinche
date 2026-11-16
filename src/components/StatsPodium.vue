<script setup lang="ts">
/**
 * Le haut des pages Duos et Joueurs : les trois premiers duos, ou les quatre premiers
 * joueurs, aux parties gagnées. Un classement plutôt que « meilleur » et « pire ».
 */
import { computed } from 'vue'
import { type Line, byWinRate } from '../game/statsGlobal'

const props = defineProps<{
  rows: { key: string; name: string; line: Line }[]
  kind: 'duo' | 'player'
  phone?: boolean
}>()

const rate = (a: number, b: number): number => (b === 0 ? 0 : Math.round((a / b) * 100))
const signed = (v: number): string =>
  v === 0 ? '0' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1).replace('.', ',')}`
const plural = (n: number, word: string): string => `${n} ${word}${n > 1 ? 's' : ''}`

const cards = computed(() => {
  const ranked = byWinRate(props.rows.map((r) => ({ ...r.line, key: r.key, name: r.name })))
  return ranked.slice(0, props.kind === 'duo' ? 3 : 4).map((l, i) => ({
    key: l.key,
    tag: `${props.kind === 'duo' ? 'DUO' : 'JOUEUR'} ${i + 1}`,
    who: l.name,
    value: `${rate(l.won, l.games)} %`,
    detail:
      props.kind === 'duo'
        ? `${plural(l.won, 'victoire')} sur ${l.games} · ${signed(l.deals ? (l.scoredPoints - l.conceded) / l.deals : 0)} point par donne`
        : `${plural(l.won, 'partie')} gagnée${l.won > 1 ? 's' : ''} sur ${l.games} · ${rate(l.made, l.takes)} % de contrats tenus`,
    first: i === 0,
  }))
})
</script>

<template>
  <div
    class="grid"
    :class="[
      phone ? 'mt-3 gap-2.5' : 'mt-4 gap-3.5',
      kind === 'duo' ? 'grid-cols-3' : phone ? 'grid-cols-2' : 'grid-cols-4',
    ]"
  >
    <div
      v-for="c in cards"
      :key="c.key"
      class="rounded-xl border"
      :class="[
        phone ? 'px-3 py-3 max-[380px]:px-2.5' : 'px-[18px] py-3.5',
        c.first ? 'border-gold/50 bg-gold/10' : 'border-white/10 bg-white/4',
      ]"
    >
      <p class="text-[10px] tracking-[.1em]" :class="c.first ? 'text-gold' : 'text-sage'">{{ c.tag }}</p>
      <template v-if="phone">
        <p class="mt-1 font-display leading-tight" :class="kind === 'duo' ? 'text-base' : 'text-xl'">
          {{ c.who }}
        </p>
        <p class="font-display text-3xl leading-none" :class="c.first ? 'text-gold' : 'text-mist'">
          {{ c.value }}
        </p>
      </template>
      <div v-else class="mt-1 flex items-baseline gap-2.5">
        <span class="grow font-display text-2xl leading-none">{{ c.who }}</span>
        <span class="font-display text-[28px] leading-none" :class="c.first ? 'text-gold' : 'text-mist'">{{
          c.value
        }}</span>
      </div>
      <p class="mt-1.5 text-xs leading-snug text-mist">{{ c.detail }}</p>
    </div>
  </div>
</template>
