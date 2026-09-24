/**
 * La liste des joueurs, au-delà des quatre du départ.
 *
 * Un joueur ajouté ne disparaît jamais : ses statistiques portent son identifiant.
 * Les règles Firestore l'imposent (création seule, jamais de modification).
 */
import { type Timestamp, collection, doc, getDocs, runTransaction, serverTimestamp } from 'firebase/firestore'
import { PLAYER_IDS, PLAYER_NAMES, type PlayerId, playerIdFrom } from '../game/players'
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

/**
 * Ajoute un joueur ; refuse un nom vide ou trop long. Un nom déjà connu n'est pas
 * recréé : on rend le joueur existant (`existait`), que l'accueil remet simplement
 * dans sa liste — la liste affichée est propre à chaque navigateur.
 */
export async function addPlayer(
  nomSaisi: string,
  c: Client = mainClient,
): Promise<RosterEntry & { existait: boolean }> {
  const nom = nomSaisi.trim().replace(/\s+/g, ' ')
  const id = playerIdFrom(nom)
  if (!nom || !id) throw new Error('Il faut un nom')
  if (nom.length > NOM_MAX) throw new Error(`${NOM_MAX} caractères au plus`)
  if (id === 'bot' || id.startsWith('bot-')) throw new Error('Ce nom est réservé aux bots')
  if (PLAYER_IDS.includes(id)) return { id, nom: PLAYER_NAMES[id] ?? nom, existait: true }
  await signIn(c)
  const ref = doc(c.db, 'joueurs', id)
  return runTransaction(c.db, async (tx) => {
    const deja = await tx.get(ref)
    if (deja.exists()) return { id, nom: (deja.data() as { nom?: string }).nom ?? nom, existait: true }
    tx.set(ref, { nom, creeLe: serverTimestamp() })
    return { id, nom, existait: false }
  })
}
