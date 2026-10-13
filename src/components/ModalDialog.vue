<script setup lang="ts">
/**
 * La fenêtre de l'app, la même partout : un voile sombre, un cadre arrondi, un titre,
 * et — si elle se ferme — une croix en haut à droite, le clic à côté et Échap. Chaque
 * fenêtre avait ses habitudes : ici une croix, là un clic à côté, ailleurs un bouton.
 */
import { onBeforeUnmount, onMounted, useId } from 'vue'

const props = withDefaults(
  defineProps<{
    title?: string
    /** Faux : la fenêtre attend une réponse, ni croix ni clic à côté. */
    closable?: boolean
    /** Largeur du cadre : `sm` pour une question, `md` pour un contenu, `lg` sur PC. */
    size?: 'sm' | 'md' | 'lg'
  }>(),
  { title: undefined, closable: true, size: 'sm' },
)
const emit = defineEmits<{ close: [] }>()
const titleId = useId()

const close = () => {
  if (props.closable) emit('close')
}
const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape') close()
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-3 py-4"
      @click.self="close"
    >
      <div
        role="dialog"
        aria-modal="true"
        :aria-labelledby="title ? titleId : undefined"
        class="flex max-h-full w-full flex-col rounded-2xl border border-white/10 bg-felt-dark text-ivory shadow-2xl"
        :class="size === 'sm' ? 'max-w-sm' : size === 'md' ? 'max-w-md' : 'max-w-md lg:max-w-2xl'"
      >
        <div v-if="title || closable || $slots.header" class="flex items-center gap-3 pt-4 pr-3 pl-5">
          <h2 v-if="title" :id="titleId" class="grow font-display text-2xl leading-none">{{ title }}</h2>
          <span v-else class="grow"></span>
          <slot name="header" />
          <button
            v-if="closable"
            type="button"
            class="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-lg text-sage transition hover:bg-white/10 hover:text-ivory"
            aria-label="Fermer"
            title="Fermer"
            @click="close"
          >
            ✕
          </button>
        </div>
        <div class="min-h-0 overflow-y-auto px-5 pt-3 pb-5">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>
