<script setup lang="ts">
/** Dos de carte : treillis rouge bordé d'ivoire, comme un vrai jeu. */
import { computed } from 'vue'

const props = withDefaults(defineProps<{ width?: number; rotated?: boolean }>(), {
  width: 26, rotated: false,
})

const size = computed(() => {
  const w = props.width
  const h = Math.round(w * 1.44)
  return props.rotated ? { width: `${h}px`, height: `${w}px` } : { width: `${w}px`, height: `${h}px` }
})
</script>

<template>
  <span
    class="block shrink-0 rounded border border-[#f2ece0] shadow-[0_2px_4px_rgba(0,0,0,.45)]"
    :style="{
      ...size,
      backgroundColor: '#8c2b2f',
      backgroundImage:
        'repeating-linear-gradient(45deg, rgba(255,255,255,.17) 0 2px, transparent 2px 5px),' +
        'repeating-linear-gradient(-45deg, rgba(255,255,255,.17) 0 2px, transparent 2px 5px)',
    }"
  ></span>
</template>
