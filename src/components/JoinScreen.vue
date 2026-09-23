<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import SuitRow from './SuitRow.vue'
import { PLAYER_IDS, PLAYER_NAMES, type PlayerId, teamOfPlayer } from '../game/players'
import { useSession } from '../stores/session'

const session = useSession()
const chosen = ref<PlayerId | null>(session.playerId)
const code = ref('')

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

function isTaken(p: PlayerId): boolean {
  return cleanCode.value.length === 4 && session.takenBy[p] && p !== session.playerId
}
</script>

<template>
  <div class="mx-auto flex min-h-full w-full max-w-md flex-col px-6 pt-14 pb-8">
    <div class="flex flex-col items-center">
      <SuitRow />
      <h1 class="mt-4 font-display text-4xl leading-none">Coinche</h1>
      <p class="mt-1 text-sm text-sage">Entre Benel, Roux, Viv et Romain</p>
    </div>

    <h2 class="mt-12 mb-4 text-[15px] font-semibold text-mist">Qui es-tu ?</h2>

    <div class="flex flex-col gap-3">
      <button
        v-for="p in PLAYER_IDS"
        :key="p"
        type="button"
        :disabled="isTaken(p)"
        class="flex min-h-16 items-center gap-3.5 rounded-2xl border px-4 text-left transition disabled:opacity-40"
        :class="chosen === p
          ? 'border-gold bg-gold/15'
          : 'border-white/15 bg-white/5 hover:border-white/30'"
        @click="chosen = p"
      >
        <span
          class="flex size-10 shrink-0 items-center justify-center rounded-full text-[15px] font-bold text-felt"
          :class="avatarClass(p)"
        >{{ PLAYER_NAMES[p].charAt(0) }}</span>
        <span class="grow text-lg font-semibold">{{ PLAYER_NAMES[p] }}</span>
        <span class="text-xs" :class="teamClass(p)">
          {{ isTaken(p) ? 'déjà pris' : teamLabel(p) }}
        </span>
      </button>
    </div>

    <div class="grow"></div>

    <label for="code" class="mt-10 mb-2 block text-[13px] text-sage">Code de la partie</label>
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
        class="h-[50px] w-28 shrink-0 rounded-xl bg-gold text-[15px] font-bold text-felt disabled:opacity-40"
        @click="session.join(cleanCode, chosen!)"
      >Rejoindre</button>
    </div>

    <button
      type="button"
      :disabled="!chosen || session.busy"
      class="mt-3 h-[46px] rounded-xl border border-white/15 text-sm font-medium text-mist disabled:opacity-40"
      @click="session.create(chosen!)"
    >Créer une nouvelle partie</button>

    <p v-if="session.error" class="mt-4 text-center text-sm text-red-card">{{ session.error }}</p>
  </div>
</template>
