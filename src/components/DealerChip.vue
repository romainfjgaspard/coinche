<script setup lang="ts">
/** Le jeton du donneur, comme un jeton de casino : disque rouge cranté de blanc, « D » au centre. */
withDefaults(defineProps<{ size?: number }>(), { size: 18 })
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 40 40"
    role="img"
    aria-label="Donneur"
    class="shrink-0 drop-shadow-[0_1px_1.5px_rgba(0,0,0,.5)]"
  >
    <title>Donneur</title>
    <circle cx="20" cy="20" r="19" fill="#c0392b" />
    <!-- Les crans du bord : huit bandes blanches -->
    <circle
      cx="20"
      cy="20"
      r="16"
      fill="none"
      stroke="#faf9f5"
      stroke-width="6"
      stroke-dasharray="6.28 6.28"
      transform="rotate(-11 20 20)"
    />
    <circle cx="20" cy="20" r="11.5" fill="#faf9f5" stroke="#c0392b" stroke-width="1.5" />
    <text
      x="20"
      y="24.6"
      text-anchor="middle"
      font-family="Outfit, system-ui, sans-serif"
      font-size="13"
      font-weight="800"
      fill="#0f3d2e"
    >
      D
    </text>
  </svg>
</template>
