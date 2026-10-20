/**
 * Les tables nommées : un lien fixe, le même chaque semaine (`…/coinche/?table=potes`).
 *
 * Un code ne sert qu'à une partie — une partie finie ne se rouvre pas. La table, elle,
 * retient la partie en cours (`tables/{nom}` : `{ current }`) : son lien y mène toujours,
 * et pointe sur la suivante dès qu'on la crée (depuis l'accueil, ou par « Rejouer »).
 */
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { getDoc } from './meter'
import { type Client, mainClient } from './app'

/** Un nom de table : minuscules, chiffres et tirets, comme dans une adresse. */
export const TABLE_NAME = /^[a-z0-9-]{2,30}$/

/** Le nom de table de l'adresse (`?table=potes`), s'il y en a un de valable. */
export function tableFromAddress(): string | null {
  try {
    const t = new URLSearchParams(location.search).get('table')?.trim().toLowerCase() ?? ''
    return TABLE_NAME.test(t) ? t : null
  } catch {
    return null
  }
}

const tableRef = (name: string, c: Client) => doc(c.db, 'tables', name)

/** La partie en cours de la table, ou null si la table n'a encore jamais servi. */
export async function readTable(name: string, c: Client = mainClient): Promise<string | null> {
  const snap = await getDoc(tableRef(name, c))
  return snap.exists() ? ((snap.data() as { current?: string }).current ?? null) : null
}

/**
 * La table pointe sur une nouvelle partie. Les règles ne l'acceptent que de son créateur,
 * et seulement pour une partie encore au salon : on ne détourne pas la table d'une partie
 * en cours.
 */
export async function pointTable(name: string, code: string, c: Client = mainClient): Promise<void> {
  await setDoc(tableRef(name, c), { current: code, updatedAt: serverTimestamp() })
}
