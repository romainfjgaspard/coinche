<script setup lang="ts">
/**
 * L'analyse de toute la partie, à la demande : chaque donne jouée passe à l'analyse
 * carte par carte, l'une après l'autre. On en tire la justesse de chacun sur la partie
 * et les plus gros tournants — les cartes qui ont coûté le plus de chances à leur camp.
 */
import { computed, ref } from 'vue'
import type { GameEvent } from '../game/events'
import type { JudgedCard, Quality } from '../game/cardAnalysis'
import { type PlayerId, type Seating, partnerOf, playerAtSeat, seatOf, teamOfPlayer } from '../game/players'
import CardText from './CardText.vue'
import { reviewDeal } from '../game/review'
import { nameOf } from '../stores/roster'
import { useCardAnalysis } from '../composables/useCardAnalysis'

const props = defineProps<{ events: GameEvent[]; seating: Seating; me: PlayerId | null; us: 0 | 1 }>()
const { done, total, launch } = useCardAnalysis()

/** Les donnes qui se prêtent à l'analyse : jouées jusqu'au bout, contrat à la couleur ou capot. */
const deals = computed(() =>
  props.events
    .filter((e) => e.type === 'deal_started')
    .map((e) => (e.type === 'deal_started' ? reviewDeal(props.events, e.dealNumber, props.seating) : null))
    .filter((d): d is NonNullable<typeof d> =>
      Boolean(
        d &&
        d.hands &&
        d.contract &&
        !d.blitz &&
        !d.contract.generale &&
        (d.contract.capot || (d.contract.declaration !== 'sa' && d.contract.declaration !== 'ta')),
      ),
    ),
)

const pendingAction = ref(false)
const dealInProgress = ref(0)
const outcomes = ref<{ number: number; judged: JudgedCard[] }[] | null>(null)

async function analyze(): Promise<void> {
  pendingAction.value = true
  const out: { number: number; judged: JudgedCard[] }[] = []
  for (const [i, d] of deals.value.entries()) {
    dealInProgress.value = i + 1
    const judged = await launch(d, props.seating)
    if (judged) out.push({ number: d.number, judged })
  }
  outcomes.value = out
  pendingAction.value = false
}

const ORDER: Quality[] = ['best', 'good', 'inaccuracy', 'mistake', 'blunder']
const SYMBOL: Record<Quality, string> = {
  best: '!',
  good: '✓',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
  forced: '—',
}
const COLOR: Record<Quality, string> = {
  best: '#52a884',
  good: '#8fbf7a',
  inaccuracy: '#e8c86a',
  mistake: '#e0876a',
  blunder: '#e05a48',
  forced: '#6b7f75',
}

const players = computed<PlayerId[]>(() => {
  const s = props.seating
  const me = props.me && s.includes(props.me) ? props.me : s[0]
  const i = seatOf(me, s)
  return [me, partnerOf(me, s), playerAtSeat(i + 1, s), playerAtSeat(i + 3, s)]
})
const balance = computed(() => {
  if (!outcomes.value) return []
  const every = outcomes.value.flatMap((r) => r.judged)
  return players.value.map((p) => {
    const theirs = every.filter((j) => j.player === p && j.quality !== 'forced')
    const tally = Object.fromEntries(
      ORDER.map((q) => [q, theirs.filter((j) => j.quality === q).length]),
    ) as Record<Quality, number>
    return {
      p,
      tally,
      accurate: theirs.length ? Math.round((100 * (tally['best'] + tally['good'])) / theirs.length) : null,
      lost: Math.round(theirs.reduce((s, j) => s + j.oddsLoss, 0)),
    }
  })
})
/** Les cartes qui ont coûté le plus de chances à leur camp. */
const turningPoints = computed(() =>
  (outcomes.value ?? [])
    .flatMap((r) => r.judged.map((j) => ({ ...j, deal: r.number })))
    .filter((j) => j.oddsLoss >= 12)
    .sort((a, b) => b.oddsLoss - a.oddsLoss)
    .slice(0, 5),
)
const nameColor = (p: PlayerId): string =>
  teamOfPlayer(p, props.seating) === props.us ? 'text-gold' : 'text-them'
</script>

