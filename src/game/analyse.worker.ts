/**
 * L'analyse d'une donne dans un fil à part : le calcul prend quelques secondes, et la
 * page doit rester fluide pendant ce temps.
 */
import { analyserDonne } from './analyse'
import type { DonneRevue } from './revue'
import type { Seating } from './players'

const fil = self as unknown as {
  onmessage: ((e: MessageEvent<{ donne: DonneRevue; seating: Seating }>) => void) | null
  postMessage: (message: unknown) => void
}

fil.onmessage = (e) => {
  fil.postMessage(analyserDonne(e.data.donne, e.data.seating))
}
