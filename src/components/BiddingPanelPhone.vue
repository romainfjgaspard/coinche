<script setup lang="ts">
/**
 * Les enchères sur téléphone : un panneau compact posé au milieu du tapis. Ma main reste
 * visible en bas de l'écran — l'ancien panneau, en tiroir, la recouvrait et en montrait
 * une copie tronquée. L'historique se lit à côté des noms autour de la table.
 *
 * Le palier se règle en « − 130 + », jusqu'au capot et à la générale ; la couleur se
 * choisit d'une touche ; Passe, Annoncer et Coincher tiennent sur une ligne.
 */
import { computed, ref, watch } from 'vue'
import type { Suit } from '../game/cards'
import { type ContractEntry, type Declaration, canBidCapot, canBidGenerale } from '../game/bidding'
import { useSession } from '../stores/session'
import { useTableLayout } from '../composables/useTableLayout'
import { nameOf } from '../stores/roster'
import SuitIcon from './SuitIcon.vue'
import SuitBadge from './SuitBadge.vue'

const session = useSession()
const L = useTableLayout()
/** Le haut de ma main et de ma pastille, comme sur la table (`GameTable`). */
const bottom = computed(() => {
  const card = Math.min(132, Math.round(Math.min(L.value.width, 448) * 0.33))
  return Math.round(card * 1.44 * 0.58) + 48
})

type Level = number | 'capot' | 'generale'
const SUITS: Suit[] = ['s', 'h', 'd', 'c']

const coinched = computed(() => (session.bidding?.entries ?? []).some((e) => e.kind === 'coinche'))
/** Le preneur est « coinché » ; son partenaire l'est avec lui. */
const coinchedTitle = computed(() => {
  const t = session.biddingTaker
  return !t || t === session.playerId ? 'Tu es coinché' : `${nameOf(t)} est coinché — à toi aussi de répondre`
})

/** Les paliers encore ouverts, du plus bas au plus haut, capot et générale en dernier. */
const levels = computed<Level[]>(() => {
  const b = session.bidding
  if (!b) return []
  const out: Level[] = [...session.bidValues]
  if (canBidCapot(b)) out.push('capot')
  if (canBidGenerale(b)) out.push('generale')
  return out
})
const index = ref(0)
const level = computed<Level | null>(() => levels.value[index.value] ?? null)
const declaration = ref<Declaration | null>(null)

// Une annonce adverse relève le plancher : on repart du plus petit palier possible.
watch(levels, () => (index.value = 0))
// Un palier chiffré ne se joue qu'à la couleur (ENC-10) : SA et TA tombent.
watch(level, (l) => {
  if (typeof l === 'number' && (declaration.value === 'sa' || declaration.value === 'ta'))
    declaration.value = null
})

const step = (d: 1 | -1) => {
  index.value = Math.min(levels.value.length - 1, Math.max(0, index.value + d))
}
const levelLabel = (l: Level): string => (l === 'capot' ? 'Capot' : l === 'generale' ? 'Générale' : String(l))
const special = computed(() => level.value === 'capot' || level.value === 'generale')
const ready = computed(() => level.value !== null && declaration.value !== null)

function announce(): void {
  const player = session.playerId
  const l = level.value
  const d = declaration.value
  if (!player || l === null || d === null) return
  if (typeof l === 'number') session.bid({ kind: 'contract', player, value: l, suit: d as Suit })
  else session.bid({ kind: l, player, declaration: d })
  declaration.value = null
}
const pass = () => session.playerId && session.bid({ kind: 'pass', player: session.playerId })
const coinche = () =>
  session.playerId &&
  session.bid({ kind: session.mayCoinche ? 'coinche' : 'surcoinche', player: session.playerId })

/** Ce qu'il faut battre, en une ligne. */
const best = computed(() => {
  const entries = session.bidding?.entries ?? []
  return [...entries]
    .reverse()
    .find((e): e is ContractEntry => e.kind === 'contract' || e.kind === 'capot' || e.kind === 'generale')
})
</script>

