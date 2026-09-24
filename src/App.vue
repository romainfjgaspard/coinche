<script setup lang="ts">
import { computed, onMounted } from 'vue'
import JoinScreen from './components/JoinScreen.vue'
import LobbyScreen from './components/LobbyScreen.vue'
import GameScreen from './components/GameScreen.vue'
import { useSession } from './stores/session'

const session = useSession()

onMounted(() => void session.resume())

type Screen = 'join' | 'loading' | 'lobby' | 'table'

const screen = computed<Screen>(() => {
  if (!session.code || !session.playerId) return 'join'
  if (!session.game) return 'loading'
  // Une donne blanche repasse la partie en « lobby » pour redistribuer : on reste à
  // table. Le salon — et son choix d'équipes — n'existe qu'avant la première donne.
  return session.game.phase === 'lobby' && session.game.dealNumber === 0 ? 'lobby' : 'table'
})
</script>

<template>
  <JoinScreen v-if="screen === 'join'" />
  <LobbyScreen v-else-if="screen === 'lobby'" />
  <GameScreen v-else-if="screen === 'table'" />
  <div v-else class="flex min-h-full items-center justify-center text-sm text-sage">
    Connexion à la partie…
  </div>
</template>
