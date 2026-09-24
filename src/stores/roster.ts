/**
 * Les joueurs connus : les quatre du départ, puis ceux ajoutés depuis l'accueil.
 *
 * Deux choses bien distinctes :
 * - **les noms**, lus en base pour tous : ils servent partout à l'affichage, y compris
 *   dans les statistiques. La base ne fait que s'allonger, on n'y efface jamais rien ;
 * - **la liste de l'accueil**, propre à ce navigateur : on y retire un nom d'une croix,
 *   ce qui le masque ici seulement. Ses parties et ses statistiques restent en base.
 *
 * Les noms vivent dans un objet réactif au niveau du module : `nomDe` s'utilise
 * partout (gabarits, calculs) et se met à jour dès que la liste est chargée.
 */
import { reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import { PLAYER_IDS, PLAYER_NAMES, type PlayerId, estBotId } from '../game/players'
import { addPlayer, readRoster } from '../firebase/joueurs'

const noms = reactive<Record<PlayerId, string>>({ ...PLAYER_NAMES })

/** Le nom affiché d'un joueur ; son identifiant, à défaut, s'il n'est pas encore chargé. */
export const nomDe = (p: PlayerId): string => {
  if (estBotId(p)) {
    // « Bot », « Bot ★ », puis « Bot 2 » si deux bots du même niveau sont à la table.
    const [, niveau, n] = p.split('-')
    return `Bot${niveau === 'etoile' ? ' ★' : ''}${n && n !== '1' ? ` ${n}` : ''}`
  }
  return noms[p] ?? p.charAt(0).toUpperCase() + p.slice(1)
}

const LISTE_KEY = 'coinche.joueurs'
const SESSION_KEY = 'coinche.session'

/**
 * La liste de l'accueil de ce navigateur. La première fois : les quatre du départ, et
 * le joueur qu'on était la dernière fois — sinon il aurait disparu de son propre accueil.
 */
function lireListe(): PlayerId[] {
  try {
    const brut = localStorage.getItem(LISTE_KEY)
    if (brut) return JSON.parse(brut) as PlayerId[]
    const moi = (JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as { playerId?: PlayerId } | null)?.playerId
    return moi && !PLAYER_IDS.includes(moi) ? [...PLAYER_IDS, moi] : [...PLAYER_IDS]
  } catch {
    return [...PLAYER_IDS]
  }
}

function ecrireListe(liste: PlayerId[]): void {
  try {
    localStorage.setItem(LISTE_KEY, JSON.stringify(liste))
  } catch {
    // Sans stockage, la liste vaut pour la visite en cours.
  }
}

export const useRoster = defineStore('roster', () => {
  /** Les joueurs affichés sur l'accueil de ce navigateur, dans l'ordre. */
  const joueurs = ref<PlayerId[]>(lireListe())
  const erreur = ref<string | null>(null)
  /** Un nom déjà connu, remis dans la liste : on le dit, ce n'est pas une erreur. */
  const info = ref<string | null>(null)
  const occupe = ref(false)

  /** Les noms de tous les joueurs de la base, pour l'affichage. */
  async function charger(): Promise<void> {
    try {
      for (const j of await readRoster()) noms[j.id] = j.nom
    } catch {
      // Hors ligne ou base injoignable : les quatre du départ suffisent pour jouer.
    }
  }

  function montrer(p: PlayerId): void {
    if (joueurs.value.includes(p)) return
    joueurs.value = [...joueurs.value, p]
    ecrireListe(joueurs.value)
  }

  /** Retire un nom de l'accueil de ce navigateur. Rien n'est touché en base. */
  function masquer(p: PlayerId): void {
    joueurs.value = joueurs.value.filter((x) => x !== p)
    ecrireListe(joueurs.value)
  }

  /**
   * Ajoute un nom à l'accueil. Nouveau, il est créé en base ; déjà connu (un autre
   * téléphone, ou masqué d'ici), il est simplement remis dans la liste.
   */
  async function ajouter(nom: string): Promise<PlayerId | null> {
    occupe.value = true
    erreur.value = null
    info.value = null
    try {
      const j = await addPlayer(nom)
      noms[j.id] = j.nom
      const dejaLa = joueurs.value.includes(j.id)
      montrer(j.id)
      if (j.existait) {
        info.value = dejaLa
          ? `${j.nom} est déjà dans ta liste.`
          : `${j.nom} existe déjà : le voici de retour dans ta liste. Si tu es un autre ${j.nom}, prends un autre nom (${j.nom} B., par exemple).`
      }
      return j.id
    } catch (e) {
      erreur.value = e instanceof Error ? e.message : String(e)
      return null
    } finally {
      occupe.value = false
    }
  }

  return { joueurs, erreur, info, occupe, charger, ajouter, masquer, montrer }
})
