/**
 * L'analyse carte par carte d'une donne, répartie entre plusieurs fils : un par cœur du
 * processeur (un de laissé libre pour la page), dans la limite de six. Les cartes sont
 * distribuées une sur N, pour que chaque fil ait sa part des premières, les plus longues.
 */
import { onBeforeUnmount, ref } from 'vue'
import type { CarteJugee } from '../game/analyseJoueur'
import type { DonneRevue } from '../game/revue'
import type { Seating } from '../game/players'

/** Tirages par carte : assez pour que le jugement ne soit pas du bruit. */
export const ECHANTILLONS = 40

export function useAnalyseCartes() {
  const jugees = ref<CarteJugee[] | null>(null)
  const enCours = ref(false)
  const fait = ref(0)
  const total = ref(0)
  const erreur = ref<string | null>(null)
  let fils: Worker[] = []

  function arreter(): void {
    for (const f of fils) f.terminate()
    fils = []
  }
  onBeforeUnmount(arreter)

  function lancer(donne: DonneRevue, seating: Seating): Promise<CarteJugee[] | null> {
    if (enCours.value) return Promise.resolve(null)
    return new Promise((fini) => {
      arreter()
      enCours.value = true
      erreur.value = null
      jugees.value = null
      const nbCartes = donne.plis.reduce((n, p) => n + p.cartes.length, 0)
      total.value = nbCartes
      fait.value = 0
      const n = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1))
      const resultats: CarteJugee[][] = []
      const avancement = new Array<number>(n).fill(0)
      // Des objets simples : un fil ne reçoit pas les proxys réactifs de Vue.
      const brut = JSON.parse(JSON.stringify({ donne, seating })) as { donne: DonneRevue; seating: Seating }
      for (let i = 0; i < n; i++) {
        const seulement = [...Array(nbCartes).keys()].filter((k) => k % n === i)
        const f = new Worker(new URL('../game/analyseJoueur.worker.ts', import.meta.url), { type: 'module' })
        fils.push(f)
        f.onmessage = (
          e: MessageEvent<{ type: 'progression'; fait: number } | { type: 'fini'; jugees: CarteJugee[] }>,
        ) => {
          if (e.data.type === 'progression') {
            avancement[i] = e.data.fait
            fait.value = avancement.reduce((a, b) => a + b, 0)
            return
          }
          resultats.push(e.data.jugees)
          f.terminate()
          if (resultats.length === n) {
            // Remises dans l'ordre de la donne : pli, puis ordre de pose.
            const ordre = donne.plis.flatMap((p) => p.cartes.map((c) => c.card))
            jugees.value = resultats.flat().sort((a, b) => ordre.indexOf(a.carte) - ordre.indexOf(b.carte))
            enCours.value = false
            fils = []
            fini(jugees.value)
          }
        }
        f.onerror = () => {
          erreur.value = 'L’analyse a échoué.'
          enCours.value = false
          arreter()
          fini(null)
        }
        f.postMessage({ ...brut, echantillons: ECHANTILLONS, graine: 1, seulement })
      }
    })
  }

  return { jugees, enCours, fait, total, erreur, lancer }
}
