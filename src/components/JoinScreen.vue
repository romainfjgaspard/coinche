<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import SuitRow from './SuitRow.vue'
import { type PlayerId, teamOfPlayer } from '../game/players'
import { useSession } from '../stores/session'
import { nameOf, useRoster } from '../stores/roster'
import { LAST_CODE_KEY } from '../stores/session'
import { NAME_MAX } from '../firebase/players'
import { useLargeScreen } from '../composables/useLargeScreen'
import { useTableLayout } from '../composables/useTableLayout'
import { useFitZoom } from '../composables/useFitZoom'

const session = useSession()
const roster = useRoster()
onMounted(() => void roster.load())
const emit = defineEmits<{ stats: []; rules: [] }>()
const large = useLargeScreen()
const L = useTableLayout()
/** À l'échelle de l'écran, sans jamais dépasser sa hauteur. */
const content = ref<HTMLElement | null>(null)
const zoom = useFitZoom(
  content,
  computed(() => L.value.t * 1.3),
  computed(() => L.value.height - 24),
)
const chosen = ref<PlayerId | null>(session.playerId)
const code = ref(initialCode())

/**
 * Le code à pré-remplir : celui d'un lien partagé depuis le salon (`?code=`), sinon
 * le dernier code utilisé sur ce navigateur. Le paramètre est retiré de l'adresse : un
 * rechargement ne doit pas y ramener une fois la partie quittée.
 */
function initialCode(): string {
  const link = new URLSearchParams(location.search).get('code')?.trim().toUpperCase() ?? ''
  if (/^[A-Z]{4}$/.test(link)) {
    const url = new URL(location.href)
    url.searchParams.delete('code')
    history.replaceState(null, '', url)
    return link
  }
  try {
    return localStorage.getItem(LAST_CODE_KEY) ?? ''
  } catch {
    return ''
  }
}

/** Retirer un nom de la liste de ce navigateur ; ses parties restent en base. */
function remove(p: PlayerId): void {
  roster.hide(p)
  if (chosen.value === p) chosen.value = null
}
/** Créer ou rejoindre prend plusieurs allers-retours avec la base : on le montre. */
const pendingAction = ref<'create' | 'join' | null>(null)
async function create(): Promise<void> {
  pendingAction.value = 'create'
  try {
    await session.create(chosen.value!)
  } finally {
    pendingAction.value = null
  }
}
async function joinGame(): Promise<void> {
  pendingAction.value = 'join'
  try {
    await session.join(cleanCode.value, chosen.value!)
  } finally {
    pendingAction.value = null
  }
}

const cleanCode = computed(() => code.value.trim().toUpperCase())

// Dès que le code est complet, on regarde la partie pour griser les sièges pris.
// Un code pré-rempli se regarde aussi ; s'il ne mène plus nulle part (partie effacée),
// on l'oublie sans afficher d'erreur : ce n'est pas le joueur qui s'est trompé.
let prefilled = code.value !== ''
watch(
  cleanCode,
  async (value) => {
    const fromMemory = prefilled
    prefilled = false
    if (value.length !== 4) return
    await session.peek(value)
    if (fromMemory && !session.game && cleanCode.value === value) {
      code.value = ''
      session.error = null
    }
  },
  { immediate: true },
)

// Les équipes dépendent du placement, qui n'existe qu'une fois la partie créée.
const team = (p: PlayerId): 0 | 1 | null => {
  const seating = session.game?.seating
  return seating ? teamOfPlayer(p, seating) : null
}
const teamLabel = (p: PlayerId): string => {
  const t = team(p)
  return t === null ? '' : t === 0 ? 'Équipe 1' : 'Équipe 2'
}
const teamClass = (p: PlayerId): string => (team(p) === 1 ? 'text-them' : 'text-gold')
const avatarClass = (p: PlayerId): string => (team(p) === 1 ? 'bg-them' : 'bg-gold')

