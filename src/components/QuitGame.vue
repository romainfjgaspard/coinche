<script setup lang="ts">
/**
 * Quitter une partie en cours : elle s'arrête pour les quatre, et chacun revient à
 * l'accueil. Le geste est lourd, donc confirmé. Une partie terminée se quitte d'un clic.
 */
import { computed, ref } from 'vue'
import { useSession } from '../stores/session'

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

  <Teleport to="body">
    <div
      v-if="confirm"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6"
      @click.self="confirm = false"
      @keydown.esc="confirm = false"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quitter-titre"
        class="w-full max-w-sm rounded-2xl border border-white/10 bg-felt-dark p-6 text-ivory shadow-2xl"
      >
        <h2 id="quitter-titre" class="font-display text-2xl">Annuler la partie ?</h2>
        <p class="mt-2 text-sm leading-relaxed text-mist">
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
      </div>
    </div>
  </Teleport>
</template>
