/**
 * Précharge et décode les douze figures au démarrage.
 *
 * Sans ça, une figure posée sur le tapis restait blanche un instant : le navigateur
 * ne décodait le SVG qu'au moment où la carte apparaissait.
 */
import { DECK } from '../game/cards'
import { courtImage } from '../game/display'

/** Gardées en mémoire : une image libérée serait à redécoder. */
const decoded: HTMLImageElement[] = []

export function preloadCourtImages(): void {
  for (const card of DECK) {
    const src = courtImage(card)
    if (!src) continue
    const img = new Image()
    img.src = src
    // Un échec de préchargement n'empêche rien : la carte se chargera à l'affichage.
    img.decode().catch(() => {})
    decoded.push(img)
  }
}
