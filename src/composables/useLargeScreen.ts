/**
 * Vrai sur grand écran (≥ 1024 px).
 *
 * Les tailles de cartes sont des nombres passés en propriété, pas des classes :
 * elles ne peuvent donc pas suivre un point de rupture CSS. Cette valeur réactive
 * permet de les adapter sans dupliquer la table.
 */
import { onUnmounted, ref } from 'vue'

export const LARGE_SCREEN = '(min-width: 1024px)'

export function useLargeScreen() {
  const media = window.matchMedia(LARGE_SCREEN)
  const large = ref(media.matches)
  const follow = (e: MediaQueryListEvent) => {
    large.value = e.matches
  }
  media.addEventListener('change', follow)
  onUnmounted(() => media.removeEventListener('change', follow))
  return large
}
