<script setup lang="ts">
/** Panneau d'enchères : paliers, couleur, capot, générale, coinche. */
import { computed, ref, watch } from 'vue'
import PlayingCard from './PlayingCard.vue'
import type { Suit } from '../game/cards'
import { SUIT_GLYPH, isRed } from '../game/display'
import { type PlayerId, nextPlayer, playerAtSeat, seatOf } from '../game/players'
import { nomDe } from '../stores/roster'
import { type BiddingEntry, type Declaration, canBidCapot, canBidGenerale } from '../game/bidding'
import { currentDeal } from '../game/replay'
import { useSession } from '../stores/session'
import { useLargeScreen } from '../composables/useLargeScreen'
import { useTableLayout } from '../composables/useTableLayout'
import { useFitZoom } from '../composables/useFitZoom'

const session = useSession()
const grand = useLargeScreen()
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
  computed(() => L.value.tapis.h - 2 * L.value.rim - Math.round(44 * L.value.u)),
)

/** Ma main dans le panneau, sur téléphone : la largeur du panneau, moins ses marges. */
const mainEncheres = computed(() => {
  // La colonne `max-w-md` (448 px), pas la fenêtre : sinon, sur tablette, la main débordait.
  const place = Math.min(L.value.width, 448) - 40
  const n = Math.max(1, session.sortedHand.length)
  const carte = Math.min(120, Math.round(place * 0.34))
  const pas = Math.min(carte - 8, (place - carte) / Math.max(1, n - 1))
  const x0 = Math.round((place - carte - (n - 1) * pas) / 2)
  return { carte, pas, x0, hauteur: Math.round(carte * 1.44 * 0.62) }
})

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
    .find((e) => e.kind === 'contrat' || e.kind === 'capot' || e.kind === 'generale')
})

const history = computed(() =>
  currentDeal(session.events).filter(
    (e) => e.type === 'enchere' || e.type === 'coinche' || e.type === 'surcoinche',
  ),
)

/** Ordre de parole de la donne : c'est l'ordre des colonnes de l'historique. */
const speakers = computed<PlayerId[]>(() => {
  const g = session.game
  if (!g) return []
  const first = nextPlayer(g.dealer, session.seating)
  const s = seatOf(first, session.seating)
  return [0, 1, 2, 3].map((i) => playerAtSeat(s + i, session.seating))
})

/**
 * L'historique en grille : une colonne par joueur, une ligne par tour de parole.
 * Il tient toujours en entier, sans ascenseur — une liste défilante cachait des annonces.
 */
const rounds = computed(() => {
  const rows: Partial<Record<PlayerId, BiddingEntry>>[] = []
  for (const e of history.value) {
    if (e.type !== 'enchere') continue
    const row = (rows[e.round - 1] ??= {})
    row[e.player] = e.entry
  }
  return rows
})
const coinches = computed(() => history.value.filter((e) => e.type === 'coinche' || e.type === 'surcoinche'))

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
  if (typeof l === 'number') session.bid({ kind: 'contrat', player, value: l, suit: d as Suit })
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

function label(entry: BiddingEntry): string {
  switch (entry.kind) {
    case 'passe':
      return 'Passe'
    case 'contrat':
      return String(entry.value)
    case 'capot':
      return 'Capot'
    case 'generale':
      return 'Générale'
    default:
      return ''
  }
}
const suitOfEntry = (entry: BiddingEntry): Declaration | null =>
  entry.kind === 'contrat'
    ? entry.suit
    : entry.kind === 'capot' || entry.kind === 'generale'
      ? entry.declaration
      : null

