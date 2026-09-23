/**
 * Initialisation Firebase.
 *
 * Sans `.env.local`, on bascule automatiquement sur le projet bidon `demo-coinche`
 * et sur les émulateurs : l'app tourne alors en local, sans compte ni clé.
 * Avec les clés renseignées, on parle au vrai projet.
 */
import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'

const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID

/** Vrai tant que les clés du projet Firebase ne sont pas renseignées. */
export const useEmulators = !projectId

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
