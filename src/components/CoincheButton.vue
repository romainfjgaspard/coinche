<script setup lang="ts">
/**
 * CO-3 : la coinche se prend à la volée, sans attendre son tour. Sur PC le bouton vit
 * hors du panneau d'enchères, à côté de ma pastille : dans le panneau, il se perdait
 * au milieu des paliers et on ne le voyait plus quand ce n'était pas à soi de parler.
 */
import { useSession } from '../stores/session'

/** Sans légende : entre le tapis et ma main, la place ne tient que le bouton. */
defineProps<{ compact?: boolean }>()
const session = useSession()
</script>

<template>
  <div v-if="session.mayCoinche || session.maySurcoinche" class="flex flex-col items-center gap-1">
    <button
      type="button"
      class="h-11 cursor-pointer rounded-xl bg-red-card px-6 text-[15px] font-bold text-ivory shadow-[0_6px_18px_rgba(0,0,0,.45)] transition hover:brightness-110"
      :title="`${session.mayCoinche ? 'Le contrat adverse compte double' : 'Le contrat compte quadruple'} — à tout moment, sans attendre son tour`"
      @click="session.playerId && session.bid({ kind: session.mayCoinche ? 'coinche' : 'surcoinche', player: session.playerId })"
    >{{ session.mayCoinche ? 'Coincher ×2' : 'Surcoincher ×4' }}</button>
    <span v-if="!compact" class="text-[11px] text-sage">à tout moment, sans attendre son tour</span>
  </div>
</template>
