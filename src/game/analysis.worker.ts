/**
 * L'analyse d'une donne dans un fil à part : le calcul prend quelques secondes, et la
 * page doit rester fluide pendant ce temps.
 */
import { analyzeDeal } from './analysis'
import type { ReviewedDeal } from './review'
import type { Seating } from './players'

const worker = self as unknown as {
  onmessage: ((e: MessageEvent<{ deal: ReviewedDeal; seating: Seating }>) => void) | null
  postMessage: (message: unknown) => void
}

worker.onmessage = (e) => {
  worker.postMessage(analyzeDeal(e.data.deal, e.data.seating))
}
