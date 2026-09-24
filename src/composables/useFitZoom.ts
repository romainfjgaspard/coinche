/**
 * Un `zoom` qui met un bloc à l'échelle de l'écran sans jamais le faire déborder.
 *
 * On part d'une échelle de base, puis on la réduit si la hauteur naturelle du bloc
 * (mesurée en continu) dépasse la place disponible. Sert au salon, à l'accueil et au
 * panneau d'enchères, dont la hauteur varie avec leur contenu.
 */
import { type ComputedRef, type Ref, computed, onMounted, onUnmounted, ref } from 'vue'

export function useFitZoom(
  target: Ref<HTMLElement | null>,
  base: ComputedRef<number>,
  room: ComputedRef<number>,
): ComputedRef<number> {
  const naturalHeight = ref(0)
  // Arrondi au centième : un zoom continu relançait sans fin la mesure (voir plus bas).
  const zoom = computed(() => {
    const z = naturalHeight.value ? Math.min(base.value, room.value / naturalHeight.value) : base.value
    return Math.round(z * 100) / 100
  })
  let observer: ResizeObserver | null = null
  onMounted(() => {
    if (!target.value) return
    // La hauteur mesurée est déjà zoomée : on la ramène à l'échelle 1. Les arrondis au
    // pixel la font varier d'un rien à chaque zoom ; sans ce seuil, zoom et mesure se
    // relançaient l'un l'autre et le bloc tremblait en continu.
    observer = new ResizeObserver(() => {
      if (!target.value) return
      const h = target.value.getBoundingClientRect().height / zoom.value
      if (Math.abs(h - naturalHeight.value) > 2) naturalHeight.value = h
    })
    observer.observe(target.value)
  })
  onUnmounted(() => observer?.disconnect())
  return zoom
}
