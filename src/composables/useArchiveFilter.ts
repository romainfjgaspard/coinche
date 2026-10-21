/**
 * Les parties retenues par les statistiques globales, selon des interrupteurs
 * indépendants : les parties avec bot, les parties sans bot (par défaut, sans bot
 * seulement) ; l'objectif de la partie (500, 1000…) ; normale ou blitz (tout par défaut).
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
/** Les objectifs écartés : vide, toutes les parties comptent. */
const hiddenTargets = ref<number[]>([])
const withNormal = ref(true)
const withBlitz = ref(true)

interface Filtered {
  bots?: string[]
  target?: number
  blitz?: boolean
}
const hasBot = (a: Filtered): boolean => (a.bots ?? []).length > 0
const targetOf = (a: Filtered): number => a.target ?? 1000

export function useArchiveFilter() {
  const session = useSession()
  const kept = (a: Filtered): boolean =>
    (hasBot(a) ? withBots.value : withoutBots.value) &&
    !hiddenTargets.value.includes(targetOf(a)) &&
    (a.blitz ? withBlitz.value : withNormal.value)
  /** Les objectifs joués, et combien de parties pour chacun : une puce par objectif. */
  const targets = computed(() => {
    const counts = new Map<number, number>()
    for (const a of session.archives) counts.set(targetOf(a), (counts.get(targetOf(a)) ?? 0) + 1)
    return [...counts].sort(([a], [b]) => a - b).map(([target, count]) => ({ target, count }))
  })
  const countBlitz = computed(() => session.archives.filter((a) => a.blitz).length)
  const countNormal = computed(() => session.archives.length - countBlitz.value)
  function toggleTarget(target: number): void {
    hiddenTargets.value = hiddenTargets.value.includes(target)
      ? hiddenTargets.value.filter((t) => t !== target)
      : [...hiddenTargets.value, target]
  }
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

  return {
    withBots,
    withoutBots,
    archives,
    countWithBots,
    countWithoutBots,
    unfinished,
    loadUnfinished,
    targets,
    hiddenTargets,
    toggleTarget,
    withNormal,
    withBlitz,
    countNormal,
    countBlitz,
  }
}
