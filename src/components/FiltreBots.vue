<script setup lang="ts">
/** Deux interrupteurs indépendants : les parties avec bot, les parties sans bot. */
import { useFiltreArchives } from '../composables/useFiltreArchives'

const { avecBot, sansBot, nbAvecBot, nbSansBot } = useFiltreArchives()
const puce = (actif: boolean): string =>
  actif ? 'border-gold bg-gold/20 text-gold' : 'border-white/15 text-sage hover:border-white/35'
</script>

<template>
  <div class="flex flex-wrap gap-1.5">
    <button
      type="button"
      class="flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition"
      :class="puce(sansBot)"
      :aria-pressed="sansBot"
      @click="sansBot = !sansBot"
    >
      <span>{{ sansBot ? '✓' : '○' }}</span> sans bot · {{ nbSansBot }}
    </button>
    <button
      type="button"
      class="flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition"
      :class="puce(avecBot)"
      :aria-pressed="avecBot"
      @click="avecBot = !avecBot"
    >
      <span>{{ avecBot ? '✓' : '○' }}</span> avec bot · {{ nbAvecBot }}
    </button>
  </div>
</template>
