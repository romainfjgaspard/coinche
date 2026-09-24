/**
 * La liste des joueurs, au-delà des quatre du départ.
 *
 * Un joueur ajouté ne disparaît jamais : ses statistiques portent son identifiant.
 * Les règles Firestore l'imposent (création seule, jamais de modification).
 */
import { type Timestamp, collection, doc, getDocs, runTransaction, serverTimestamp } from 'firebase/firestore'
import { PLAYER_IDS, type PlayerId, playerIdFrom } from '../game/players'
import { type Client, mainClient } from './app'
import { signIn } from './partie'

export interface RosterEntry {
  id: PlayerId
  nom: string
}

export const NOM_MAX = 20

const joueursRef = (c: Client) => collection(c.db, 'joueurs')

/** Les joueurs ajoutés depuis l'accueil, dans l'ordre d'arrivée. */
export async function readRoster(c: Client = mainClient): Promise<RosterEntry[]> {
  await signIn(c)
  const snap = await getDocs(joueursRef(c))
  return snap.docs
    .map((d) => {
      const data = d.data() as { nom?: string; creeLe?: Timestamp | null }
      return { id: d.id, nom: data.nom ?? d.id, creeLe: data.creeLe?.toMillis() ?? 0 }
    })
    .filter((j) => !PLAYER_IDS.includes(j.id))
    .sort((a, b) => a.creeLe - b.creeLe)
    .map(({ id, nom }) => ({ id, nom }))
}

/** Ajoute un joueur ; refuse un nom vide, trop long ou déjà pris. */
export async function addPlayer(nomSaisi: string, c: Client = mainClient): Promise<RosterEntry> {
  const nom = nomSaisi.trim().replace(/\s+/g, ' ')
  const id = playerIdFrom(nom)
  if (!nom || !id) throw new Error('Il faut un nom')
  if (nom.length > NOM_MAX) throw new Error(`${NOM_MAX} caractères au plus`)
  if (PLAYER_IDS.includes(id)) throw new Error(`${nom} existe déjà`)
  await signIn(c)
  const ref = doc(c.db, 'joueurs', id)
  await runTransaction(c.db, async (tx) => {
    if ((await tx.get(ref)).exists()) throw new Error(`${nom} existe déjà`)
    tx.set(ref, { nom, creeLe: serverTimestamp() })
  })
  return { id, nom }
}
