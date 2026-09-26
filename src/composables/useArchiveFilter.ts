/**
 * Les parties retenues par les statistiques globales, selon deux interrupteurs
 * indépendants : les parties avec bot, les parties sans bot. Par défaut, sans bot
 * seulement ; on peut aussi ne regarder que celles avec bot.
 *
 * L'état est partagé (niveau module) : téléphone et PC, onglet et sous-onglets
 * voient le même choix. Les bots d'un même niveau y sont regroupés.
 */
import { computed, ref } from 'vue'
import type { Archive } from '../game/archive'
import { groupBots } from '../game/statsGlobal'
import { type UnfinishedGame, readUnfinishedGames } from '../firebase/game'
import { useSession } from '../stores/session'

const withBots = ref(false)
const withoutBots = ref(true)
const rawUnfinished = ref<UnfinishedGame[] | null>(null)

const hasBot = (a: { bots?: string[] }): boolean => (a.bots ?? []).length > 0

export function useArchiveFilter() {
  const session = useSession()
  const kept = (a: { bots?: string[] }): boolean => (hasBot(a) ? withBots.value : withoutBots.value)
  const archives = computed<Archive[]>(() => groupBots(session.archives.filter(kept)))
  const countWithBots = computed(() => session.archives.filter(hasBot).length)
  const countWithoutBots = computed(() => session.archives.length - countWithBots.value)
  const unfinished = computed(() => rawUnfinished.value?.filter(kept) ?? null)

  async function loadUnfinished(): Promise<void> {
    try {
      rawUnfinished.value = await readUnfinishedGames()
    } catch {
      rawUnfinished.value = []
    }
  }

  return { withBots, withoutBots, archives, countWithBots, countWithoutBots, unfinished, loadUnfinished }
}
