<script setup lang="ts">
/**
 * Des interrupteurs indépendants : avec ou sans bot, l'objectif de la partie (500, 1000…),
 * normale ou blitz.
 */
import { useArchiveFilter } from '../composables/useArchiveFilter'

const {
  withBots,
  withoutBots,
  countWithBots,
  countWithoutBots,
  targets,
  hiddenTargets,
  toggleTarget,
  withNormal,
  withBlitz,
  countNormal,
  countBlitz,
} = useArchiveFilter()
const CHIP =
  'flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] lg:text-[11px] font-semibold transition'
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
    <!-- Un objectif seul ne se filtre pas : la puce n'apprendrait rien -->
    <template v-if="targets.length > 1">
      <button
        v-for="t in targets"
        :key="t.target"
        type="button"
        :class="[CHIP, chipClass(!hiddenTargets.includes(t.target))]"
        :aria-pressed="!hiddenTargets.includes(t.target)"
        @click="toggleTarget(t.target)"
      >
        <span>{{ hiddenTargets.includes(t.target) ? '○' : '✓' }}</span> en {{ t.target }} · {{ t.count }}
      </button>
    </template>
    <template v-if="countBlitz > 0">
      <button
        type="button"
        :class="[CHIP, chipClass(withNormal)]"
        :aria-pressed="withNormal"
        @click="withNormal = !withNormal"
      >
        <span>{{ withNormal ? '✓' : '○' }}</span> normale · {{ countNormal }}
      </button>
      <button
        type="button"
        :class="[CHIP, chipClass(withBlitz)]"
        :aria-pressed="withBlitz"
        @click="withBlitz = !withBlitz"
      >
        <span>{{ withBlitz ? '✓' : '○' }}</span> blitz · {{ countBlitz }}
      </button>
    </template>
  </div>
</template>
