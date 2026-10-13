<script setup lang="ts">
/**
 * Panneau d'enchères sur PC : paliers, couleur, capot, générale. Sur téléphone, c'est
 * `BiddingPanelPhone`, plus compact ; la coinche, sur PC, a son bouton près de ma pastille.
 */
import { computed, ref, watch } from 'vue'
import SuitIcon from './SuitIcon.vue'
import type { Suit } from '../game/cards'
import { SUIT_GLYPH, isRed } from '../game/display'
import { nameOf } from '../stores/roster'
import { type Declaration, canBidCapot, canBidGenerale } from '../game/bidding'
import { useSession } from '../stores/session'
import { useTableLayout } from '../composables/useTableLayout'
import { useFitZoom } from '../composables/useFitZoom'

const session = useSession()
const L = useTableLayout()

/**
 * Sur PC le panneau tient toujours dans le tapis : un long historique (plusieurs
 * tours, une coinche) le faisait déborder sur ma main en 1366×768. On mesure sa
 * hauteur naturelle et on réduit l'échelle juste ce qu'il faut.
 */
const panel = ref<HTMLElement | null>(null)
const zoom = useFitZoom(
  panel,
  computed(() => L.value.t * 1.15),
  computed(() => L.value.felt.h - 2 * L.value.rim - Math.round(44 * L.value.u)),
)

/** Ce que je m'apprête à annoncer : un palier chiffré, ou un capot, ou une générale. */
type Level = number | 'capot' | 'generale'
const level = ref<Level | null>(null)
const declaration = ref<Declaration | null>(null)

const SUITS: Suit[] = ['s', 'h', 'd', 'c']
// 170 : un « 150 belotté », qui ne se tient qu'avec la belote (DEC-3).
const ALL_VALUES = [80, 90, 100, 110, 120, 130, 140, 150, 160, 170]

const best = computed(() => {
  const entries = session.bidding?.entries ?? []
  return [...entries]
    .reverse()
    .find((e) => e.kind === 'contract' || e.kind === 'capot' || e.kind === 'generale')
})

const coinched = computed(() => (session.bidding?.entries ?? []).some((e) => e.kind === 'coinche'))
const capotOpen = computed(() => Boolean(session.bidding && canBidCapot(session.bidding)))
const generaleOpen = computed(() => Boolean(session.bidding && canBidGenerale(session.bidding)))

/** ENC-10 — sans-atout et tout-atout n'existent qu'en capot et en générale. */
const numeric = computed(() => typeof level.value === 'number')
const ready = computed(() => {
  if (level.value === null || declaration.value === null) return false
  if (numeric.value) return declaration.value !== 'sa' && declaration.value !== 'ta'
  return true
})

/** Ce que dit le bouton : l'annonce exacte, pour qu'on sache ce qu'on engage. */
const levelLabel = (l: Level): string => (l === 'capot' ? 'Capot' : l === 'generale' ? 'Générale' : String(l))
const declarationLabel = (d: Declaration): string =>
  d === 'sa' ? 'sans-atout' : d === 'ta' ? 'tout-atout' : SUIT_GLYPH[d]

/** Une seule chaîne : un espace en tête d'une balise imbriquée sautait au rendu. */
const announceLabel = computed(() =>
  ready.value ? `Annoncer ${levelLabel(level.value!)} ${declarationLabel(declaration.value!)}` : 'Annoncer',
)

/** Ce qui manque encore, dit en clair plutôt qu'un bouton grisé muet. */
const missing = computed(() => {
  if (level.value === null && declaration.value === null) return 'Choisis un palier et une couleur.'
  if (level.value === null) {
    return declaration.value === 'sa' || declaration.value === 'ta'
      ? 'Sans-atout et tout-atout : choisis capot ou générale.'
      : 'Choisis un palier, un capot ou une générale.'
  }
  if (declaration.value === null) return 'Choisis une couleur.'
  if (!ready.value) return "Sans-atout et tout-atout ne se jouent qu'en capot ou en générale."
  return ''
})

function pickLevel(l: Level): void {
  level.value = l
  // Un palier chiffré ne se joue qu'à la couleur : on oublie un SA/TA resté sélectionné.
  if (typeof l === 'number' && (declaration.value === 'sa' || declaration.value === 'ta')) {
    declaration.value = null
  }
}
function pickDeclaration(d: Declaration): void {
  declaration.value = d
  if ((d === 'sa' || d === 'ta') && typeof level.value === 'number') level.value = null
}

function announce(): void {
  if (!ready.value || !session.playerId) return
  const player = session.playerId
  const l = level.value!
  const d = declaration.value!
  if (typeof l === 'number') session.bid({ kind: 'contract', player, value: l, suit: d as Suit })
  else session.bid({ kind: l, player, declaration: d })
  level.value = null
  declaration.value = null
}

// Une sélection ne survit pas à une annonce adverse qui la rend caduque.
watch(
  () => session.bidValues,
  (values) => {
    if (typeof level.value === 'number' && !values.includes(level.value)) level.value = null
    if (level.value === 'capot' && !capotOpen.value) level.value = null
    if (level.value === 'generale' && !generaleOpen.value) level.value = null
  },
)

/** « Viv a annoncé 90 ♠ », « Viv a annoncé une générale sans-atout ». */
const bestText = computed(() => {
  const b = best.value
  if (!b) return ''
  const who = nameOf(b.player)
  if (b.kind === 'contract') return `${who} a annoncé ${b.value} ${SUIT_GLYPH[b.suit]}`
  const what = b.kind === 'capot' ? 'un capot' : 'une générale'
  return `${who} a annoncé ${what} ${declarationLabel(b.declaration)}`
})
</script>

