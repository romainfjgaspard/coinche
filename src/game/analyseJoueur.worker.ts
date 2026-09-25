/**
 * Un fil de l'analyse carte par carte : il juge les cartes qu'on lui confie et dit où il
 * en est. Plusieurs fils se partagent une donne (voir `useAnalyseCartes`).
 */
import { analyserCartes } from './analyseJoueur'
import type { DonneRevue } from './revue'
import type { Seating } from './players'

interface Demande {
  donne: DonneRevue
  seating: Seating
  echantillons: number
  graine: number
  seulement: number[]
}

const fil = self as unknown as {
  onmessage: ((e: MessageEvent<Demande>) => void) | null
  postMessage: (message: unknown) => void
}

fil.onmessage = (e) => {
  const { donne, seating, echantillons, graine, seulement } = e.data
  const jugees = analyserCartes(donne, seating, {
    echantillons,
    graine,
    seulement,
    progression: (fait) => fil.postMessage({ type: 'progression', fait }),
  })
  fil.postMessage({ type: 'fini', jugees })
}
