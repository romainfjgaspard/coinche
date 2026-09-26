<script setup lang="ts">
/**
 * La partie donne par donne : le contrat et son issue, et en dépliant, les enchères
 * complètes (qui a dit quoi, tour par tour) et « Revoir la donne ».
 */
import { computed, ref } from 'vue'
import type { GameEvent } from '../game/events'
import { type PlayerId, type Seating, nextPlayer, teamOfPlayer } from '../game/players'
import type { BiddingEntry } from '../game/bidding'
import { SUIT_GLYPH } from '../game/display'
import { type ReviewedDeal, reviewDeal } from '../game/review'
import { nameOf } from '../stores/roster'
import DealReview from './DealReview.vue'
import GameAnalysis from './GameAnalysis.vue'
import { useSession } from '../stores/session'

const props = defineProps<{ events: GameEvent[]; seating: Seating; us: 0 | 1 }>()
const session = useSession()

interface Row {
  number: number
  dealer: PlayerId
  callList: { player: PlayerId; text: string; suitGlyph: string; red: boolean; coinche: boolean }[]
  contract: { who: string; value: string; suitGlyph: string; red: boolean; multiplierN: number } | null
  result: string
  scores: [number, number] | null
}

/** Le symbole d'une annonce, et s'il s'écrit en rouge (cœur, carreau). */
const suitGlyphOf = (x: string | null | undefined): { suitGlyph: string; red: boolean } =>
  !x
    ? { suitGlyph: '', red: false }
    : x === 'sa' || x === 'ta'
      ? { suitGlyph: x.toUpperCase(), red: false }
      : { suitGlyph: SUIT_GLYPH[x as 's' | 'h' | 'd' | 'c'], red: x === 'h' || x === 'd' }
const textOf = (b: BiddingEntry): { text: string; suitGlyph: string; red: boolean } => {
  switch (b.kind) {
    case 'pass':
      return { text: 'Passe', suitGlyph: '', red: false }
    case 'contract':
      return { text: String(b.value), ...suitGlyphOf(b.suit) }
    case 'capot':
      return { text: 'Capot', ...suitGlyphOf(b.declaration) }
    case 'generale':
      return { text: 'Générale', ...suitGlyphOf(b.declaration) }
    default:
      return { text: b.kind, suitGlyph: '', red: false }
  }
}
const RESULT: Record<string, string> = {
  made: 'réussi',
  down: 'chuté',
  capot: 'capot',
  generale: 'générale',
}

const rows = computed<Row[]>(() => {
  const out: Row[] = []
  let currentOne: Row | null = null
  for (const e of props.events) {
    if (e.type === 'deal_started') {
      currentOne = {
        number: e.dealNumber,
        dealer: e.dealer,
        callList: [],
        contract: null,
        result: 'en cours',
        scores: null,
      }
      out.push(currentOne)
    } else if (!currentOne) continue
    else if (e.type === 'bid')
      currentOne.callList.push({ player: e.player, ...textOf(e.entry), coinche: false })
    else if (e.type === 'coinche' || e.type === 'surcoinche') {
      currentOne.callList.push({
        player: e.player,
        text: e.type === 'coinche' ? 'Coinche' : 'Surcoinche',
        suitGlyph: '',
        red: false,
        coinche: true,
      })
    } else if (e.type === 'contract_set') {
      currentOne.contract = {
        who: nameOf(e.taker),
        value: e.generale ? 'Générale' : e.capot ? 'Capot' : String(e.value),
        ...suitGlyphOf(e.declaration ?? e.trump),
        multiplierN: e.multiplier,
      }
    } else if (e.type === 'deal_done') {
      currentOne.result = e.blitz ? 'blitz' : (RESULT[e.status] ?? e.status)
      currentOne.scores = e.scores
    } else if (e.type === 'deal_cancelled') currentOne.result = 'passedOut'
  }
  return out.reverse()
})