<template>
  <!--
    Juste au-dessus de ma pastille et de ma main : le haut de l'écran reste aux trois
    autres, leur nom et leur dernière annonce.
  -->
  <div
    :style="{ bottom: `${bottom}px` }"
    class="absolute left-1/2 z-40 w-[min(92%,380px)] -translate-x-1/2 rounded-2xl border border-white/12 bg-felt-dark/95 p-3 shadow-[0_14px_40px_rgba(0,0,0,.55)] backdrop-blur-sm"
  >
    <!-- Ce qu'il faut battre -->
    <p class="flex h-7 items-center gap-1.5 px-1 text-[13px] text-mist">
      <template v-if="best">
        <span class="font-semibold text-ivory">{{ nameOf(best.player) }}</span>
        <span>a annoncé</span>
        <span class="font-bold text-gold">{{
          best.kind === 'contract' ? best.value : best.kind === 'capot' ? 'Capot' : 'Générale'
        }}</span>
        <SuitBadge :suit="best.kind === 'contract' ? best.suit : best.declaration" :size="22" />
        <span
          v-if="coinched"
          class="ml-auto rounded-full bg-red-card px-2 py-0.5 text-[11px] font-bold text-ivory"
          >COINCHÉ</span
        >
      </template>
      <span v-else>Personne n'a encore annoncé</span>
    </p>

    <!-- CO-5 / CO-6 : coinché, le preneur et son partenaire laissent jouer ou surcoinchent -->
    <template v-if="session.answersCoinche">
      <p class="mt-1 px-1 text-[15px] font-semibold">{{ coinchedTitle }}</p>
      <div class="mt-2.5 flex gap-2">
        <button
          type="button"
          class="h-11 grow cursor-pointer rounded-xl border border-white/20 text-[15px] font-semibold text-mist"
          @click="pass"
        >
          Laisser jouer ×2
        </button>
        <button
          v-if="session.maySurcoinche"
          type="button"
          class="h-11 grow cursor-pointer rounded-xl bg-red-card px-3 text-[15px] font-bold text-ivory"
          @click="coinche"
        >
          Surcoincher ×4
        </button>
      </div>
    </template>

    <template v-else-if="session.myBidTurn && !coinched">
      <span data-testid="ton-enchere" class="sr-only">Ton enchère</span>
      <!-- La couleur -->
      <div class="mt-1.5 grid grid-cols-6 gap-1.5">
        <button
          v-for="s in SUITS"
          :key="s"
          type="button"
          :aria-label="`Atout ${{ s: 'pique', h: 'cœur', d: 'carreau', c: 'trèfle' }[s]}`"
          :aria-pressed="declaration === s"
          class="flex h-11 cursor-pointer items-center justify-center rounded-xl bg-ivory transition"
          :class="[
            declaration === s ? 'ring-[3px] ring-gold ring-offset-2 ring-offset-felt-dark' : 'opacity-90',
            s === 'h' || s === 'd' ? 'text-red-card' : 'text-felt-dark',
          ]"
          @click="declaration = s"
        >
          <SuitIcon :suit="s" class="size-6" />
        </button>
        <button
          v-for="d in ['sa', 'ta'] as const"
          :key="d"
          type="button"
          :disabled="!special"
          :title="d === 'sa' ? 'Sans-atout : capot ou générale' : 'Tout-atout : capot ou générale'"
          class="h-11 cursor-pointer rounded-xl border text-sm font-bold transition disabled:cursor-default disabled:opacity-25"
          :class="declaration === d ? 'border-gold bg-gold text-felt' : 'border-white/15 text-ivory'"
          @click="declaration = d"
        >
          {{ d.toUpperCase() }}
        </button>
      </div>

      <!-- Le palier, de proche en proche jusqu'au capot et à la générale -->
      <div class="mt-2 flex items-center gap-2">
        <button
          type="button"
          aria-label="Palier en dessous"
          :disabled="index === 0"
          class="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-white/15 text-2xl text-ivory disabled:cursor-default disabled:opacity-25"
          @click="step(-1)"
        >
          −
        </button>
        <div class="flex h-11 grow items-center justify-center rounded-xl bg-black/25">
          <span data-testid="palier" class="font-display text-[26px] leading-none text-gold">{{
            level === null ? '—' : levelLabel(level)
          }}</span>
          <span v-if="special" class="ml-2 text-xs text-sage">250</span>
        </div>
        <button
          type="button"
          aria-label="Palier au-dessus"
          :disabled="index >= levels.length - 1"
          class="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-white/15 text-2xl text-ivory disabled:cursor-default disabled:opacity-25"
          @click="step(1)"
        >
          +
        </button>
      </div>

      <div class="mt-2 flex gap-2">
        <button
          type="button"
          class="h-11 w-[26%] shrink-0 cursor-pointer rounded-xl border border-white/20 text-[15px] font-semibold text-mist"
          @click="pass"
        >
          Passe
        </button>
        <button
          type="button"
          :disabled="!ready"
          :aria-label="ready && level !== null ? `Annoncer ${levelLabel(level)}` : 'Annoncer'"
          class="flex h-11 grow cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-gold text-[15px] font-bold text-felt transition disabled:cursor-default disabled:opacity-40"
          @click="announce"
        >
          <template v-if="ready && level !== null">
            {{ levelLabel(level) }}
            <SuitIcon
              v-if="declaration !== 'sa' && declaration !== 'ta'"
              :suit="declaration as Suit"
              class="size-4"
            />
            <template v-else>{{ declaration === 'sa' ? 'SA' : 'TA' }}</template>
          </template>
          <template v-else>Annoncer</template>
        </button>
        <button
          v-if="session.mayCoinche"
          type="button"
          class="h-11 shrink-0 cursor-pointer rounded-xl bg-red-card px-3 text-sm font-bold text-ivory"
          @click="coinche"
        >
          Coinche
        </button>
      </div>
    </template>

    <!-- Pas à moi de parler : qui réfléchit, et la coinche à la volée (CO-3) -->
    <div v-else class="mt-1 flex items-center gap-2 px-1">
      <span class="grow text-sm text-sage">
        <template v-if="session.undoPending">Annulation d'enchère : vote en cours…</template>
        <template v-else-if="session.toBid">{{ nameOf(session.toBid) }} réfléchit…</template>
        <template v-else>Enchères closes</template>
      </span>
      <button
        v-if="session.mayCoinche || session.maySurcoinche"
        type="button"
        class="h-10 shrink-0 cursor-pointer rounded-xl bg-red-card px-4 text-sm font-bold text-ivory"
        @click="coinche"
      >
        {{ session.mayCoinche ? 'Coinche ×2' : 'Surcoinche ×4' }}
      </button>
    </div>
  </div>
</template>
