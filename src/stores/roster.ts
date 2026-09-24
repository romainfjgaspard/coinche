/**
 * Les joueurs connus : les quatre du départ, puis ceux ajoutés depuis l'accueil.
 *
 * Les noms vivent dans un objet réactif au niveau du module : `nomDe` s'utilise
 * partout (gabarits, calculs) et se met à jour dès que la liste est chargée.
 */
import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import { PLAYER_IDS, PLAYER_NAMES, type PlayerId } from '../game/players'
import { type RosterEntry, addPlayer, readRoster } from '../firebase/joueurs'

const noms = reactive<Record<PlayerId, string>>({ ...PLAYER_NAMES })

/** Le nom affiché d'un joueur ; son identifiant, à défaut, s'il n'est pas encore chargé. */
export const nomDe = (p: PlayerId): string => noms[p] ?? p.charAt(0).toUpperCase() + p.slice(1)

export const useRoster = defineStore('roster', () => {
  const ajoutes = ref<RosterEntry[]>([])
  const erreur = ref<string | null>(null)
  const occupe = ref(false)

  /** Tous les joueurs, les quatre du départ en tête. */
  const joueurs = computed<PlayerId[]>(() => [...PLAYER_IDS, ...ajoutes.value.map((j) => j.id)])

  async function charger(): Promise<void> {
    try {
      ajoutes.value = await readRoster()
      for (const j of ajoutes.value) noms[j.id] = j.nom
    } catch {
      // Hors ligne ou base injoignable : les quatre du départ suffisent pour jouer.
    }
  }

  async function ajouter(nom: string): Promise<PlayerId | null> {
    occupe.value = true
    erreur.value = null
    try {
      const j = await addPlayer(nom)
      noms[j.id] = j.nom
      ajoutes.value = [...ajoutes.value, j]
      return j.id
    } catch (e) {
      erreur.value = e instanceof Error ? e.message : String(e)
      return null
    } finally {
      occupe.value = false
    }
  }

  return { joueurs, erreur, occupe, charger, ajouter }
})