const openKey = ref<number | null>(null)
const review = ref<ReviewedDeal | null>(null)
function openReview(n: number): void {
  review.value = reviewDeal(props.events, n, props.seating)
}
/** L'ordre de parole de la donne : celui qui suit le donneur, puis le tour de table. */
const order = (dealer: PlayerId): PlayerId[] => {
  const first = nextPlayer(dealer, props.seating)
  return [
    first,
    nextPlayer(first, props.seating),
    nextPlayer(nextPlayer(first, props.seating), props.seating),
    dealer,
  ]
}
const color = (p: PlayerId): string =>
  teamOfPlayer(p, props.seating) === props.us ? 'text-gold' : 'text-them'
</script>

<template>
  <div>
    <GameAnalysis :events="events" :seating="seating" :me="session.playerId" :us="us" />
    <section>
      <h2 class="mt-5 mb-2 text-[15px] font-semibold lg:text-[15px]">Donne par donne</h2>
      <p v-if="!rows.length" class="py-3 text-center text-[15px] lg:text-sm text-sage">
        Aucune donne pour l'instant.
      </p>
      <div v-for="l in rows" :key="l.number" class="border-t border-white/8">
        <button
          type="button"
          class="flex w-full cursor-pointer items-center gap-3 py-2 text-left"
          :aria-expanded="openKey === l.number"
          @click="openKey = openKey === l.number ? null : l.number"
        >
          <span class="w-9 shrink-0 text-[13px] lg:text-xs font-semibold text-sage">D{{ l.number }}</span>
          <span class="grow truncate text-[15px] lg:text-[13px]">
            <template v-if="l.contract">
              {{ l.contract.who }} · {{ l.contract.value }}
              <span :class="l.contract.red ? 'text-[#e8786a]' : ''">{{ l.contract.suitGlyph }}</span>
              <span v-if="l.contract.multiplierN > 1" class="text-[#f0a293]">
                ×{{ l.contract.multiplierN }}</span
              >
            </template>
            <template v-else>{{ l.result === 'passedOut' ? 'Donne blanche' : '—' }}</template>
          </span>
          <span class="shrink-0 text-[13px] lg:text-xs text-mist">{{
            l.result === 'passedOut' ? 'blanche' : l.result
          }}</span>
          <span v-if="l.scores" class="w-16 shrink-0 text-right text-[15px] lg:text-[13px] tabular-nums">
            <span class="text-gold">{{ l.scores[us] }}</span> ·
            <span class="text-them">{{ l.scores[us === 0 ? 1 : 0] }}</span>
          </span>
          <span
            class="text-[13px] lg:text-xs text-dusk transition"
            :class="openKey === l.number ? 'rotate-180' : ''"
            >▼</span
          >
        </button>
        <div v-if="openKey === l.number" class="pb-3 pl-12">
          <!-- Les enchères, une colonne par joueur dans l'ordre de parole -->
          <div class="grid grid-cols-4 gap-x-2 text-[14px] lg:text-[12px]">
            <span
              v-for="p in order(l.dealer)"
              :key="p"
              class="truncate pb-1 font-semibold"
              :class="color(p)"
              >{{ nameOf(p) }}</span
            >
          </div>
          <div class="grid grid-cols-4 gap-x-2 gap-y-0.5 text-[14px] lg:text-[12px]">
            <span
              v-for="(pa, i) in l.callList"
              :key="i"
              :style="{ gridColumnStart: order(l.dealer).indexOf(pa.player) + 1 }"
              :class="
                pa.coinche
                  ? 'font-semibold text-[#f0a293]'
                  : pa.text === 'Passe'
                    ? 'text-sage'
                    : 'font-semibold'
              "
              >{{ pa.text }}
              <span v-if="pa.suitGlyph" :class="pa.red ? 'text-[#e8786a]' : ''">{{
                pa.suitGlyph
              }}</span></span
            >
          </div>
          <button
            v-if="l.result !== 'blitz' && l.result !== 'passedOut' && l.result !== 'en cours'"
            type="button"
            class="mt-2.5 cursor-pointer rounded-lg border border-white/15 px-3 py-1.5 text-[13px] lg:text-xs font-semibold text-mist transition hover:border-white/35"
            @click="openReview(l.number)"
          >
            Revoir la donne
          </button>
        </div>
      </div>
      <DealReview v-if="review" :deal="review" @close="review = null" />
    </section>
  </div>
</template>
