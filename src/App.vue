<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import JoinScreen from './components/JoinScreen.vue'
import LobbyScreen from './components/LobbyScreen.vue'
import GameScreen from './components/GameScreen.vue'
import StatsScreen from './components/StatsScreen.vue'
import RulesScreen from './components/RulesScreen.vue'
import { useSession } from './stores/session'
import { readStatsAddress } from './composables/statsAddress'

const session = useSession()

onMounted(() => void session.resume())

/** L'historique se consulte depuis l'accueil, sans rejoindre de partie. */
// Un lien vers une page des stats (`?stats=toutes/duos`) l'ouvre directement.
const homeStats = ref(readStatsAddress() !== null)
/** Les règles aussi, depuis l'accueil. */
const homeRules = ref(false)

type Screen = 'join' | 'loading' | 'lobby' | 'table'

const screen = computed<Screen>(() => {
  if (!session.code || !session.playerId) return 'join'
  if (!session.game) return 'loading'
  // Une donne blanche repasse la partie en « lobby » pour redistribuer : on reste à
  // table. Le salon — et son choix d'équipes — n'existe qu'avant la première donne.
  return session.game.phase === 'lobby' && session.game.dealNumber === 0 ? 'lobby' : 'table'
})

// Le lien des stats ouvrait l'historique de l'accueil : une fois à table, il est consommé.
watch(screen, (s) => {
  if (s !== 'join') homeStats.value = false
})

/**
 * Filet de sécurité : une connexion qui traîne au-delà de quelques secondes propose de
 * revenir à l'accueil, au lieu d'obliger à vider le cache du navigateur.
 */
const slow = ref(false)
let slowTimer: ReturnType<typeof setTimeout> | undefined
watch(
  screen,
  (s) => {
    clearTimeout(slowTimer)
    slow.value = false
    if (s === 'loading') slowTimer = setTimeout(() => (slow.value = true), 8000)
  },
  { immediate: true },
)
</script>

<template>
  <StatsScreen v-if="screen === 'join' && homeStats" global-only @close="homeStats = false" />
  <RulesScreen v-else-if="screen === 'join' && homeRules" back-label="Accueil" @close="homeRules = false" />
  <JoinScreen v-else-if="screen === 'join'" @stats="homeStats = true" @rules="homeRules = true" />
  <LobbyScreen v-else-if="screen === 'lobby'" />
  <GameScreen v-else-if="screen === 'table'" />
  <div
    v-else
    class="flex min-h-full flex-col items-center justify-center gap-4 px-6 text-center text-sm text-sage"
  >
    <p>Connexion à la partie {{ session.code }}…</p>
    <template v-if="slow">
      <p class="max-w-xs">
        La partie ne répond pas. Elle a peut-être été supprimée, ou la connexion est coupée.
      </p>
      <button
        type="button"
        class="h-11 cursor-pointer rounded-xl bg-gold px-5 text-[15px] font-bold text-felt transition hover:brightness-110"
        @click="session.leave()"
      >
        Retour à l'accueil
      </button>
    </template>
  </div>
</template>
