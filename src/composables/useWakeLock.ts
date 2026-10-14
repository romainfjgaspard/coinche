/**
 * L'écran reste allumé pendant la partie, comme dans une vraie appli de cartes.
 *
 * Entre deux tours, le téléphone se mettait en veille ; au réveil, le navigateur avait
 * souvent coupé la connexion, voire rechargé la page — de l'attente, et des lectures
 * Firestore en plus. L'API Screen Wake Lock (Chrome Android, Safari iOS 16.4+) garde
 * l'écran allumé tant que la page est au premier plan. Le navigateur relâche le verrou
 * dès qu'on change d'appli ou d'onglet : on le reprend au retour.
 *
 * Sans l'API (vieux navigateur, PC), rien ne change.
 */
import { type Ref, onBeforeUnmount, watch } from 'vue'

export function useWakeLock(active: Ref<boolean>): void {
  let sentinel: WakeLockSentinel | null = null

  async function acquire(): Promise<void> {
    if (!active.value || sentinel || document.visibilityState !== 'visible') return
    if (!('wakeLock' in navigator)) return
    try {
      sentinel = await navigator.wakeLock.request('screen')
      sentinel.addEventListener('release', () => (sentinel = null))
    } catch {
      // Refusé (économie d'énergie, onglet en arrière-plan) : l'écran se mettra en veille.
      sentinel = null
    }
  }
  function release(): void {
    void sentinel?.release().catch(() => {})
    sentinel = null
  }

  const onVisible = () => {
    if (document.visibilityState === 'visible') void acquire()
  }
  document.addEventListener('visibilitychange', onVisible)
  watch(active, (on) => (on ? void acquire() : release()), { immediate: true })

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisible)
    release()
  })
}