/** La partie regardée : on grise qui y est déjà assis, et tout le monde si elle est pleine. */
const watched = computed(() => cleanCode.value.length === 4 && session.game !== null && !gameOver.value)
/** Un code pré-rempli peut viser une partie finie : elle ne doit griser personne. */
const gameOver = computed(
  () =>
    cleanCode.value.length === 4 &&
    (session.game?.phase === 'finished' || session.game?.phase === 'cancelled'),
)
const canJoin = computed(() => Boolean(chosen.value) && cleanCode.value.length === 4 && !gameOver.value)
function isTaken(p: PlayerId): boolean {
  return watched.value && Boolean(session.takenBy[p]) && p !== session.playerId
}
function offTable(p: PlayerId): boolean {
  return watched.value && !session.takenBy[p] && session.present.length >= 4
}
// --- Ajouter un joueur : un nom, et il rejoint la liste pour de bon.
const adding = ref(false)
const newName = ref('')
const nameField = ref<HTMLInputElement | null>(null)
async function openAdd(): Promise<void> {
  adding.value = true
  roster.error = null
  roster.info = null
  await nextTick()
  nameField.value?.focus()
}
async function add(): Promise<void> {
  const id = await roster.add(newName.value)
  if (!id) return
  chosen.value = id
  newName.value = ''
  adding.value = false
}
</script>