<template>
  <section class="mt-4 rounded-xl border border-white/10 bg-white/4 px-4 py-3">
    <h2 class="text-[15px] font-semibold lg:text-[15px]">Analyse de la partie</h2>
    <template v-if="!outcomes">
      <p class="mt-1 text-[13px] lg:text-xs leading-relaxed text-sage">
        Chaque carte de chaque donne jugée avec ce que le joueur savait, comme aux échecs : qui joue le plus
        juste, et quelles cartes ont coûté le plus cher.
      </p>
      <button
        v-if="!pendingAction"
        type="button"
        :disabled="!deals.length"
        class="mt-3 h-10 w-full cursor-pointer rounded-xl bg-gold text-[15px] lg:text-sm font-bold text-felt transition enabled:hover:brightness-110 disabled:opacity-40"
        @click="analyze"
      >
        {{
          deals.length
            ? `Analyser les ${deals.length} donne${deals.length > 1 ? 's' : ''} · environ ${Math.max(1, Math.round((deals.length * 15) / 60))} min`
            : 'Aucune donne à analyser'
        }}
      </button>
      <div v-else class="mt-3">
        <div class="h-2 overflow-hidden rounded-full bg-white/10">
          <div
            class="h-full rounded-full bg-gold transition-all"
            :style="{ width: `${(100 * (dealInProgress - 1 + (total ? done / total : 0))) / deals.length}%` }"
          ></div>
        </div>
        <p class="mt-1.5 text-center text-[13px] lg:text-xs text-sage">
          Donne {{ dealInProgress }} sur {{ deals.length }}…
        </p>
      </div>
    </template>

    <template v-else>
      <table class="mt-2 w-full border-collapse text-[15px] lg:text-[13px] tabular-nums">
        <thead>
          <tr class="text-[13px] lg:text-[11px] text-sage">
            <th class="pb-1 text-left font-semibold">Joueur</th>
            <th
              v-for="q in ORDER"
              :key="q"
              class="pb-1 text-center font-semibold"
              :style="{ color: COLOR[q] }"
            >
              {{ SYMBOL[q] }}
            </th>
            <th class="pb-1 text-right font-semibold">Justes</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="b in balance" :key="b.p" class="border-t border-white/8">
            <td class="py-1.5 font-semibold" :class="nameColor(b.p)">{{ nameOf(b.p) }}</td>
            <td v-for="q in ORDER" :key="q" class="py-1.5 text-center" :class="b.tally[q] ? '' : 'text-dusk'">
              {{ b.tally[q] }}
            </td>
            <td class="py-1.5 text-right font-semibold">
              {{ b.accurate === null ? '—' : `${b.accurate} %` }}
            </td>
          </tr>
        </tbody>
      </table>
      <p class="mt-1 text-[13px] lg:text-[11px] text-dusk">
        ! meilleure · ✓ bonne · ?! imprécision · ? erreur · ?? gaffe · cartes forcées non comptées.
      </p>

      <h3 class="mt-3 text-[15px] lg:text-[13px] font-semibold">Les tournants de la partie</h3>
      <p v-if="!turningPoints.length" class="mt-1 text-[13px] lg:text-xs text-sage">
        Aucune carte n'a coûté plus de 12 % de chances à son camp.
      </p>
      <div
        v-for="t in turningPoints"
        :key="`${t.deal}-${t.card}`"
        class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-t border-white/8 py-1.5 text-[15px] lg:flex-nowrap lg:text-[13px]"
      >
        <span class="w-[76px] shrink-0 lg:w-14 text-[13px] lg:text-xs text-sage"
          >D{{ t.deal }} · pli {{ t.trick }}</span
        >
        <span class="w-16 shrink-0 truncate lg:w-14 font-semibold" :class="nameColor(t.player)">{{
          nameOf(t.player)
        }}</span>
        <span class="shrink-0"><CardText :card="t.card" /></span>
        <span class="shrink-0 text-[13px] lg:text-xs font-bold" :style="{ color: COLOR[t.quality] }"
          >−{{ Math.round(t.oddsLoss) }} %</span
        >
        <!-- Sur téléphone, « mieux : » passe sous la ligne plutôt que d'être tronqué -->
        <span
          v-if="t.bestOption"
          class="w-full min-w-0 truncate pl-[84px] text-[13px] text-mist lg:w-auto lg:pl-0 lg:text-xs"
        >
          mieux : <CardText :card="t.bestOption" />
        </span>
      </div>
      <p class="mt-2 text-[13px] lg:text-[11px] text-dusk">
        « −20 % » : la carte a fait perdre 20 points de chances à son camp (réussir le contrat, ou le faire
        chuter).
      </p>
    </template>
  </section>
</template>
