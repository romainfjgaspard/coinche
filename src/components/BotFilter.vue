<script setup lang="ts">
/** Deux interrupteurs indépendants : les parties avec bot, les parties sans bot. */
import { useArchiveFilter } from '../composables/useArchiveFilter'

const { withBots, withoutBots, countWithBots, countWithoutBots } = useArchiveFilter()
const chipClass = (on: boolean): string =>
  on ? 'border-gold bg-gold/20 text-gold' : 'border-white/15 text-sage hover:border-white/35'
</script>

<template>
  <div class="flex flex-wrap gap-1.5">
    <button
      type="button"
      class="flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] lg:text-[11px] font-semibold transition"
      :class="chipClass(withoutBots)"
      :aria-pressed="withoutBots"
      @click="withoutBots = !withoutBots"
    >
      <span>{{ withoutBots ? '✓' : '○' }}</span> sans bot · {{ countWithoutBots }}
    </button>
    <button
      type="button"
      class="flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] lg:text-[11px] font-semibold transition"
      :class="chipClass(withBots)"
      :aria-pressed="withBots"
      @click="withBots = !withBots"
    >
      <span>{{ withBots ? '✓' : '○' }}</span> avec bot · {{ countWithBots }}
    </button>
  </div>
</template>