<template>
  <!-- Sur PC la colonne est mise à l'échelle et centrée : à 2560 px elle faisait un sixième de l'écran -->
  <div class="flex min-h-full">
    <div
      ref="contenu"
      class="mx-auto flex w-full max-w-md flex-col px-6 pt-14 pb-8 [@media(max-height:820px)]:pt-8 max-lg:min-h-full lg:my-auto lg:py-10"
      :style="large ? { zoom } : undefined"
    >
      <div class="flex flex-col items-center">
        <SuitRow />
        <h1 class="mt-4 font-display text-4xl leading-none">Coinche</h1>
      </div>

      <p
        v-if="session.opinion"
        role="status"
        class="mt-8 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-mist"
      >
        <span class="grow">{{ session.opinion }}</span>
        <button
          type="button"
          class="cursor-pointer text-sage hover:text-mist"
          aria-label="Fermer"
          @click="session.opinion = null"
        >
          ✕
        </button>
      </p>

      <h2 class="mt-9 mb-4 lg:mt-12 [@media(max-height:820px)]:mt-7 text-[15px] font-semibold text-mist">
        Qui es-tu ?
      </h2>

      <div class="flex flex-col gap-3">
        <!--
        La liste défile au-delà de quatre noms et demi : en grandissant, elle faisait
        rétrécir toute la colonne, mise à l'échelle pour tenir dans la hauteur.
      -->
        <div
          class="-mr-1.5 flex max-h-[19.25rem] flex-col gap-3 overflow-y-auto pr-1.5 [@media(max-height:820px)]:max-h-[15rem] [scrollbar-color:rgba(255,255,255,.18)_transparent] [scrollbar-width:thin]"
        >
          <div v-for="p in roster.players" :key="p" class="relative flex shrink-0">
            <button
              type="button"
              :disabled="isTaken(p) || offTable(p)"
              class="flex min-h-16 grow cursor-pointer items-center gap-3.5 rounded-2xl border pr-12 pl-4 text-left transition disabled:cursor-default disabled:opacity-40"
              :class="
                chosen === p ? 'border-gold bg-gold/15' : 'border-white/15 bg-white/5 hover:border-white/30'
              "
              @click="chosen = p"
            >
              <span
                class="flex size-10 shrink-0 items-center justify-center rounded-full text-[15px] font-bold text-felt"
                :class="avatarClass(p)"
                >{{ nameOf(p).charAt(0) }}</span
              >
              <span class="grow text-lg font-semibold">{{ nameOf(p) }}</span>
              <span class="text-xs" :class="teamClass(p)">
                {{ isTaken(p) ? 'déjà pris' : offTable(p) ? 'table complète' : teamLabel(p) }}
              </span>
            </button>
            <!-- Masque le nom sur ce navigateur seulement : rien n'est effacé en base -->
            <button
              type="button"
              class="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-base text-dusk transition hover:bg-white/10 hover:text-mist"
              :aria-label="`Retirer ${nameOf(p)} de la liste`"
              :title="`Retirer ${nameOf(p)} de cette liste (rien n'est effacé)`"
              @click="remove(p)"
            >
              ✕
            </button>
          </div>
        </div>

        <form v-if="adding" class="flex gap-2.5" @submit.prevent="add">
          <input
            ref="champNom"
            v-model="newName"
            type="text"
            :maxlength="NAME_MAX"
            autocomplete="off"
            placeholder="Nom du joueur"
            aria-label="Nom du nouveau joueur"
            class="h-[50px] w-0 grow rounded-xl border border-white/15 bg-black/20 px-4 text-base font-semibold placeholder:font-normal placeholder:text-dusk focus:border-gold focus:outline-none"
            @keydown.esc="adding = false"
          />
          <button
            type="submit"
            :disabled="!newName.trim() || roster.busyNow"
            class="h-[50px] shrink-0 cursor-pointer rounded-xl bg-gold px-4 text-[15px] font-bold text-felt transition enabled:hover:brightness-110 disabled:cursor-default disabled:opacity-40"
          >
            {{ roster.busyNow ? '…' : 'Ajouter' }}
          </button>
          <button
            type="button"
            class="h-[50px] shrink-0 cursor-pointer rounded-xl border border-white/15 px-3 text-sm text-mist transition hover:border-white/35"
            @click="adding = false"
          >
            Annuler
          </button>
        </form>
        <button
          v-else
          type="button"
          class="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 text-sm text-sage transition hover:border-white/40 hover:text-mist"
          @click="openAdd"
        >
          + Ajouter un joueur
        </button>
        <p v-if="roster.error" class="text-center text-sm text-red-card">{{ roster.error }}</p>
        <p v-else-if="roster.info" class="text-center text-[13px] leading-snug text-sage">
          {{ roster.info }}
        </p>
      </div>

      <div class="grow lg:hidden"></div>

      <label for="code" class="mt-7 mb-2 lg:mt-10 [@media(max-height:820px)]:mt-6 block text-[13px] text-sage"
        >Code de la partie</label
      >
      <div class="flex gap-2.5">
        <input
          id="code"
          v-model="code"
          type="text"
          maxlength="4"
          autocapitalize="characters"
          autocomplete="off"
          placeholder="————"
          class="h-[50px] w-0 grow rounded-xl border border-white/15 bg-black/20 px-4 text-xl font-semibold tracking-[0.3em] uppercase placeholder:text-dusk focus:border-gold focus:outline-none"
        />
        <button
          type="button"
          :disabled="!canJoin || session.busy"
          class="h-[50px] w-28 shrink-0 cursor-pointer rounded-xl bg-gold text-[15px] font-bold text-felt transition enabled:hover:brightness-110 disabled:cursor-default disabled:opacity-40"
          @click="joinGame"
        >
          {{ pendingAction === 'join' ? '…' : 'Rejoindre' }}
        </button>
      </div>
      <p v-if="gameOver" class="mt-1.5 text-xs text-sage">
        La partie {{ cleanCode }} est {{ session.game?.phase === 'cancelled' ? 'annulée' : 'terminée' }} :
        crée-en une nouvelle.
      </p>

      <button
        type="button"
        :disabled="!chosen || session.busy"
        class="mt-3 h-[46px] cursor-pointer rounded-xl border border-white/15 text-sm font-medium text-mist transition enabled:hover:border-white/35 enabled:hover:bg-white/5 disabled:cursor-default disabled:opacity-40"
        @click="create"
      >
        {{ pendingAction === 'create' ? 'Création de la partie…' : 'Créer une nouvelle partie' }}
      </button>

      <!-- Les liens, l'un sous l'autre et centrés. Soulignés : on voit tout de suite que ce sont des liens. -->
      <div class="mt-5 flex flex-col items-center gap-2.5">
        <button
          type="button"
          class="cursor-pointer text-[13px] text-sage underline underline-offset-4 transition hover:text-mist"
          @click="emit('rules')"
        >
          Les règles
        </button>
        <button
          type="button"
          class="cursor-pointer text-[13px] text-sage underline underline-offset-4 transition hover:text-mist"
          @click="emit('stats')"
        >
          Statistiques de toutes les parties
        </button>
        <a
          href="https://github.com/romainfjgaspard/coinche"
          target="_blank"
          rel="noopener"
          class="flex items-center gap-1.5 text-[13px] text-sage underline underline-offset-4 transition hover:text-mist"
        >
          <svg viewBox="0 0 16 16" class="size-3.5" fill="currentColor" aria-hidden="true">
            <path
              d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"
            />
          </svg>
          sur GitHub
        </a>
      </div>

      <p v-if="session.error" class="mt-4 text-center text-sm text-red-card">{{ session.error }}</p>
    </div>
  </div>
</template>
