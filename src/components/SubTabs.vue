<script setup lang="ts">
/** Les sous-onglets des statistiques : une page par thème, plutôt qu'un long défilement. */
defineProps<{ options: readonly { id: string; label: string }[]; modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [id: string] }>()
</script>

<template>
  <div class="flex gap-1 overflow-x-auto rounded-xl bg-black/25 p-1 [scrollbar-width:none]">
    <button
      v-for="o in options"
      :key="o.id"
      type="button"
      class="h-10 shrink-0 grow cursor-pointer rounded-lg px-2 text-[14.5px] font-semibold whitespace-nowrap transition max-[380px]:px-1 max-[380px]:text-[14px] lg:h-8 lg:px-3 lg:text-[13px]"
      :class="modelValue === o.id ? 'bg-gold text-felt' : 'text-mist hover:bg-white/5'"
      @click="emit('update:modelValue', o.id)"
    >
      {{ o.label }}
    </button>
  </div>
</template>
