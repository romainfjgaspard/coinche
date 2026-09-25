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
import { regrouperBots } from '../game/statsGlobal'
import { type PartieNonFinie, readPartiesNonFinies } from '../firebase/partie'
import { useSession } from '../stores/session'

const avecBot = ref(false)
const sansBot = ref(true)
const nonFiniesBrutes = ref<PartieNonFinie[] | null>(null)

const aUnBot = (a: { bots?: string[] }): boolean => (a.bots ?? []).length > 0

export function useFiltreArchives() {
  const session = useSession()
  const retenue = (a: { bots?: string[] }): boolean => (aUnBot(a) ? avecBot.value : sansBot.value)
  const archives = computed<Archive[]>(() => regrouperBots(session.archives.filter(retenue)))
  const nbAvecBot = computed(() => session.archives.filter(aUnBot).length)
  const nbSansBot = computed(() => session.archives.length - nbAvecBot.value)
  const nonFinies = computed(() => nonFiniesBrutes.value?.filter(retenue) ?? null)

  async function chargerNonFinies(): Promise<void> {
    try {
      nonFiniesBrutes.value = await readPartiesNonFinies()
    } catch {
      nonFiniesBrutes.value = []
    }
  }

  return { avecBot, sansBot, archives, nbAvecBot, nbSansBot, nonFinies, chargerNonFinies }
}
