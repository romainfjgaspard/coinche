/**
 * Vrai sur grand écran (≥ 1024 px).
 *
 * Les tailles de cartes sont des nombres passés en propriété, pas des classes :
 * elles ne peuvent donc pas suivre un point de rupture CSS. Cette valeur réactive
 * permet de les adapter sans dupliquer la table.
 */
import { onUnmounted, ref } from 'vue'

export const GRAND_ECRAN = '(min-width: 1024px)'

export function useLargeScreen() {
  const media = window.matchMedia(GRAND_ECRAN)
  const grand = ref(media.matches)
  const suivre = (e: MediaQueryListEvent) => { grand.value = e.matches }
  media.addEventListener('change', suivre)
  onUnmounted(() => media.removeEventListener('change', suivre))
  return grand
}
