<script setup lang="ts">
/**
 * Quitter une partie en cours : elle s'arrête pour les quatre, et chacun revient à
 * l'accueil. Le geste est lourd, donc confirmé. Une partie terminée se quitte d'un clic.
 */
import { computed, ref } from 'vue'
import { useSession } from '../stores/session'
import ModalDialog from './ModalDialog.vue'

defineProps<{ large?: boolean }>()

const session = useSession()
const confirm = ref(false)
const finished = computed(() => session.game?.phase === 'finished')

function quit(): void {
  if (finished.value) session.leave()
  else confirm.value = true
}
</script>

<template>
  <button
    type="button"
    class="shrink-0 cursor-pointer rounded-lg border border-white/15 font-semibold text-mist transition hover:border-white/35 hover:bg-white/5"
    :class="large ? 'px-3.5 py-1.5 text-sm' : 'px-2.5 py-1.5 text-sm'"
    @click="quit"
  >
    Quitter
  </button>

  <ModalDialog v-if="confirm" title="Annuler la partie ?" @close="confirm = false">
    <p class="text-sm leading-relaxed text-mist">
      Elle s'arrête pour les quatre joueurs, et chacun revient à l'accueil. Elle ne comptera pas dans les
      statistiques.
    </p>
    <div class="mt-5 flex flex-col gap-2.5">
      <button
        type="button"
        :disabled="session.busy"
        class="h-12 cursor-pointer rounded-xl bg-red-card text-[15px] font-bold text-ivory transition enabled:hover:brightness-110 disabled:opacity-50"
        @click="session.cancel()"
      >
        {{ session.busy ? 'Annulation…' : 'Annuler la partie' }}
      </button>
      <button
        type="button"
        class="h-11 cursor-pointer rounded-xl border border-white/15 text-sm font-medium text-mist transition hover:border-white/35 hover:bg-white/5"
        @click="confirm = false"
      >
        Continuer à jouer
      </button>
    </div>
    <p v-if="session.error" class="mt-3 text-center text-sm text-red-card">{{ session.error }}</p>
  </ModalDialog>
</template>
