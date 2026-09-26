<script setup lang="ts">
/**
 * Revoir une donne : les mains telles que distribuées, puis les huit plis dans l'ordre.
 * De quoi refaire la donne après coup, et comprendre une chute.
 */
import { computed, onBeforeUnmount, ref, toRaw } from 'vue'
import type { Analysis } from '../game/analysis'
import type { ReviewedDeal } from '../game/review'
import { type PlayerId, partnerOf, playerAtSeat, seatOf, teamOfPlayer } from '../game/players'
import { SUIT_GLYPH, isRed } from '../game/display'
import { nameOf } from '../stores/roster'
import { useSession } from '../stores/session'
import { useLargeScreen } from '../composables/useLargeScreen'
import { useTableLayout } from '../composables/useTableLayout'
import PlayingCard from './PlayingCard.vue'
import CardAnalysis from './CardAnalysis.vue'
import CardText from './CardText.vue'

const props = defineProps<{ deal: ReviewedDeal }>()
const emit = defineEmits<{ close: [] }>()
const session = useSession()
const large = useLargeScreen()
const L = useTableLayout()

const view = ref<'hands' | 'tricks' | 'analysis'>('hands')

// --- « Aurait-on pu gagner ? » : calculé à la demande, dans un fil à part.
const analysis = ref<Analysis | null>(null)
const computation = ref(false)
let worker: Worker | null = null
function analyze(): void {
  if (analysis.value || computation.value) return
  computation.value = true
  worker = new Worker(new URL('../game/analysis.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<Analysis>) => {
    analysis.value = e.data
    computation.value = false
    worker?.terminate()
    worker = null
  }
  worker.onerror = () => {
    analysis.value = { impossible: 'Le calcul a échoué.' }
    computation.value = false
  }
  // Des objets simples : le fil ne reçoit pas les proxys réactifs.
  worker.postMessage(JSON.parse(JSON.stringify({ deal: toRaw(props.deal), seating: toRaw(session.seating) })))
}
onBeforeUnmount(() => worker?.terminate())
function open(id: 'hands' | 'tricks' | 'analysis'): void {
  view.value = id
  if (id === 'analysis') analyze()
}
const unit = computed(() => (analysis.value?.target === 'tricks' ? 'tricks' : 'points'))
const takerTeam = computed(() => {
  const t = props.deal.contract?.taker
  if (!t) return ''
  const s = session.seating
  return `${nameOf(t)} et ${nameOf(partnerOf(t, s))}`
})

/** Nous d'abord (moi, mon partenaire), puis eux, dans l'ordre de la table. */
const order = computed<PlayerId[]>(() => {
  const s = session.seating
  const me = session.playerId && s.includes(session.playerId) ? session.playerId : s[0]
  const i = seatOf(me, s)
  return [me, partnerOf(me, s), playerAtSeat(i + 1, s), playerAtSeat(i + 3, s)]
})
const us = computed(() => session.myTeam)
const nameColor = (p: PlayerId): string =>
  teamOfPlayer(p, session.seating) === us.value ? 'text-gold' : 'text-them'

/**
 * Sur téléphone, la main prend toute la largeur de la fenêtre (le nom passe au-dessus) :
 * à côté du nom, les cartes étaient trop petites pour se lire.
 */
const handWidth = computed(() => (large.value ? 64 : 48))
const handStep = computed(() => {
  if (large.value) return 54
  const spot = Math.min(L.value.width, 448) - 24 - 40
  return Math.min(40, Math.floor((spot - handWidth.value) / 7))
})
const trickWidth = computed(() => (large.value ? 64 : 44))

const contract = computed(() => props.deal.contract)
const declaration = computed(() => {
  const d = contract.value?.declaration
  if (!d) return ''
  return d === 'sa' ? 'SA' : d === 'ta' ? 'TA' : SUIT_GLYPH[d]
})
const value = computed(() => {
  const c = contract.value
  if (!c) return ''
  return c.generale ? 'Générale' : c.capot ? 'Capot' : String(c.value)
})
const trump = (card: string): boolean => {
  const d = contract.value?.declaration
  return d === 'ta' || (d !== null && d !== undefined && d !== 'sa' && card.endsWith(d))
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 px-3 py-4"
      @click.self="emit('close')"
      @keydown.esc="emit('close')"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="revue-titre"
        class="flex max-h-full w-full max-w-md flex-col rounded-2xl border border-white/10 bg-felt-dark text-ivory shadow-2xl lg:max-w-2xl"
      >
        <div class="flex items-center gap-3 px-5 pt-4">
          <h2 id="revue-titre" class="grow font-display text-2xl leading-none">Donne {{ deal.number }}</h2>
          <span v-if="contract" class="flex items-center gap-1.5 text-sm">
            <span class="font-semibold">{{ nameOf(contract.taker) }}</span>
            <span class="text-sage">·</span>
            <span class="font-bold text-gold">{{ value }}</span>
            <span
              class="flex h-5 min-w-5 items-center justify-center rounded-full bg-ivory px-1 text-xs leading-none font-bold"
              :class="
                contract.declaration &&
                contract.declaration !== 'sa' &&
                contract.declaration !== 'ta' &&
                isRed(contract.declaration)
                  ? 'text-red-card'
                  : 'text-felt-dark'
              "
              >{{ declaration }}</span
            >
          </span>
          <button
            type="button"
            class="flex size-8 cursor-pointer items-center justify-center rounded-full text-sage transition hover:bg-white/10 hover:text-mist"
            aria-label="Fermer"
            @click="emit('close')"
          >
            ✕
          </button>
        </div>

        <div class="mx-5 mt-3 grid grid-cols-3 gap-1 rounded-xl bg-black/25 p-1">
          <button
            v-for="o in [
              { id: 'hands', label: 'Mains' },
              { id: 'tricks', label: 'Les 8 plis' },
              { id: 'analysis', label: 'Analyse' },
            ] as const"
            :key="o.id"
            type="button"
            class="h-9 cursor-pointer rounded-lg text-sm font-semibold transition"
            :class="view === o.id ? 'bg-gold text-felt' : 'text-mist hover:bg-white/5'"
            @click="open(o.id)"
          >
            {{ o.label }}
          </button>
        </div>

        <div class="mt-3 overflow-y-auto px-5 pb-5">
          <!-- Les quatre mains, nous d'abord -->
          <div v-if="view === 'hands' && deal.hands" class="flex flex-col gap-3">
            <div v-for="p in order" :key="p" class="flex flex-col gap-1 lg:flex-row lg:items-center lg:gap-3">
              <div class="flex items-baseline gap-2 lg:block lg:w-28 lg:shrink-0">
                <p class="truncate text-sm font-semibold" :class="nameColor(p)">{{ nameOf(p) }}</p>
                <p class="text-[11px] text-sage">
                  {{ contract?.taker === p ? 'preneur' : p === deal.dealer ? 'donneur' : '' }}
                </p>
              </div>
              <div
                class="relative"
                :style="{
                  width: `${handWidth + 7 * handStep}px`,
                  height: `${Math.round(handWidth * 1.44)}px`,
                }"
              >
                <div
                  v-for="(c, i) in deal.hands[p]"
                  :key="c"
                  class="absolute top-0"
                  :style="{ left: `${i * handStep}px` }"
                >
                  <PlayingCard :card="c" :width="handWidth" :trump="trump(c)" />
                </div>
              </div>
            </div>
          </div>

          <!-- Les plis, dans l'ordre de pose, la carte gagnante en évidence -->
          <div v-else-if="view === 'tricks'" class="flex flex-col gap-2.5">
            <div
              v-for="trick in deal.tricks"
              :key="trick.number"
              class="flex items-center gap-3 border-b border-white/5 pb-2.5 last:border-0"
            >
              <p class="w-9 shrink-0 text-xs font-semibold text-sage">Pli {{ trick.number }}</p>
              <div class="flex gap-1.5">
                <div v-for="c in trick.cards" :key="c.card" class="flex flex-col items-center gap-0.5">
                  <PlayingCard :card="c.card" :width="trickWidth" :winner="c.player === trick.winner" />
                  <span class="max-w-[3.25rem] truncate text-[10px]" :class="nameColor(c.player)">{{
                    nameOf(c.player)
                  }}</span>
                </div>
              </div>
              <p class="ml-auto shrink-0 text-right text-sm tabular-nums">
                <span class="font-semibold" :class="nameColor(trick.winner)"
                  >+{{ trick.points + (trick.number === 8 ? 10 : 0) }}</span
                >
                <span v-if="trick.number === 8" class="block text-[10px] text-sage">dont dix de der</span>
              </p>
            </div>
          </div>

          <!-- À cartes ouvertes : le contrat était-il faisable, et où a-t-il échappé ? -->
          <div v-else-if="view === 'analysis'" class="text-[14px] leading-relaxed">
            <p v-if="computation" class="py-6 text-center text-sm text-sage">
              Calcul en cours… (quelques secondes)
            </p>
            <p v-else-if="analysis?.impossible" class="py-6 text-center text-sm text-sage">
              {{ analysis.impossible }}
            </p>
            <template v-else-if="analysis">
              <p
                class="rounded-xl px-4 py-3 font-semibold"
                :class="analysis.feasible ? 'bg-gold/15 text-gold' : 'bg-white/5 text-mist'"
              >
                {{
                  analysis.feasible ? 'Le contrat était faisable.' : 'Le contrat n\u2019était pas faisable.'
                }}
              </p>
              <p class="mt-3 text-mist">
                À cartes ouvertes, {{ takerTeam }} pouvaient garantir
                <b class="text-ivory">{{ analysis.guaranteed }} {{ unit }}</b>
                face à une défense parfaite ; il en fallait <b class="text-ivory">{{ analysis.required }}</b>
                <template v-if="analysis.belote"> (belote comprise : 20 points de moins à faire)</template>.
              </p>
              <template v-if="analysis.turningPoint">
                <p class="mt-3 text-mist">
                  Il a échappé au <b class="text-ivory">pli {{ analysis.turningPoint.trick }}</b> :
                  {{ nameOf(analysis.turningPoint.player) }} a joué
                  <CardText :card="analysis.turningPoint.card" /> ; avec
                  <CardText :card="analysis.turningPoint.better" />, il restait faisable.
                </p>
                <div class="mt-3 flex items-end gap-3">
                  <div class="flex flex-col items-center gap-1">
                    <PlayingCard :card="analysis.turningPoint.card" :width="trickWidth" :dimmed="true" />
                    <span class="text-[11px] text-sage">joué</span>
                  </div>
                  <span class="pb-8 text-sage">→</span>
                  <div class="flex flex-col items-center gap-1">
                    <PlayingCard :card="analysis.turningPoint.better" :width="trickWidth" :winner="true" />
                    <span class="text-[11px] text-gold">il fallait</span>
                  </div>
                </div>
              </template>
              <p v-else-if="analysis.feasible" class="mt-3 text-mist">Et il a été fait.</p>
              <p class="mt-4 text-xs text-dusk">
                Calcul à cartes ouvertes : chacun voit les quatre mains et joue parfaitement. Une indication,
                pas un reproche — en vrai, personne ne voit les cartes des autres.
              </p>
              <CardAnalysis
                :deal="deal"
                :seating="session.seating"
                :me="session.playerId"
                :us="session.myTeam"
              />
            </template>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
