/**
 * Les analyses carte par carte, gardées en base : une donne analysée une fois l'est pour
 * les quatre, et pour toujours. Elles prenaient une à deux minutes par partie, et chacun
 * devait les relancer de son côté — à chaque réouverture de la donne.
 *
 * Une analyse par donne, sous la partie : `games/{code}/analyses/{donne}`. La première
 * écrite fait foi ; les règles interdisent de la réécrire.
 */
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { onSnapshot } from './meter'
import { type Client, mainClient } from './app'
import type { JudgedCard } from '../game/cardAnalysis'
import type { PlayerId } from '../game/players'

/**
 * Version de la méthode : tirages, graine, seuils. Une analyse d'une autre version est
 * ignorée, et recalculée si on la redemande.
 */
export const ANALYSIS_VERSION = 1

export const analysesRef = (code: string, c: Client = mainClient) =>
  collection(c.db, 'games', code, 'analyses')

/** Toutes les analyses de la partie, au fil de l'eau : celle d'un autre joueur arrive seule. */
export function watchAnalyses(
  code: string,
  cb: (byDeal: Map<number, JudgedCard[]>) => void,
  c: Client = mainClient,
): () => void {
  return onSnapshot(
    analysesRef(code, c),
    (snap) => {
      const out = new Map<number, JudgedCard[]>()
      for (const d of snap.docs) {
        const data = d.data() as { judged?: JudgedCard[]; version?: number }
        if (data.version === ANALYSIS_VERSION && Array.isArray(data.judged))
          out.set(Number(d.id), data.judged)
      }
      cb(out)
    },
    (e) => console.warn('[analyses]', code, e),
  )
}

/** Garde l'analyse d'une donne. Déjà gardée par un autre joueur : la sienne reste. */
export async function saveAnalysis(
  code: string,
  dealNumber: number,
  judged: JudgedCard[],
  by: PlayerId,
  c: Client = mainClient,
): Promise<void> {
  try {
    await setDoc(doc(analysesRef(code, c), String(dealNumber)), {
      // Des objets simples : Firestore refuse les proxys réactifs de Vue.
      judged: JSON.parse(JSON.stringify(judged)) as JudgedCard[],
      version: ANALYSIS_VERSION,
      by,
      at: serverTimestamp(),
    })
  } catch (e) {
    // Course perdue : la même analyse, calculée ailleurs en même temps, est déjà là.
    console.info('[analyses] déjà gardée', code, dealNumber, e)
  }
}
