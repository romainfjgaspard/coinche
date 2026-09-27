/**
 * La liste des joueurs, au-delà des quatre du départ.
 *
 * Un joueur ajouté ne disparaît jamais : ses statistiques portent son identifiant.
 * Les règles Firestore l'imposent (création seule, jamais de modification).
 */
import { type Timestamp, collection, doc, getDocs, runTransaction, serverTimestamp } from 'firebase/firestore'
import { PLAYER_IDS, PLAYER_NAMES, type PlayerId, playerIdFrom } from '../game/players'
import { type Client, mainClient } from './app'
import { signIn } from './game'

export interface RosterEntry {
  id: PlayerId
  name: string
}

export const NAME_MAX = 20

const playersRef = (c: Client) => collection(c.db, 'players')

/** Les joueurs ajoutés depuis l'accueil, dans l'ordre d'arrivée. */
export async function readRoster(c: Client = mainClient): Promise<RosterEntry[]> {
  await signIn(c)
  const snap = await getDocs(playersRef(c))
  return snap.docs
    .map((d) => {
      const data = d.data() as { name?: string; createdAt?: Timestamp | null }
      return { id: d.id, name: data.name ?? d.id, createdAt: data.createdAt?.toMillis() ?? 0 }
    })
    .filter((j) => !PLAYER_IDS.includes(j.id))
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(({ id, name }) => ({ id, name }))
}

/**
 * Ajoute un joueur ; refuse un nom vide ou trop long. Un nom déjà connu n'est pas
 * recréé : on rend le joueur existant (`existed`), que l'accueil remet simplement
 * dans sa liste — la liste affichée est propre à chaque navigateur.
 */
export async function addPlayer(
  typedName: string,
  c: Client = mainClient,
): Promise<RosterEntry & { existed: boolean }> {
  const name = typedName.trim().replace(/\s+/g, ' ')
  const id = playerIdFrom(name)
  if (!name || !id) throw new Error('Il faut un nom')
  if (name.length > NAME_MAX) throw new Error(`${NAME_MAX} caractères au plus`)
  if (id === 'bot' || id.startsWith('bot-')) throw new Error('Ce nom est réservé aux bots')
  if (PLAYER_IDS.includes(id)) return { id, name: PLAYER_NAMES[id] ?? name, existed: true }
  await signIn(c)
  const ref = doc(c.db, 'players', id)
  return runTransaction(c.db, async (tx) => {
    const already = await tx.get(ref)
    if (already.exists())
      return { id, name: (already.data() as { name?: string }).name ?? name, existed: true }
    tx.set(ref, { name, createdAt: serverTimestamp() })
    return { id, name, existed: false }
  })
}
