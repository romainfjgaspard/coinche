/**
 * Le compteur de lectures Firestore, pour comprendre la facture.
 *
 * Firestore facture chaque document renvoyé par le serveur : une requête de 600
 * événements coûte 600 lectures, une écoute coûte tous ses documents à l'ouverture puis
 * un par document changé. Ce module enveloppe les fonctions de lecture et range ce qu'elles
 * coûtent par fonction appelante. Actif seulement avec `?mesure` dans l'adresse : le
 * relevé est dans `window.__reads`.
 *
 * Né du 13/10/2026 : 85 000 lectures dans la soirée, quota gratuit épuisé en pleine partie.
 */
import {
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type Query,
  type QuerySnapshot,
  type Transaction,
  getDoc as rawGetDoc,
  getDocs as rawGetDocs,
  onSnapshot as rawOnSnapshot,
  runTransaction as rawRunTransaction,
} from 'firebase/firestore'

const enabled =
  typeof window !== 'undefined' && new URLSearchParams(window.location?.search ?? '').has('mesure')

const reads: Record<string, number> = {}
if (enabled) (window as unknown as { __reads: Record<string, number> }).__reads = reads

/** La fonction de l'app qui a demandé la lecture : le premier appelant hors de ce module. */
function site(kind: string): string {
  const frames = (new Error().stack ?? '').split('\n').slice(1)
  for (const f of frames) {
    if (f.includes('meter.ts') || f.includes('node_modules')) continue
    const name = f.trim().replace(/^at /, '').split(' ')[0].split('@')[0]
    if (name && !name.startsWith('http') && !name.startsWith('async')) return `${kind} ← ${name}`
  }
  return kind
}

function count(label: string, n: number): void {
  if (!enabled) return
  reads[label] = (reads[label] ?? 0) + n
}

export async function getDoc<T>(ref: DocumentReference<T>): Promise<DocumentSnapshot<T>> {
  const label = enabled ? site('getDoc') : ''
  const snap = await rawGetDoc(ref)
  count(label, 1)
  return snap
}

export async function getDocs<T>(q: Query<T>): Promise<QuerySnapshot<T>> {
  const label = enabled ? site('getDocs') : ''
  const snap = await rawGetDocs(q)
  // Une requête vide coûte quand même une lecture.
  count(label, Math.max(1, snap.size))
  return snap
}

export function runTransaction<T>(db: Firestore, update: (tx: Transaction) => Promise<T>): Promise<T> {
  const label = enabled ? site('transaction') : ''
  return rawRunTransaction(db, (tx) => {
    if (!enabled) return update(tx)
    const get = tx.get.bind(tx)
    const counted = Object.create(tx) as Transaction
    counted.get = (async (ref: DocumentReference) => {
      count(label, 1)
      return get(ref)
    }) as Transaction['get']
    return update(counted)
  })
}

type Unsubscribe = () => void

/** Une écoute : tous ses documents à l'ouverture, puis un par document changé côté serveur. */
export function onSnapshot<T>(
  ref: DocumentReference<T>,
  next: (snap: DocumentSnapshot<T>) => void,
  error?: (e: Error) => void,
): Unsubscribe
export function onSnapshot<T>(
  query: Query<T>,
  next: (snap: QuerySnapshot<T>) => void,
  error?: (e: Error) => void,
): Unsubscribe
export function onSnapshot<T>(
  target: Query<T> | DocumentReference<T>,
  next: ((snap: DocumentSnapshot<T>) => void) | ((snap: QuerySnapshot<T>) => void),
  error?: (e: Error) => void,
): Unsubscribe {
  const label = enabled ? site('écoute') : ''
  const wrapped = (snap: QuerySnapshot<T> | DocumentSnapshot<T>) => {
    if (enabled && !snap.metadata.fromCache) {
      if ('docChanges' in snap) count(label, snap.docChanges().length)
      else if (!snap.metadata.hasPendingWrites) count(label, 1)
    }
    ;(next as (s: QuerySnapshot<T> | DocumentSnapshot<T>) => void)(snap)
  }
  return rawOnSnapshot(target as Query<T>, wrapped as (s: QuerySnapshot<T>) => void, error)
}
