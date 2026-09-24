<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import SuitRow from './SuitRow.vue'
import { type PlayerId, teamOfPlayer } from '../game/players'
import { useSession } from '../stores/session'
import { nomDe, useRoster } from '../stores/roster'
import { NOM_MAX } from '../firebase/joueurs'
import { useLargeScreen } from '../composables/useLargeScreen'
import { useTableLayout } from '../composables/useTableLayout'
import { useFitZoom } from '../composables/useFitZoom'

const session = useSession()
const roster = useRoster()
onMounted(() => void roster.charger())
const emit = defineEmits<{ stats: []; regles: [] }>()
const grand = useLargeScreen()
const L = useTableLayout()
/** À l'échelle de l'écran, sans jamais dépasser sa hauteur. */
const contenu = ref<HTMLElement | null>(null)
const zoom = useFitZoom(contenu, computed(() => L.value.t * 1.3), computed(() => L.value.height - 24))
const chosen = ref<PlayerId | null>(session.playerId)
const code = ref('')
/** Créer ou rejoindre prend plusieurs allers-retours avec la base : on le montre. */
const enCours = ref<'creer' | 'rejoindre' | null>(null)
async function creer(): Promise<void> {
  enCours.value = 'creer'
  try { await session.create(chosen.value!) } finally { enCours.value = null }
}
async function rejoindre(): Promise<void> {
  enCours.value = 'rejoindre'
  try { await session.join(cleanCode.value, chosen.value!) } finally { enCours.value = null }
}

const cleanCode = computed(() => code.value.trim().toUpperCase())
const canJoin = computed(() => Boolean(chosen.value) && cleanCode.value.length === 4)

// Dès que le code est complet, on regarde la partie pour griser les sièges pris.
watch(cleanCode, (value) => {
  if (value.length === 4) void session.peek(value)
})

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
const regardee = computed(() => cleanCode.value.length === 4 && session.game !== null)
function isTaken(p: PlayerId): boolean {
  return regardee.value && Boolean(session.takenBy[p]) && p !== session.playerId
}
function horsTable(p: PlayerId): boolean {
  return regardee.value && !session.takenBy[p] && session.present.length >= 4
}
// --- Ajouter un joueur : un nom, et il rejoint la liste pour de bon.
const ajout = ref(false)
const nouveauNom = ref('')
const champNom = ref<HTMLInputElement | null>(null)
async function ouvrirAjout(): Promise<void> {
  ajout.value = true
  roster.erreur = null
  await nextTick()
  champNom.value?.focus()
}
async function ajouter(): Promise<void> {
  const id = await roster.ajouter(nouveauNom.value)
  if (!id) return
  chosen.value = id
  nouveauNom.value = ''
  ajout.value = false
}
</script>

