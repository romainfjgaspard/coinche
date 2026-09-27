/**
 * Initialisation Firebase.
 *
 * Sans `.env.local`, on bascule automatiquement sur le projet bidon `demo-coinche`
 * et sur les émulateurs : l'app tourne alors en local, sans compte ni clé.
 * Avec les clés renseignées, on parle au vrai projet.
 */
import { type FirebaseApp, initializeApp } from 'firebase/app'
import { type Auth, connectAuthEmulator, getAuth, inMemoryPersistence, setPersistence } from 'firebase/auth'
import { type Firestore, connectFirestoreEmulator, getFirestore } from 'firebase/firestore'

const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID

/**
 * Vrai si l'app doit parler aux émulateurs plutôt qu'au vrai projet.
 *
 * Par défaut c'est l'absence de clés qui décide. Mais une fois `.env.local` rempli,
 * `npm run dev` parle au **vrai** projet — et les tests, qui jouent des dizaines de
 * parties, y écriraient pour de bon. D'où `npm run dev:emu`, qui force les
 * émulateurs quelles que soient les clés présentes.
 */
export const useEmulators =
  import.meta.env.VITE_USE_EMULATORS === '1' ||
  // `npm run dev:emu` (vite --mode emu)
  import.meta.env.MODE === 'emu' ||
  !projectId ||
  // Vitest charge `.env.local` : sans cette garde, `tests/flow.test.ts` jouait ses
  // parties et déposait ses archives dans la vraie base.
  import.meta.env.MODE === 'test'

const config = useEmulators
  ? { projectId: 'demo-coinche', apiKey: 'demo', authDomain: 'demo-coinche.firebaseapp.com' }
  : {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    }

export const app = initializeApp(config)
export const auth = getAuth(app)
export const db = getFirestore(app)

if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
}

/** Un client Firebase complet : une application, une session, une base. */
export interface Client {
  app: FirebaseApp
  auth: Auth
  db: Firestore
}

/** Le client de l'onglet : c'est celui du joueur humain. */
export const mainClient: Client = { app, auth, db }

/**
 * Un client indépendant, avec sa **propre** session anonyme.
 *
 * C'est ce qui permet à un bot de tenir un siège sans emprunter l'identité de
 * l'onglet : il obtient son propre uid, donc les règles Firestore lui interdisent
 * de lire la main des autres — exactement comme à nous. La persistance est en
 * mémoire, sinon Firebase lui rendrait la session déjà stockée pour cette origine
 * et le bot se retrouverait à être le joueur humain.
 */
export async function makeClient(name: string): Promise<Client> {
  const a = initializeApp(config, name)
  const botAuth = getAuth(a)
  await setPersistence(botAuth, inMemoryPersistence)
  const d = getFirestore(a)
  if (useEmulators) {
    connectAuthEmulator(botAuth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(d, '127.0.0.1', 8080)
  }
  return { app: a, auth: botAuth, db: d }
}