<template>
  <!--
    Sur PC le panneau se cale en haut du tapis et grandit vers le bas : centré
    verticalement, il sautait à chaque annonce ajoutée à l'historique.
  -->
  <!--
    Sur PC, la fenêtre n'apparaît que quand c'est à moi de parler : « réfléchit… » se lit
    à côté du joueur concerné, et l'historique a sa colonne à gauche du tapis.
  -->
  <div
    v-if="session.myBidTurn"
    class="absolute z-40 -translate-x-1/2"
    :style="{ left: '50%', top: `${L.felt.y + L.rim + Math.round(22 * L.u)}px` }"
  >
    <div
      ref="panel"
      class="w-[480px] rounded-2xl border border-white/10 bg-felt-dark px-5 pt-5 pb-5 shadow-[0_-8px_32px_rgba(0,0,0,.45)]"
      :style="{ zoom }"
    >
      <template v-if="session.myBidTurn && coinched">
        <!-- CO-5 : coinché, le preneur ne peut plus que laisser jouer ou surcoincher -->
        <h2 class="text-[17px] font-semibold">Tu es coinché</h2>
        <p class="mb-4 text-[13px] text-sage">
          Plus personne ne surenchérit : laisse jouer à ×2, ou surcoinche à ×4.
        </p>
        <button
          type="button"
          class="h-12 w-full cursor-pointer rounded-[10px] border border-white/20 text-[15px] font-semibold text-mist transition hover:border-white/40 hover:bg-white/5"
          @click="session.playerId && session.bid({ kind: 'pass', player: session.playerId })"
        >
          Passe
        </button>
      </template>

      <template v-else-if="session.myBidTurn">
        <h2 class="text-[17px] font-semibold">Ton enchère</h2>
        <p class="mb-4 text-[13px] text-sage">
          <span v-if="bestText">{{ bestText }} — il faut faire mieux</span>
          <span v-else>Personne n'a encore annoncé</span>
        </p>

        <div class="grid grid-cols-5 gap-2">
          <button
            v-for="v in ALL_VALUES"
            :key="v"
            type="button"
            :disabled="!session.bidValues.includes(v)"
            class="h-11 cursor-pointer rounded-[10px] border text-[15px] font-bold transition disabled:cursor-default disabled:opacity-30"
            :class="
              level === v
                ? 'border-gold bg-gold text-felt'
                : 'border-white/15 bg-white/5 text-ivory enabled:hover:border-white/40 enabled:hover:bg-white/12'
            "
            @click="pickLevel(v)"
          >
            {{ v }}
          </button>
        </div>

        <div class="mt-2 grid grid-cols-2 gap-2">
          <button
            v-for="l in ['capot', 'generale'] as const"
            :key="l"
            type="button"
            :disabled="l === 'capot' ? !capotOpen : !generaleOpen"
            class="h-11 cursor-pointer rounded-[10px] border text-sm font-bold transition disabled:cursor-default disabled:opacity-30"
            :class="
              level === l
                ? 'border-gold bg-gold text-felt'
                : 'border-white/15 bg-white/5 text-ivory enabled:hover:border-white/40 enabled:hover:bg-white/12'
            "
            @click="pickLevel(l)"
          >
            {{ levelLabel(l) }} · 250
          </button>
        </div>

        <div class="mt-3.5 grid grid-cols-6 gap-2">
          <button
            v-for="s in SUITS"
            :key="s"
            type="button"
            :aria-label="`Atout ${declarationLabel(s)}`"
            class="flex h-12 cursor-pointer items-center justify-center rounded-[10px] border-2 bg-ivory transition hover:brightness-95"
            :class="[
              declaration === s
                ? 'border-gold ring-2 ring-gold ring-offset-2 ring-offset-felt-dark'
                : 'border-transparent',
              isRed(s) ? 'text-red-card' : 'text-felt-dark',
            ]"
            @click="pickDeclaration(s)"
          >
            <SuitIcon :suit="s" class="size-7" />
          </button>
          <button
            v-for="d in ['sa', 'ta'] as const"
            :key="d"
            type="button"
            :title="d === 'sa' ? 'Sans-atout (capot ou générale)' : 'Tout-atout (capot ou générale)'"
            class="h-12 cursor-pointer rounded-[10px] border-2 text-[15px] font-bold transition"
            :class="
              declaration === d
                ? 'border-gold bg-gold text-felt'
                : 'border-white/15 bg-white/5 text-ivory hover:border-white/40 hover:bg-white/12'
            "
            @click="pickDeclaration(d)"
          >
            {{ d.toUpperCase() }}
          </button>
        </div>

        <p class="mt-2.5 h-4 text-xs" :class="ready ? 'text-transparent' : 'text-sage'">{{ missing }}</p>

        <div class="mt-3 flex gap-2">
          <button
            type="button"
            class="h-12 grow cursor-pointer rounded-[10px] border border-white/20 text-[15px] font-semibold text-mist transition hover:border-white/40 hover:bg-white/5"
            @click="session.playerId && session.bid({ kind: 'pass', player: session.playerId })"
          >
            Passe
          </button>
          <button
            type="button"
            :disabled="!ready"
            class="h-12 grow-[1.4] cursor-pointer rounded-[10px] bg-gold text-[15px] font-bold text-felt transition enabled:hover:brightness-110 disabled:cursor-default disabled:opacity-40"
            @click="announce"
          >
            {{ announceLabel }}
          </button>
        </div>
      </template>

      <p v-else class="py-3 text-center text-sm text-mist">
        <span v-if="session.toBid">{{ nameOf(session.toBid) }} réfléchit…</span>
        <span v-else>Enchères closes</span>
      </p>
    </div>
  </div>
</template>
