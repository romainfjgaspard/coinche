<script setup lang="ts">
/**
 * Statistiques sur toutes les parties, lues depuis les archives.
 * Les duos, les joueurs, la réussite par palier et le panache.
 */
import { duration } from '../game/display'
import { computed, onMounted, ref } from 'vue'
import type { PlayerId } from '../game/players'
import { nameOf } from '../stores/roster'
import {
  globalCalls,
  pairKey,
  duoStats,
  globalGaps,
  playersOf,
  playerStats,
  pairsPlayed,
  byTier,
  globalRoles,
  globalTimes,
} from '../game/statsGlobal'
import { useSession } from '../stores/session'
import { useArchiveFilter } from '../composables/useArchiveFilter'
import { colorsOf } from '../composables/playerColors'
import BotFilter from './BotFilter.vue'
import SubTabs from './SubTabs.vue'
import StatsBidding from './StatsBidding.vue'
import StatsGaps from './StatsGaps.vue'
import StatsTimes from './StatsTimes.vue'
import StatsGames from './StatsGames.vue'

const session = useSession()
// Rechargé à chaque ouverture : une partie finie depuis la dernière visite doit apparaître.
onMounted(() => {
  void session.loadArchives()
  void loadUnfinished()
})

const GOOD = '#52a884'
const BAD = '#cc6b4a'
const GOLD = '#d9a441'
const LIGHT = '#cfe0d8'

/**
 * Les parties retenues : sans bot par défaut (un score obtenu avec un partenaire
 * artificiel n'a pas sa place dans les classements), avec bot sur demande, ou les
 * deux. Les bots d'un même niveau n'y font qu'un joueur.
 */
const { archives, unfinished, loadUnfinished } = useArchiveFilter()

const SUB_TABS = [
  { id: 'duos', label: 'Duos' },
  { id: 'players', label: 'Joueurs' },
  { id: 'bidding', label: 'Enchères' },
  { id: 'times', label: 'Temps' },
  { id: 'games', label: 'Parties' },
] as const
const view = ref<string>('duos')

const thePlayers = computed(() => playersOf(archives.value))
const colors = computed(() => colorsOf(thePlayers.value))
const calls = computed(() => globalCalls(archives.value))
const roles = computed(() => globalRoles(archives.value))
const gaps = computed(() => globalGaps(archives.value))
const times = computed(() => globalTimes(archives.value))

const duos = computed(() => duoStats(archives.value))
const players = computed(() => playerStats(archives.value))
const total = computed(() => archives.value.length)

const rate = (a: number, b: number): number => (b === 0 ? 0 : Math.round((a / b) * 100))
const name = (p: PlayerId): string => nameOf(p)
const pairName = (p: readonly PlayerId[]): string => p.map(name).join(' & ')

/** Fond d'autant plus soutenu que le taux est élevé. */
const rateBackground = (v: number): string => {
  const a = Math.max(0, Math.min(1, (v - 35) / 40))
  return `rgba(82,168,132,${(0.08 + a * 0.42).toFixed(2)})`
}