/** « Viv a annoncé 90 ♠ », « Viv a annoncé une générale sans-atout ». */
const bestText = computed(() => {
  const b = best.value
  if (!b) return ''
  const qui = nomDe(b.player)
  if (b.kind === 'contrat') return `${qui} a annoncé ${b.value} ${SUIT_GLYPH[b.suit]}`
  const quoi = b.kind === 'capot' ? 'un capot' : 'une générale'
  return `${qui} a annoncé ${quoi} ${declarationLabel(b.declaration)}`
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
    v-if="!grand || session.myBidTurn"
    :class="grand ? 'absolute z-40 -translate-x-1/2' : 'absolute inset-x-0 bottom-0 z-40'"
    :style="grand ? { left: '50%', top: `${L.tapis.y + L.rim + Math.round(22 * L.u)}px` } : undefined"
  >
    <div
      ref="panel"
      class="bg-felt-dark px-5 pb-7 pt-5 shadow-[0_-8px_32px_rgba(0,0,0,.45)]"
      :class="grand ? 'w-[480px] rounded-2xl border border-white/10 pb-5' : 'rounded-t-3xl'"
      :style="grand ? { zoom } : undefined"
    >
      <div class="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20 lg:hidden"></div>

      <!--
      Sur téléphone le panneau couvre la main : on la remet sous les yeux, en grand et
      coupée par le bas comme la main sur la table — on n'a besoin que des index.
    -->
      <div class="relative mb-4 overflow-hidden lg:hidden" :style="{ height: `${mainEncheres.hauteur}px` }">
        <div
          v-for="(card, i) in session.sortedHand"
          :key="card"
          class="absolute top-0"
          :style="{ left: `${mainEncheres.x0 + i * mainEncheres.pas}px` }"
        >
          <PlayingCard :card="card" :width="mainEncheres.carte" />
        </div>
      </div>

      <!--
      Qui a dit quoi : une colonne par joueur, dans l'ordre de parole. Sur PC, l'historique
      a sa propre colonne à droite du tapis (BiddingHistory) : la fenêtre n'en garde rien.
    -->
      <div v-if="history.length && !grand" class="mb-4">
        <div class="grid grid-cols-4 gap-x-2 border-b border-white/10 pb-1.5">
          <span
            v-for="p in speakers"
            :key="p"
            class="truncate text-[15px] font-semibold"
            :class="p === session.playerId ? 'text-gold' : 'text-mist'"
            >{{ nomDe(p) }}</span
          >
        </div>
        <div
          v-for="(row, r) in rounds"
          :key="r"
          class="grid grid-cols-4 gap-x-2 border-b border-white/5 py-1.5 last:border-0"
        >
          <span v-for="p in speakers" :key="p" class="flex h-7 items-center gap-1.5 text-[17px]">
            <template v-if="row[p]">
              <span :class="row[p]!.kind === 'passe' ? 'text-sage' : 'font-semibold text-ivory'">{{
                label(row[p]!)
              }}</span>
              <span
                v-if="suitOfEntry(row[p]!)"
                class="flex h-6 min-w-6 items-center justify-center rounded-full bg-ivory px-1 text-[15px] leading-none font-bold"
                :class="['h', 'd'].includes(suitOfEntry(row[p]!)!) ? 'text-red-card' : 'text-felt-dark'"
                >{{
                  ['sa', 'ta'].includes(suitOfEntry(row[p]!)!)
                    ? suitOfEntry(row[p]!)!.toUpperCase()
                    : SUIT_GLYPH[suitOfEntry(row[p]!) as Suit]
                }}</span
              >
            </template>
          </span>
        </div>
        <p
          v-for="(e, i) in coinches"
          :key="i"
          class="mt-2 rounded-lg bg-red-card/20 px-3 py-1.5 text-[14px] font-semibold text-[#f0a293]"
        >
          {{ nomDe(e.player) }} {{ e.type === 'coinche' ? 'coinche ! ×2' : 'surcoinche ! ×4' }}
        </p>
      </div>

      <template v-if="session.myBidTurn && coinched">
        <!-- CO-5 : coinché, le preneur ne peut plus que laisser jouer ou surcoincher -->
        <h2 class="text-[17px] font-semibold">Tu es coinché</h2>
        <p class="mb-4 text-[13px] text-sage">
          Plus personne ne surenchérit : laisse jouer à ×2, ou surcoinche à ×4.
        </p>
        <button
          type="button"
          class="h-12 w-full cursor-pointer rounded-[10px] border border-white/20 text-[15px] font-semibold text-mist transition hover:border-white/40 hover:bg-white/5"
          @click="session.playerId && session.bid({ kind: 'passe', player: session.playerId })"
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
            class="h-12 cursor-pointer rounded-[10px] border-2 bg-ivory text-[26px] leading-none transition hover:brightness-95"
            :class="[
              declaration === s
                ? 'border-gold ring-2 ring-gold ring-offset-2 ring-offset-felt-dark'
                : 'border-transparent',
              isRed(s) ? 'text-red-card' : 'text-felt-dark',
            ]"
            @click="pickDeclaration(s)"
          >
            {{ SUIT_GLYPH[s] }}
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
            @click="session.playerId && session.bid({ kind: 'passe', player: session.playerId })"
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
        <span v-if="session.toBid">{{ nomDe(session.toBid) }} réfléchit…</span>
        <span v-else>Enchères closes</span>
      </p>

      <!--
      CO-3 : la coinche se prend à la volée, sans attendre son tour. Sur PC le bouton est
      sorti du panneau (à côté de ma pastille) ; sur téléphone, le panneau est la zone
      d'action et il y reste.
    -->
      <div v-if="!grand && (session.mayCoinche || session.maySurcoinche)" class="mt-3">
        <button
          v-if="session.mayCoinche"
          type="button"
          class="h-12 w-full cursor-pointer rounded-[10px] bg-red-card text-[15px] font-bold text-ivory transition hover:brightness-110"
          @click="session.playerId && session.bid({ kind: 'coinche', player: session.playerId })"
        >
          Coincher
        </button>
        <button
          v-else
          type="button"
          class="h-12 w-full cursor-pointer rounded-[10px] bg-red-card text-[15px] font-bold text-ivory transition hover:brightness-110"
          @click="session.playerId && session.bid({ kind: 'surcoinche', player: session.playerId })"
        >
          Surcoincher
        </button>
        <p class="mt-2 text-center text-xs text-sage">Possible à tout moment, sans attendre son tour.</p>
      </div>
    </div>
  </div>
</template>
