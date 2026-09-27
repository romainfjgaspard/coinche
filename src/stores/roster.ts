/**
 * Les joueurs connus : les quatre du départ, puis ceux ajoutés depuis l'accueil.
 *
 * Deux choses bien distinctes :
 * - **les noms**, lus en base pour tous : ils servent partout à l'affichage, y compris
 *   dans les statistiques. La base ne fait que s'allonger, on n'y efface jamais rien ;
 * - **la liste de l'accueil**, propre à ce navigateur : on y retire un nom d'une croix,
 *   ce qui le masque ici seulement. Ses parties et ses statistiques restent en base.
 *
 * Les noms vivent dans un objet réactif au niveau du module : `nameOf` s'utilise
 * partout (gabarits, calculs) et se met à jour dès que la liste est chargée.
 */
import { reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import { PLAYER_IDS, PLAYER_NAMES, type PlayerId, isBotId } from '../game/players'
import { addPlayer, readRoster } from '../firebase/players'

const names = reactive<Record<PlayerId, string>>({ ...PLAYER_NAMES })

/** Le nom affiché d'un joueur ; son identifiant, à défaut, s'il n'est pas encore chargé. */
export const nameOf = (p: PlayerId): string => {
  if (isBotId(p)) {
    // « Bot », « Bot ★ », puis « Bot 2 » si deux bots du même niveau sont à la table.
    const [, level, n] = p.split('-')
    return `Bot${level === 'expert' ? ' ★' : ''}${n && n !== '1' ? ` ${n}` : ''}`
  }
  return names[p] ?? p.charAt(0).toUpperCase() + p.slice(1)
}

const LIST_KEY = 'coinche.joueurs'
const SESSION_KEY = 'coinche.session'

/**
 * La liste de l'accueil de ce navigateur. La première fois : les quatre du départ, et
 * le joueur qu'on était la dernière fois — sinon il aurait disparu de son propre accueil.
 */
function readList(): PlayerId[] {
  try {
    const raw = localStorage.getItem(LIST_KEY)
    if (raw) return JSON.parse(raw) as PlayerId[]
    const me = (JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as { playerId?: PlayerId } | null)
      ?.playerId
    return me && !PLAYER_IDS.includes(me) ? [...PLAYER_IDS, me] : [...PLAYER_IDS]
  } catch {
    return [...PLAYER_IDS]
  }
}

function writeList(list: PlayerId[]): void {
  try {
    localStorage.setItem(LIST_KEY, JSON.stringify(list))
  } catch {
    // Sans stockage, la liste vaut pour la visite en cours.
  }
}

export const useRoster = defineStore('roster', () => {
  /** Les joueurs affichés sur l'accueil de ce navigateur, dans l'ordre. */
  const players = ref<PlayerId[]>(readList())
  const error = ref<string | null>(null)
  /** Un nom déjà connu, remis dans la liste : on le dit, ce n'est pas une erreur. */
  const info = ref<string | null>(null)
  const busyNow = ref(false)

  /** Les noms de tous les joueurs de la base, pour l'affichage. */
  async function load(): Promise<void> {
    try {
      for (const j of await readRoster()) names[j.id] = j.name
    } catch {
      // Hors ligne ou base injoignable : les quatre du départ suffisent pour jouer.
    }
  }

  function show(p: PlayerId): void {
    if (players.value.includes(p)) return
    players.value = [...players.value, p]
    writeList(players.value)
  }

  /** Retire un nom de l'accueil de ce navigateur. Rien n'est touché en base. */
  function hide(p: PlayerId): void {
    players.value = players.value.filter((x) => x !== p)
    writeList(players.value)
  }

  /**
   * Ajoute un nom à l'accueil. Nouveau, il est créé en base ; déjà connu (un autre
   * téléphone, ou masqué d'ici), il est simplement remis dans la liste.
   */
  async function add(name: string): Promise<PlayerId | null> {
    busyNow.value = true
    error.value = null
    info.value = null
    try {
      const j = await addPlayer(name)
      names[j.id] = j.name
      const alreadyThere = players.value.includes(j.id)
      show(j.id)
      if (j.existed) {
        info.value = alreadyThere
          ? `${j.name} est déjà dans ta liste.`
          : `${j.name} existe déjà : le voici de retour dans ta liste. Si tu es un autre ${j.name}, prends un autre nom (${j.name} B., par exemple).`
      }
      return j.id
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      return null
    } finally {
      busyNow.value = false
    }
  }

  return { players, error, info, busyNow, load, add, hide, show }
})
