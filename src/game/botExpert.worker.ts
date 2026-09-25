/** Le fil du bot ★ : il réfléchit à côté, sans figer l'écran de celui qui l'héberge. */
import type { Card } from './cards'
import { type OptionsExpert, type VueExpert, choisirCarteExpert } from './botExpert'

interface Demande {
  id: number
  vue: VueExpert
  permis: Card[]
  options: OptionsExpert
}

const fil = self as unknown as {
  onmessage: ((e: MessageEvent<Demande>) => void) | null
  postMessage: (message: unknown) => void
}

fil.onmessage = (e) => {
  const { id, vue, permis, options } = e.data
  fil.postMessage({ id, carte: choisirCarteExpert(vue, permis, options) })
}
