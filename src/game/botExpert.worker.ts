/** Le fil du bot ★ : il réfléchit à côté, sans figer l'écran de celui qui l'héberge. */
import type { Card } from './cards'
import { type ExpertOptions, type ExpertView, chooseExpertCard } from './botExpert'

interface Request {
  id: number
  view: ExpertView
  legal: Card[]
  options: ExpertOptions
}

const worker = self as unknown as {
  onmessage: ((e: MessageEvent<Request>) => void) | null
  postMessage: (message: unknown) => void
}

worker.onmessage = (e) => {
  const { id, view, legal, options } = e.data
  worker.postMessage({ id, card: chooseExpertCard(view, legal, options) })
}
