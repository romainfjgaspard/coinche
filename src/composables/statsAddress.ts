/**
 * La page des stats dans l'adresse (`?stats=toutes/duos`) : on peut copier le lien d'une
 * page et l'envoyer, ou le mettre en favori. Les mots sont en français, l'adresse se lit.
 *
 * `partie/…` vise la partie en cours, et ne s'ouvre qu'à sa table (avec `?code=`) ;
 * `toutes/…` s'ouvre partout, même depuis l'accueil.
 */
export type StatsTab = 'game' | 'global'
export interface StatsPage {
  tab: StatsTab
  view: string
}

const TAB_WORDS: Record<StatsTab, string> = { game: 'partie', global: 'toutes' }
const VIEW_WORDS: Record<StatsTab, Record<string, string>> = {
  game: { score: 'score', bidding: 'encheres', playing: 'jeu', deals: 'donnes' },
  global: { duos: 'duos', players: 'joueurs', bidding: 'encheres', times: 'temps', games: 'parties' },
}
const PARAM = 'stats'

/** La page des stats demandée par l'adresse, ou null. Une page inconnue mène à la première. */
export function readStatsAddress(): StatsPage | null {
  try {
    const raw = new URLSearchParams(location.search).get(PARAM)
    if (!raw) return null
    const [tabWord, viewWord] = raw.toLowerCase().split('/')
    const tab = (Object.keys(TAB_WORDS) as StatsTab[]).find((t) => TAB_WORDS[t] === tabWord) ?? 'global'
    const views = VIEW_WORDS[tab]
    const view = Object.keys(views).find((v) => views[v] === viewWord) ?? Object.keys(views)[0]
    return { tab, view }
  } catch {
    return null
  }
}

/** Écrit la page ouverte dans l'adresse, ou l'efface (null) en quittant les stats. */
export function writeStatsAddress(page: StatsPage | null): void {
  try {
    const url = new URL(location.href)
    if (page)
      url.searchParams.set(PARAM, `${TAB_WORDS[page.tab]}/${VIEW_WORDS[page.tab][page.view] ?? page.view}`)
    else url.searchParams.delete(PARAM)
    // Le « / » reste lisible : `toutes/duos` plutôt que `toutes%2Fduos`.
    const href = url.href.replace(/([?&]stats=[a-z]+)%2F/, '$1/')
    if (href !== location.href) history.replaceState(history.state, '', href)
  } catch {
    // Adresse non modifiable (aperçu, test) : sans gravité.
  }
}
