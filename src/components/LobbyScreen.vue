<script setup lang="ts">
import { computed } from 'vue'
import {
  PAIRINGS, PLAYER_IDS, PLAYER_NAMES, type PlayerId, type Seating, pairingKey,
  partnerOf, randomSeating, teamOfPlayer,
} from '../game/players'
import { useSession } from '../stores/session'

const session = useSession()

const seatedCount = computed(
  () => PLAYER_IDS.filter((p) => session.takenBy[p]).length,
)
const dealer = computed<PlayerId | null>(() => session.game?.dealer ?? null)
const iAmDealer = computed(() => session.playerId !== null && session.playerId === dealer.value)
const seating = computed<Seating | null>(() => session.game?.seating ?? null)
const avatarClass = (p: PlayerId): string =>
  seating.value && teamOfPlayer(p, seating.value) === 1 ? 'bg-them' : 'bg-gold'

/** Les trois duos possibles, pour choisir plutôt que subir le tirage. */
const duos = computed(() =>
  PAIRINGS.map((s) => ({
    seating: s,
    label: `${PLAYER_NAMES[s[0]]} & ${PLAYER_NAMES[s[2]]}`,
    contre: `${PLAYER_NAMES[s[1]]} & ${PLAYER_NAMES[s[3]]}`,
    actif: seating.value !== null && pairingKey(s) === pairingKey(seating.value),
  })),
)
const monPartenaire = computed(() =>
  session.playerId && seating.value ? partnerOf(session.playerId, seating.value) : null,
)
</script>

<template>
  <div class="mx-auto flex min-h-full w-full max-w-md flex-col px-6 pt-14 pb-8">
    <p class="text-[13px] text-sage">Code de la partie</p>
    <div class="mt-1 flex items-baseline gap-3">
      <span class="font-display text-5xl tracking-[0.18em] leading-none">{{ session.code }}</span>
      <button
        type="button"
        class="text-[13px] text-sage underline underline-offset-4 hover:text-mist"
        @click="session.leave()"
      >quitter</button>
    </div>
    <p class="mt-3 text-sm text-mist">
      Donne-le aux trois autres pour qu'ils rejoignent.
    </p>

    <h2 class="mt-8 mb-3 text-[13px] font-semibold tracking-wider text-sage uppercase">Les équipes</h2>
    <p v-if="monPartenaire" class="mb-3 text-sm text-mist">
      Tu joues avec <span class="font-semibold text-gold">{{ PLAYER_NAMES[monPartenaire] }}</span>.
    </p>
    <div class="flex flex-col gap-2">
      <button
        v-for="duo in duos"
        :key="duo.label"
        type="button"
        class="flex items-center gap-3 rounded-xl border px-4 py-2.5 text-left"
        :class="duo.actif ? 'border-gold bg-gold/15' : 'border-white/15'"
        @click="session.chooseSeating(duo.seating)"
      >
        <span class="grow text-sm font-semibold" :class="duo.actif ? 'text-gold' : 'text-mist'">
          {{ duo.label }}
        </span>
        <span class="text-xs text-sage">contre {{ duo.contre }}</span>
      </button>
    </div>
    <button
      type="button"
      class="mt-2 h-10 w-full rounded-xl border border-white/15 text-[13px] text-mist"
      @click="session.chooseSeating(randomSeating())"
    >Retirer au sort</button>

    <h2 class="mt-8 mb-3 text-[13px] font-semibold tracking-wider text-sage uppercase">
      Autour de la table — {{ seatedCount }} sur 4
    </h2>

    <ul class="flex flex-col gap-2.5">
      <li
        v-for="p in PLAYER_IDS"
        :key="p"
        class="flex min-h-14 items-center gap-3.5 rounded-xl border px-4"
        :class="session.takenBy[p] ? 'border-white/15 bg-white/5' : 'border-dashed border-white/15'"
      >
        <span
          class="flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-felt"
          :class="session.takenBy[p] ? avatarClass(p) : 'bg-white/10 text-mist'"
        >{{ PLAYER_NAMES[p].charAt(0) }}</span>
        <span class="grow font-semibold" :class="session.takenBy[p] ? '' : 'text-dusk'">
          {{ PLAYER_NAMES[p] }}
          <span v-if="p === session.playerId" class="text-xs text-sage">— toi</span>
        </span>
        <span v-if="p === dealer" class="text-xs text-gold">donneur</span>
        <span v-else-if="!session.takenBy[p]" class="text-xs text-dusk">en attente</span>
      </li>
    </ul>

    <div class="grow"></div>

    <template v-if="session.ready">
      <button
        v-if="iAmDealer"
        type="button"
        :disabled="session.busy"
        class="mt-8 h-14 rounded-xl bg-gold text-base font-bold text-felt disabled:opacity-40"
        @click="session.startDeal()"
      >Distribuer</button>
      <p v-else class="mt-8 text-center text-sm text-mist">
        Tout le monde est là. {{ dealer ? PLAYER_NAMES[dealer] : '' }} distribue.
      </p>
    </template>
    <p v-else class="mt-8 text-center text-sm text-sage">
      En attente de {{ 4 - seatedCount }} joueur{{ 4 - seatedCount > 1 ? 's' : '' }}…
    </p>

    <p v-if="session.error" class="mt-4 text-center text-sm text-red-card">{{ session.error }}</p>
  </div>
</template>