<template>
  <!-- Sur PC la colonne est mise à l'échelle et centrée : à 2560 px elle faisait un sixième de l'écran -->
  <div class="flex min-h-full">
  <div
    class="mx-auto flex w-full max-w-md flex-col px-6 pt-14 pb-8 [@media(max-height:820px)]:pt-8 max-lg:min-h-full lg:my-auto lg:py-10"
    ref="contenu"
    :style="grand ? { zoom } : undefined"
  >
    <div class="flex flex-col items-center">
      <SuitRow />
      <h1 class="mt-4 font-display text-4xl leading-none">Coinche</h1>
    </div>

    <p
      v-if="session.avis"
      role="status"
      class="mt-8 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-mist"
    >
      <span class="grow">{{ session.avis }}</span>
      <button type="button" class="cursor-pointer text-sage hover:text-mist" aria-label="Fermer" @click="session.avis = null">✕</button>
    </p>

    <h2 class="mt-12 mb-4 [@media(max-height:820px)]:mt-7 text-[15px] font-semibold text-mist">Qui es-tu ?</h2>

    <div class="flex flex-col gap-3">
      <button
        v-for="p in roster.joueurs"
        :key="p"
        type="button"
        :disabled="isTaken(p) || horsTable(p)"
        class="flex min-h-16 cursor-pointer items-center gap-3.5 rounded-2xl border px-4 text-left transition disabled:cursor-default disabled:opacity-40"
        :class="chosen === p
          ? 'border-gold bg-gold/15'
          : 'border-white/15 bg-white/5 hover:border-white/30'"
        @click="chosen = p"
      >
        <span
          class="flex size-10 shrink-0 items-center justify-center rounded-full text-[15px] font-bold text-felt"
          :class="avatarClass(p)"
        >{{ nomDe(p).charAt(0) }}</span>
        <span class="grow text-lg font-semibold">{{ nomDe(p) }}</span>
        <span class="text-xs" :class="teamClass(p)">
          {{ isTaken(p) ? 'déjà pris' : horsTable(p) ? 'table complète' : teamLabel(p) }}
        </span>
      </button>

      <form v-if="ajout" class="flex gap-2.5" @submit.prevent="ajouter">
        <input
          ref="champNom"
          v-model="nouveauNom"
          type="text"
          :maxlength="NOM_MAX"
          autocomplete="off"
          placeholder="Nom du joueur"
          aria-label="Nom du nouveau joueur"
          class="h-[50px] w-0 grow rounded-xl border border-white/15 bg-black/20 px-4 text-base font-semibold placeholder:font-normal placeholder:text-dusk focus:border-gold focus:outline-none"
          @keydown.esc="ajout = false"
        />
        <button
          type="submit"
          :disabled="!nouveauNom.trim() || roster.occupe"
          class="h-[50px] shrink-0 cursor-pointer rounded-xl bg-gold px-4 text-[15px] font-bold text-felt transition enabled:hover:brightness-110 disabled:cursor-default disabled:opacity-40"
        >{{ roster.occupe ? '…' : 'Ajouter' }}</button>
        <button
          type="button"
          class="h-[50px] shrink-0 cursor-pointer rounded-xl border border-white/15 px-3 text-sm text-mist transition hover:border-white/35"
          @click="ajout = false"
        >Annuler</button>
      </form>
      <button
        v-else
        type="button"
        class="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 text-sm text-sage transition hover:border-white/40 hover:text-mist"
        @click="ouvrirAjout"
      >+ Ajouter un joueur</button>
      <p v-if="roster.erreur" class="text-center text-sm text-red-card">{{ roster.erreur }}</p>
    </div>

    <div class="grow lg:hidden"></div>

    <label for="code" class="mt-10 mb-2 [@media(max-height:820px)]:mt-6 block text-[13px] text-sage">Code de la partie</label>
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
        @click="rejoindre"
      >{{ enCours === 'rejoindre' ? '…' : 'Rejoindre' }}</button>
    </div>

    <button
      type="button"
      :disabled="!chosen || session.busy"
      class="mt-3 h-[46px] cursor-pointer rounded-xl border border-white/15 text-sm font-medium text-mist transition enabled:hover:border-white/35 enabled:hover:bg-white/5 disabled:cursor-default disabled:opacity-40"
      @click="creer"
    >{{ enCours === 'creer' ? 'Création de la partie…' : 'Créer une nouvelle partie' }}</button>

    <div class="mt-5 flex justify-center gap-5">
      <button
        type="button"
        class="cursor-pointer text-[13px] text-sage underline-offset-4 transition hover:text-mist hover:underline"
        @click="emit('stats')"
      >Statistiques de toutes les parties</button>
      <button
        type="button"
        class="cursor-pointer text-[13px] text-sage underline-offset-4 transition hover:text-mist hover:underline"
        @click="emit('regles')"
      >Les règles</button>
    </div>

    <p v-if="session.error" class="mt-4 text-center text-sm text-red-card">{{ session.error }}</p>
  </div>
  </div>
</template>
