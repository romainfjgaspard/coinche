/**
 * Géométrie de la table sur grand écran, calculée depuis la taille de la fenêtre.
 *
 * Tout ce qui a une taille (cartes, textes, marges) suit un seul facteur d'échelle
 * `u`, égal à 1 en 1920×1080. Les positions, elles, suivent la largeur et la hauteur
 * réelles : le tapis occupe la place laissée libre par les mains autour de lui.
 * Les tailles fixes en pixels donnaient des cartes minuscules en 2560 et une table
 * qui débordait en 1366×768.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface TableLayout {
  /** Facteur d'échelle : 1 en 1920×1080 */
  u: number
  /** Échelle des textes : comme `u`, mais jamais sous 0,85 — en 1366×768 les libellés tombaient à 8 px */
  t: number
  width: number
  height: number
  header: number
  felt: Box
  /** Épaisseur du rebord de bois */
  rim: number
  /** Ma main : largeur d'une carte, pas entre deux cartes, part visible */
  cardW: number
  cardH: number
  handStep: number
  handVisible: number
  /** Cartes du pli, au centre du tapis */
  trickW: number
  /** Dos des cartes des autres joueurs */
  backW: number
  backStep: number
  /** Centre de la bande entre le tapis et ma main, où se tient ma pastille */
  meY: number
  /** Centre des zones des adversaires, de part et d'autre du tapis */
  sideX: number
  partnerY: number
}

export function tableLayout(width: number, height: number): TableLayout {
  const u = Math.min(width / 1920, height / 1080)
  const t = Math.max(u, 0.85)
  const r = (n: number) => Math.round(n * u)

  const header = Math.round(64 * t)
  const cardW = r(172)
  const cardH = Math.round(cardW * 1.44)
  // La main est coupée par le bas de l'écran, comme tenue en main : on n'en voit que
  // le haut, où sont les index. Le survol la soulève en entier.
  const handVisible = Math.round(cardH * 0.6)
  const backW = r(46)
  const backH = Math.round(backW * 1.44)
  const chip = r(34)
  const gap = r(14)

  const partnerZone = gap + backH + gap + chip + gap
  const meZone = r(60)
  const side = r(180)

  const feltTop = header + partnerZone
  const feltBottom = height - handVisible - meZone
  const felt: Box = { x: side, y: feltTop, w: width - 2 * side, h: feltBottom - feltTop }

  return {
    u,
    t,
    width,
    height,
    header,
    felt,
    rim: r(16),
    cardW,
    cardH,
    handStep: Math.round(cardW * 0.62),
    handVisible,
    trickW: Math.round(cardW * 0.74),
    backW,
    backStep: Math.round(backW * 0.42),
    meY: feltBottom + Math.round(meZone / 2),
    sideX: Math.round(side / 2),
    partnerY: header + gap,
  }
}

/** La géométrie, tenue à jour quand la fenêtre change de taille. */
export function useTableLayout() {
  const w = ref(window.innerWidth)
  const h = ref(window.innerHeight)
  const follow = () => {
    w.value = window.innerWidth
    h.value = window.innerHeight
  }
  onMounted(() => window.addEventListener('resize', follow))
  onUnmounted(() => window.removeEventListener('resize', follow))
  return computed(() => tableLayout(w.value, h.value))
}