/** Un nombre à une décimale, virgule française, signe toujours écrit — comme sur PC. */
const signed = (v: number): string =>
  v === 0 ? '0' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1).replace('.', ',')}`
/** Le bilan net par donne : points marqués en prenant, moins points offerts en chutant. */
const perDeal = (x: { scoredPoints: number; conceded: number; deals: number }): number =>
  x.deals ? (x.scoredPoints - x.conceded) / x.deals : 0

/** Les mêmes quatre repères que sur PC, avec les mêmes détails. */
const highlights = computed(() => {
  if (duos.value.length === 0 || players.value.length === 0) return []
  const dSort = [...duos.value].sort((a, b) => rate(b.won, b.games) - rate(a.won, a.games))
  const jSort = [...players.value].sort((a, b) => rate(b.won, b.games) - rate(a.won, a.games))
  const card = (tag: string, who: string, v: number, detail: string, goodStyle: boolean) => ({
    tag,
    who,
    value: `${v} %`,
    detail,
    color: goodStyle ? GOOD : BAD,
    background: goodStyle ? 'rgba(82,168,132,.14)' : 'rgba(204,107,74,.12)',
    edge: goodStyle ? GOOD : 'rgba(204,107,74,.5)',
  })
  const victories = (g: number, p: number) => `${g} victoire${g > 1 ? 's' : ''} sur ${p}`
  const won = (g: number, p: number) => `${g} partie${g > 1 ? 's' : ''} gagnée${g > 1 ? 's' : ''} sur ${p}`
  const d0 = dSort[0]
  const dn = dSort[dSort.length - 1]
  const j0 = jSort[0]
  const jn = jSort[jSort.length - 1]
  return [
    card(
      'MEILLEUR DUO',
      pairName(d0.pair),
      rate(d0.won, d0.games),
      `${victories(d0.won, d0.games)} · ${signed(perDeal(d0))} point par donne`,
      true,
    ),
    card(
      'PIRE DUO',
      pairName(dn.pair),
      rate(dn.won, dn.games),
      `${victories(dn.won, dn.games)} · ${signed(perDeal(dn))} point par donne`,
      false,
    ),
    card(
      'MEILLEUR JOUEUR',
      name(j0.player),
      rate(j0.won, j0.games),
      `${won(j0.won, j0.games)} · ${rate(j0.made, j0.takes)} % de contrats tenus`,
      true,
    ),
    card(
      'PIRE JOUEUR',
      name(jn.player),
      rate(jn.won, jn.games),
      `${won(jn.won, jn.games)} · ${jn.shameStars} étoile${jn.shameStars > 1 ? 's' : ''} de la honte`,
      false,
    ),
  ]
})

/** Belotes, impasses et étoiles : une carte par joueur, comme sur PC. */
const details = computed(() =>
  players.value.map((j) => {
    const success = j.finesses ? rate(j.finessesWon, j.finesses) : null
    return {
      id: j.player,
      name: name(j.player),
      rows: [
        { what: 'Belotes annoncées', value: String(j.belotesDeclared), color: LIGHT },
        {
          what: 'Belotes oubliées',
          value: String(j.belotesForgotten),
          color: j.belotesForgotten ? BAD : LIGHT,
        },
        { what: 'Impasses tentées', value: String(j.finesses), color: LIGHT },
        {
          what: 'Impasses réussies',
          value: success === null ? '—' : `${success} %`,
          color: success === null ? LIGHT : success >= 55 ? GOOD : success < 45 ? BAD : LIGHT,
        },
        { what: 'Étoiles de la honte', value: String(j.shameStars), color: GOLD },
        // Temps mesurés depuis le 24/09/2026 : les parties d'avant n'en ont pas.
        {
          what: "Temps d'annonce",
          value: j.bidTime === null ? '—' : duration(j.bidTime),
          color: LIGHT,
        },
        { what: 'Temps de jeu', value: j.cardTime === null ? '—' : duration(j.cardTime), color: LIGHT },
      ],
    }
  }),
)

/** Filtre du graphe par palier : tous, un duo, ou un joueur. */
/** Le choix est retenu par son nom : la liste des joueurs dépend des archives chargées. */
const choice = ref('Tous')
const filters = computed(() => {
  const who = playersOf(archives.value)
  return [
    { name: 'Tous', players: who },
    ...pairsPlayed(archives.value).map((p) => ({ name: pairName(p), players: [...p] })),
    ...who.map((p) => ({ name: name(p), players: [p] })),
  ]
})
const filter = computed(() => filters.value.find((f) => f.name === choice.value) ?? filters.value[0])

const tiers = computed(() => {
  const rows = byTier(archives.value, filter.value.players)
  const max = Math.max(1, ...rows.map((l) => l.madeGaps + l.downs))
  return rows.map((l) => {
    const t = l.madeGaps + l.downs
    return {
      tier: l.tier === 'capot' ? 'capot' : String(l.tier),
      total: t,
      pct: t ? Math.round((l.madeGaps / t) * 100) : null,
      height: t ? `${Math.max(30, Math.round((t / max) * 150))}px` : '10px',
      shareMade: l.madeGaps,
      shareDown: l.downs,
      // Encre sombre sur la part dorée, claire quand elle est trop courte
      ink: l.madeGaps / t > 0.28 ? '#0a2a1f' : '#cfe0d8',
    }
  })
})

const panaches = computed(() => {
  const withBelote = players.value.filter((j) => j.panache !== null)
  const max = Math.max(10, ...withBelote.map((j) => Math.abs(j.panache!)))
  return withBelote
    .sort((a, b) => b.panache! - a.panache!)
    .map((j) => {
      const share = (Math.abs(j.panache!) / max) * 50
      const positive = j.panache! > 0
      // Les couleurs de la maquette validée : plus audacieux que le groupe en orange,
      // plus prudent en vert — comme sur PC.
      return {
        name: name(j.player),
        color: positive ? BAD : GOOD,
        left: `${(positive ? 50 : 50 - share).toFixed(1)}%`,
        width: `${share.toFixed(1)}%`,
        value: signed(j.panache!),
      }
    })
})
</script>

<template>
  <div>
    <p v-if="session.archives.length === 0" class="mt-8 text-center text-[15px] text-sage">
      Aucune partie terminée pour l'instant. Les statistiques apparaîtront après la première.
    </p>

    <template v-else>
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <BotFilter />
        <p class="ml-auto text-[13px] text-dusk">
          {{ total }} partie{{ total > 1 ? 's' : '' }} terminée{{ total > 1 ? 's' : '' }}
        </p>
      </div>
      <SubTabs v-model="view" :options="SUB_TABS" class="mt-3" />

      <p v-if="total === 0 && view !== 'games'" class="mt-8 text-center text-[15px] text-sage">
        Aucune partie terminée dans cette sélection : changez les interrupteurs ci-dessus.
      </p>
      <template v-else>
        <div>
          <section v-if="view === 'duos'">
            <div class="mt-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-4">
              <div
                v-for="r in highlights"
                :key="r.tag"
                class="rounded-xl border px-3.5 py-3"
                :style="{ borderColor: r.edge, background: r.background }"
              >
                <p class="text-[11px] tracking-widest" :style="{ color: r.color }">{{ r.tag }}</p>
                <p class="mt-1 font-display text-xl leading-tight">{{ r.who }}</p>
                <p class="font-display text-3xl leading-none" :style="{ color: r.color }">{{ r.value }}</p>
                <p class="mt-1 text-[13px] text-mist">{{ r.detail }}</p>
              </div>
            </div>
          </section>

          <section v-if="view === 'duos'">
            <h2 class="mt-6 mb-2 font-display text-xl">Duo par duo</h2>
            <table
              class="w-full border-collapse text-[14px] [&_td:first-child]:pl-0 [&_th:first-child]:pl-0 [&_td:last-child]:pr-0 [&_th:last-child]:pr-0"
            >
              <thead>
                <tr class="text-[12px] tracking-wider text-sage">
                  <th class="pb-1.5 text-left font-semibold px-2">DUO</th>
                  <th class="pb-1.5 text-right font-semibold px-2">PARTIES</th>
                  <th class="pb-1.5 text-right font-semibold px-2">GAGNÉES</th>
                  <th class="pb-1.5 text-right font-semibold px-2">%</th>
                  <th class="hidden pb-1.5 text-right font-semibold lg:table-cell px-2">DONNES</th>
                  <th class="hidden pb-1.5 text-right font-semibold lg:table-cell px-2">DONNES&nbsp;%</th>
                  <th class="hidden pb-1.5 text-right font-semibold lg:table-cell px-2">PRISES</th>
                  <th class="hidden pb-1.5 text-right font-semibold lg:table-cell px-2">CONTRATS&nbsp;%</th>
                  <th class="hidden pb-1.5 text-right font-semibold lg:table-cell px-2">MARQUÉS</th>
                  <th class="hidden pb-1.5 text-right font-semibold lg:table-cell px-2">OFFERTS</th>
                  <th class="hidden pb-1.5 text-right font-semibold lg:table-cell px-2">MOYEN</th>
                  <th class="pb-1.5 text-right font-semibold px-2">PIRE</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="d in duos" :key="pairKey(d.pair)" class="border-t border-white/8">
                  <!-- Le duo passe sur deux lignes plutôt que de pousser la dernière colonne hors de l'écran -->
                  <td class="py-2 font-semibold">{{ pairName(d.pair) }}</td>
                  <td class="py-2 text-right tabular-nums text-mist px-2">{{ d.games }}</td>
                  <td class="py-2 text-right tabular-nums text-mist px-2">{{ d.won }}</td>
                  <td class="py-2 text-right px-2">
                    <span
                      class="inline-block rounded px-1.5 py-0.5 font-semibold whitespace-nowrap tabular-nums"
                      :style="{ background: rateBackground(rate(d.won, d.games)) }"
                      >{{ rate(d.won, d.games) }} %</span
                    >
                  </td>
                  <td class="hidden py-2 text-right tabular-nums text-mist lg:table-cell px-2">
                    {{ d.deals }}
                  </td>
                  <td class="hidden py-2 text-right tabular-nums text-mist lg:table-cell px-2">
                    {{ rate(d.dealsWon, d.deals) }} %
                  </td>
                  <td class="hidden py-2 text-right tabular-nums text-mist lg:table-cell px-2">
                    {{ d.takes }}
                  </td>
                  <td class="hidden py-2 text-right lg:table-cell px-2">
                    <span
                      class="inline-block rounded px-1.5 py-0.5 font-semibold whitespace-nowrap tabular-nums"
                      :style="{ background: rateBackground(rate(d.made, d.takes)) }"
                      >{{ rate(d.made, d.takes) }} %</span
                    >
                  </td>
                  <td class="hidden py-2 text-right tabular-nums lg:table-cell px-2" :style="{ color: GOOD }">
                    {{ d.scoredPoints }}
                  </td>
                  <td class="hidden py-2 text-right tabular-nums lg:table-cell px-2" :style="{ color: BAD }">
                    {{ d.conceded }}
                  </td>
                  <td class="hidden py-2 text-right tabular-nums text-mist lg:table-cell px-2">
                    {{ d.averageScore }}
                  </td>
                  <td class="py-2 text-right tabular-nums text-mist px-2">{{ d.worstScore ?? '—' }}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section v-if="view === 'players'">
            <h2 class="mt-6 mb-2 font-display text-xl">Joueur par joueur</h2>
            <table
              class="w-full border-collapse text-[14px] [&_td:first-child]:pl-0 [&_th:first-child]:pl-0 [&_td:last-child]:pr-0 [&_th:last-child]:pr-0"
            >
              <thead>
                <tr class="text-[12px] tracking-wider text-sage">
                  <th class="pb-1.5 text-left font-semibold px-2">JOUEUR</th>
                  <th class="hidden pb-1.5 text-right font-semibold lg:table-cell px-2">PARTIES</th>
                  <th class="hidden pb-1.5 text-right font-semibold lg:table-cell px-2">GAGNÉES</th>
                  <th class="pb-1.5 text-right font-semibold px-2">PRISES</th>
                  <th class="pb-1.5 text-right font-semibold px-2">RÉUSS.</th>
                  <th class="pb-1.5 text-right font-semibold px-2">%</th>
                  <th class="hidden pb-1.5 text-right font-semibold lg:table-cell px-2">COINCHES</th>
                  <th
                    class="hidden pb-1.5 text-right font-semibold lg:table-cell px-2"
                    title="annoncées · oubliées"
                  >
                    BELOTES
                  </th>
                  <th class="hidden pb-1.5 text-right font-semibold lg:table-cell px-2">MARQUÉS</th>
                  <th class="hidden pb-1.5 text-right font-semibold lg:table-cell px-2">OFFERTS</th>
                  <th class="hidden pb-1.5 text-right font-semibold lg:table-cell px-2">MOYEN</th>
                  <th class="hidden pb-1.5 text-right font-semibold lg:table-cell px-2">PIRE</th>
                  <th class="hidden pb-1.5 text-right font-semibold lg:table-cell px-2">PANACHE</th>
                  <th
                    class="pb-1.5 text-right font-semibold px-2"
                    title="net par donne : marqué en prenant, moins offert en chutant"
                  >
                    BILAN
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="j in players" :key="j.player" class="border-t border-white/8">
                  <td class="py-2 font-semibold">{{ name(j.player) }}</td>
                  <td class="hidden py-2 text-right tabular-nums text-mist lg:table-cell px-2">
                    {{ j.games }}
                  </td>
                  <td class="hidden py-2 text-right tabular-nums text-mist lg:table-cell px-2">
                    {{ j.won }} · {{ rate(j.won, j.games) }} %
                  </td>
                  <td class="py-2 text-right tabular-nums text-mist px-2">{{ j.takes }}</td>
                  <td class="py-2 text-right tabular-nums text-mist px-2">{{ j.made }}</td>
                  <td class="py-2 text-right px-2">
                    <span
                      class="inline-block rounded px-1.5 py-0.5 font-semibold whitespace-nowrap tabular-nums"
                      :style="{ background: rateBackground(rate(j.made, j.takes)) }"
                      >{{ rate(j.made, j.takes) }} %</span
                    >
                  </td>
                  <td class="hidden py-2 text-right tabular-nums text-mist lg:table-cell px-2">
                    {{ j.coinches }}
                  </td>
                  <td class="hidden py-2 text-right tabular-nums lg:table-cell px-2">
                    <span class="text-mist">{{ j.belotesDeclared }}</span>
                    <span class="text-dusk"> · </span>
                    <span :style="{ color: j.belotesForgotten ? BAD : undefined }" class="text-dusk">
                      {{ j.belotesForgotten }}
                    </span>
                  </td>
                  <td class="hidden py-2 text-right tabular-nums lg:table-cell px-2" :style="{ color: GOOD }">
                    {{ j.scoredPoints }}
                  </td>
                  <td class="hidden py-2 text-right tabular-nums lg:table-cell px-2" :style="{ color: BAD }">
                    {{ j.conceded }}
                  </td>
                  <td class="hidden py-2 text-right tabular-nums text-mist lg:table-cell px-2">
                    {{ j.averageScore }}
                  </td>
                  <td class="hidden py-2 text-right tabular-nums text-mist lg:table-cell px-2">
                    {{ j.worstScore ?? '—' }}
                  </td>
                  <td class="hidden py-2 text-right tabular-nums lg:table-cell px-2">
                    <span v-if="j.panache === null" class="text-dusk">—</span>
                    <span v-else :style="{ color: j.panache >= 0 ? GOOD : BAD }">
                      {{ j.panache > 0 ? '+' : '' }}{{ j.panache }}
                    </span>
                  </td>
                  <td
                    class="py-2 text-right font-bold tabular-nums px-2"
                    :style="{ color: perDeal(j) >= 0 ? GOOD : BAD }"
                  >
                    {{ signed(perDeal(j)) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <section v-if="view === 'players'">
            <h2 class="mt-6 mb-2 font-display text-xl">Belotes, impasses, étoiles et réflexion</h2>
            <div class="grid grid-cols-2 gap-2.5 max-[380px]:gap-2">
              <div
                v-for="d in details"
                :key="d.id"
                class="rounded-xl border border-white/8 bg-white/4 px-3 py-2.5 max-[380px]:px-2"
              >
                <p class="mb-1.5 text-[15px] font-semibold">{{ d.name }}</p>
                <div v-for="l in d.rows" :key="l.what" class="flex items-baseline gap-2 py-0.5">
                  <span class="grow text-[13px] text-sage">{{ l.what }}</span>
                  <span
                    class="text-[14px] font-semibold whitespace-nowrap tabular-nums"
                    :style="{ color: l.color }"
                    >{{ l.value }}</span
                  >
                </div>
              </div>
            </div>
          </section>

          <section v-if="view === 'players'">
            <h2 class="mt-6 mb-1 font-display text-xl">Jusqu'où chacun peut monter</h2>
            <p class="mb-2 text-[13px] text-sage">
              Hauteur de la barre = contrats pris à ce palier · part dorée = contrats passés
            </p>
            <div class="flex flex-wrap gap-1.5 rounded-xl border border-white/8 bg-white/5 p-2">
              <button
                v-for="f in filters"
                :key="f.name"
                type="button"
                class="rounded-full border px-2.5 py-1 text-[13px]"
                :class="
                  filter.name === f.name
                    ? 'border-gold bg-gold/20 font-semibold text-gold'
                    : 'border-white/15 text-mist'
                "
                @click="choice = f.name"
              >
                {{ f.name }}
              </button>
            </div>
            <div v-if="tiers.length" class="mt-3 flex items-end gap-1.5">
              <div v-for="p in tiers" :key="p.tier" class="flex grow flex-col items-center">
                <div class="flex items-end" style="height: 150px">
                  <div
                    v-if="p.total"
                    class="relative flex w-6 flex-col gap-0.5"
                    :style="{ height: p.height }"
                    :title="`${p.shareMade} réussis sur ${p.total}`"
                  >
                    <div class="rounded-t bg-[#5d7a70]" :style="{ flexGrow: p.shareDown }"></div>
                    <div class="rounded-b bg-gold" :style="{ flexGrow: p.shareMade }"></div>
                    <span
                      class="absolute inset-x-0 bottom-0.5 text-center text-[11px] font-bold"
                      :style="{ color: p.ink }"
                      >{{ p.pct }}</span
                    >
                  </div>
                  <div
                    v-else
                    class="w-6 rounded border border-dashed border-white/20"
                    style="height: 10px"
                    title="jamais pris"
                  ></div>
                </div>
                <span class="mt-1 text-[11px] font-semibold">{{ p.tier }}</span>
                <span class="text-[11px] text-dusk">{{ p.total }}</span>
              </div>
            </div>
            <p v-else class="text-[15px] text-sage">Aucune prise pour cette sélection.</p>
          </section>

          <section v-if="view === 'players'">
            <h2 class="mt-6 mb-1 font-display text-xl">Le panache</h2>
            <p class="mb-3 text-[13px] leading-relaxed text-sage">
              Écart moyen entre ce qu'un joueur annonce et ce que <em>les autres</em> annoncent avec une main
              de force comparable.
            </p>
            <div v-if="panaches.length" class="flex flex-col gap-2">
              <div v-for="p in panaches" :key="p.name" class="flex items-center gap-2.5">
                <span class="w-16 shrink-0 text-right text-[15px] font-semibold">{{ p.name }}</span>
                <div class="relative h-6 grow">
                  <div class="absolute top-0 bottom-0 left-1/2 w-px bg-white/20"></div>
                  <div
                    class="absolute top-0 h-6 rounded"
                    :style="{ left: p.left, width: p.width, background: p.color }"
                  ></div>
                </div>
                <span class="w-12 shrink-0 text-[15px] font-bold tabular-nums" :style="{ color: p.color }">
                  {{ p.value }}
                </span>
              </div>
              <div class="mt-1 ml-[74px] mr-14 flex justify-between text-[12px] text-dusk">
                <span>plus prudent</span><span>plus audacieux</span>
              </div>
            </div>
            <p v-else class="text-[15px] text-sage">
              Pas encore assez de prises pour comparer les tempéraments.
            </p>
          </section>

          <template v-if="view === 'bidding'">
            <StatsBidding :players="thePlayers" :colors="colors" :calls="calls" :roles="roles" />
            <StatsGaps :players="thePlayers" :colors="colors" :gaps="gaps" />
          </template>
          <StatsTimes v-if="view === 'times'" :players="thePlayers" :colors="colors" :times="times" />
          <StatsGames v-if="view === 'games'" :archives="archives" :unfinished="unfinished" />
        </div>
      </template>
    </template>
  </div>
</template>
