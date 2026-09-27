<script setup lang="ts">
import { onMounted } from 'vue'
import { globalCalls, globalGaps, globalRoles, globalTimes } from '../game/statsGlobal'
import { colorsOf } from '../composables/playerColors'
import { useArchiveFilter } from '../composables/useArchiveFilter'
import StatsBidding from './StatsBidding.vue'
import StatsGaps from './StatsGaps.vue'
import StatsTimes from './StatsTimes.vue'
import StatsGames from './StatsGames.vue'
/**
 * Statistiques de toutes les parties, sur grand écran — la maquette validée
 * « Stats — toutes les parties — ordinateur ». Dessinée pour 1920 px ; le parent la
 * met à l'échelle de l'écran.
 */
import { duration } from '../game/display'
import { computed, ref } from 'vue'
import type { PlayerId } from '../game/players'
import { nameOf } from '../stores/roster'
import {
  BID_LEVELS,
  pairKey,
  duoStats,
  playersOf,
  playerStats,
  pairsPlayed,
  byTier,
  takesWithStrength,
  takesOf,
} from '../game/statsGlobal'
import { SCALE, groupHabit, BAND_WIDTH } from '../game/strength'
import type { Archive } from '../game/archive'

const props = defineProps<{ archives: Archive[]; view: string }>()

// --- Enchères, temps et parties : les mêmes sections que sur téléphone, sur deux colonnes.
const thePlayers = computed(() => playersOf(props.archives))
const playerColors = computed(() => colorsOf(thePlayers.value))
const calls = computed(() => globalCalls(props.archives))
const roles = computed(() => globalRoles(props.archives))
const gaps = computed(() => globalGaps(props.archives))
const times = computed(() => globalTimes(props.archives))
const { unfinished, loadUnfinished } = useArchiveFilter()
onMounted(() => {
  void loadUnfinished()
})

const GOLD = '#d9a441'
const GOOD = '#52a884'
const BAD = '#cc6b4a'
const LIGHT = '#cfe0d8'
const SLATE = '#5d7a70'
const SEP = '1px solid rgba(255,255,255,.14)'

const name = (p: PlayerId): string => nameOf(p)
const pairName = (p: readonly PlayerId[]): string => p.map(name).join(' & ')
const rate = (a: number, b: number): number => (b === 0 ? 0 : Math.round((a / b) * 100))
/** Un nombre à une décimale, virgule française, signe toujours écrit. */
const signed = (v: number): string =>
  v === 0 ? '0' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1).replace('.', ',')}`

const duos = computed(() => duoStats(props.archives))
const players = computed(() => playerStats(props.archives))

// --- Cellules des tableaux : valeur, couleur, fond dégradé, séparateur de groupe
interface Cell {
  v: string
  c: string
  w: string
  background: string
  sep: string
}
const cell = (v: string | number, opt: Partial<Cell> = {}): Cell => ({
  v: String(v),
  c: opt.c ?? LIGHT,
  w: opt.w ?? '400',
  background: opt.background ?? 'transparent',
  sep: opt.sep ?? 'none',
})
/** Dégradé séquentiel : plus le taux est élevé, plus le fond est soutenu. */
const rateCell = (v: number, sep?: string): Cell => {
  const a = Math.max(0, Math.min(1, (v - 35) / 40))
  return cell(`${v} %`, {
    c: '#faf9f5',
    w: '600',
    background: `rgba(82,168,132,${(0.08 + a * 0.42).toFixed(2)})`,
    sep,
  })
}
const signedCell = (v: number, sep?: string): Cell =>
  cell(signed(v), { c: v >= 0 ? GOOD : BAD, w: '700', sep })

const columns = (names: string[], left: number, separators: number[]) =>
  names.map((t, i) => ({
    t,
    align: i < left ? 'left' : 'right',
    sep: separators.includes(i) ? SEP : 'none',
  }))

// --- Repères : le meilleur et le pire, en duo et en individuel
const highlights = computed(() => {
  if (!duos.value.length || !players.value.length) return []
  const byRate = <T extends { won: number; games: number }>(l: T[]) =>
    [...l].sort((a, b) => rate(b.won, b.games) - rate(a.won, a.games))
  const d = byRate(duos.value)
  const j = byRate(players.value)
  const d0 = d[0]
  const dn = d[d.length - 1]
  const j0 = j[0]
  const jn = j[j.length - 1]
  const perDeal = (x: { scoredPoints: number; conceded: number; deals: number }) =>
    x.deals ? (x.scoredPoints - x.conceded) / x.deals : 0
  const victories = (g: number, p: number) => `${g} victoire${g > 1 ? 's' : ''} sur ${p}`
  const goodStyle = { background: 'rgba(82,168,132,.14)', edge: GOOD, color: GOOD }
  const badStyle = { background: 'rgba(204,107,74,.12)', edge: 'rgba(204,107,74,.5)', color: BAD }
  return [
    {
      tag: 'MEILLEUR DUO',
      who: pairName(d0.pair),
      value: `${rate(d0.won, d0.games)} %`,
      detail: `${victories(d0.won, d0.games)} · ${signed(perDeal(d0))} point par donne`,
      ...goodStyle,
    },
    {
      tag: 'PIRE DUO',
      who: pairName(dn.pair),
      value: `${rate(dn.won, dn.games)} %`,
      detail: `${victories(dn.won, dn.games)} · ${signed(perDeal(dn))} point par donne`,
      ...badStyle,
    },
    {
      tag: 'MEILLEUR JOUEUR',
      who: name(j0.player),
      value: `${rate(j0.won, j0.games)} %`,
      detail: `${j0.won} partie${j0.won > 1 ? 's' : ''} gagnée${j0.won > 1 ? 's' : ''} sur ${j0.games} · ${rate(j0.made, j0.takes)} % de contrats tenus`,
      ...goodStyle,
    },
    {
      tag: 'PIRE JOUEUR',
      who: name(jn.player),
      value: `${rate(jn.won, jn.games)} %`,
      detail: `${jn.won} partie${jn.won > 1 ? 's' : ''} gagnée${jn.won > 1 ? 's' : ''} sur ${jn.games} · ${jn.shameStars} étoile${jn.shameStars > 1 ? 's' : ''} de la honte`,
      ...badStyle,
    },
  ]
})

// --- Duo par duo
const pairCols = columns(
  [
    'DUO',
    'CONTRE',
    'JOUÉES',
    'GAGNÉES',
    '%',
    'SCORE MOY',
    'PIRE SCORE',
    'JOUÉES',
    'GAGNÉES',
    '%',
    'PRISES',
    'RÉUSSIES',
    '%',
    'BILAN',
  ],
  2,
  [2, 7],
)
const pairRows = computed(() =>
  duos.value.map((d) => ({
    key: pairKey(d.pair),
    pair: pairName(d.pair),
    against: d.against.map(pairName).join(' · '),
    cells: [
      cell(d.games, { sep: SEP }),
      cell(d.won),
      rateCell(rate(d.won, d.games)),
      cell(d.averageScore),
      cell(d.worstScore ?? '—'),
      cell(d.deals, { sep: SEP }),
      cell(d.dealsWon),
      rateCell(rate(d.dealsWon, d.deals)),
      cell(d.takes),
      cell(d.made),
      rateCell(rate(d.made, d.takes)),
      signedCell(d.deals ? (d.scoredPoints - d.conceded) / d.deals : 0),
    ],
  })),
)

// --- Joueur par joueur, triable d'un clic
const playerCols = columns(
  [
    'JOUEUR',
    'JOUÉES',
    'GAGNÉES',
    '%',
    'SCORE MOY',
    'PIRE SCORE',
    'JOUÉES',
    'PRISES',
    'RÉUSSIES',
    '%',
    'ENCH. MOY',
    'CHUTES',
    'COINCHES',
    'BILAN',
  ],
  1,
  [1, 6],
)
/** Valeur de tri de chaque colonne, dans l'ordre des en-têtes (hors nom). */
const sort = ref<{ col: number; desc: boolean }>({ col: 3, desc: true })
const playerRows = computed(() => {
  const rows = players.value.map((j) => {
    const dealBalance = j.deals ? (j.scoredPoints - j.conceded) / j.deals : 0
    const values = [
      j.games,
      j.won,
      rate(j.won, j.games),
      j.averageScore,
      j.worstScore ?? 0,
      j.deals,
      j.takes,
      j.made,
      rate(j.made, j.takes),
      j.averageBid ?? 0,
      j.downs,
      j.coinches,
      dealBalance,
    ]
    return {
      id: j.player,
      name: name(j.player),
      values,
      cells: [
        cell(j.games, { sep: SEP }),
        cell(j.won),
        rateCell(rate(j.won, j.games)),
        cell(j.averageScore),
        cell(j.worstScore ?? '—'),
        cell(j.deals, { sep: SEP }),
        cell(j.takes),
        cell(j.made),
        rateCell(rate(j.made, j.takes)),
        cell(j.averageBid ?? '—'),
        cell(j.downs),
        cell(`${j.coinches} / ${j.coinchesWon}`),
        signedCell(dealBalance),
      ],
    }
  })
  const { col, desc } = sort.value
  return rows.sort((a, b) => (desc ? -1 : 1) * (a.values[col - 1] - b.values[col - 1]))
})
function sortBy(col: number): void {
  if (col === 0) return
  sort.value = { col, desc: sort.value.col === col ? !sort.value.desc : true }
}

// --- Belotes, impasses et étoiles
const details = computed(() =>
  players.value.map((j) => {
    const success = j.finesses ? rate(j.finessesWon, j.finesses) : null
    return {
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

// --- Jusqu'où chacun peut monter
/** Le choix est retenu par son nom : la liste des joueurs dépend des archives chargées. */
const choice = ref('Tous')
const filters = computed(() => {
  const who = playersOf(props.archives)
  return [
    { name: 'Tous', players: who },
    ...pairsPlayed(props.archives).map((p) => ({ name: pairName(p), players: [...p] })),
    ...who.map((p) => ({ name: name(p), players: [p] })),
  ]
})
const filter = computed(() => filters.value.find((f) => f.name === choice.value) ?? filters.value[0])
const tierLabel = (p: (typeof BID_LEVELS)[number]) => (p === 'capot' ? 'CAPOT' : String(p))
function barItems(who: PlayerId[], height: number, maxRef?: number) {
  const rows = byTier(props.archives, who)
  const max = maxRef ?? Math.max(1, ...rows.map((l) => l.madeGaps + l.downs))
  return rows.map((l) => {
    const total = l.madeGaps + l.downs
    const pct = total ? Math.round((l.madeGaps / total) * 100) : 0
    return {
      tier: tierLabel(l.tier),
      total,
      detail: `${l.madeGaps} / ${total}`,
      pct: total ? `${pct} %` : '',
      pctShort: total ? String(pct) : '',
      // Le pourcentage s'écrit dans la barre : encre sombre sur la part dorée, claire sinon.
      pctColor: total && l.madeGaps / total > 0.28 ? '#0a2a1f' : LIGHT,
      hTotal: total ? `${Math.max(30, Math.round((total / max) * height))}px` : '0px',
      shareMade: l.madeGaps,
      shareDown: l.downs,
    }
  })
}
const large = computed(() => barItems(filter.value.players, 300))
const groupRate = computed(() => {
  const t = players.value.reduce((s, j) => ({ r: s.r + j.made, p: s.p + j.takes }), { r: 0, p: 0 })
  return rate(t.r, t.p)
})
const filterSummary = computed(() => {
  const who = players.value.filter((j) => filter.value.players.includes(j.player))
  const takes = who.reduce((s, j) => s + j.takes, 0)
  const made = who.reduce((s, j) => s + j.made, 0)
  const bids = who.filter((j) => j.averageBid !== null)
  const avg = bids.length
    ? Math.round(
        bids.reduce((s, j) => s + j.averageBid! * j.takes, 0) /
          Math.max(
            1,
            bids.reduce((s, j) => s + j.takes, 0),
          ),
      )
    : null
  return `${takes} prise${takes > 1 ? 's' : ''} · ${rate(made, takes)} % de réussite · moyenne du groupe ${groupRate.value} %${avg === null ? '' : ` · enchère moyenne ${avg}`}`
})
const smallOnes = computed(() => {
  const maxGlobal = Math.max(
    1,
    ...playersOf(props.archives).flatMap((p) => byTier(props.archives, [p]).map((l) => l.madeGaps + l.downs)),
  )
  return playersOf(props.archives).map((p) => {
    const j = players.value.find((x) => x.player === p)
    const picked = filter.value.players.length === 1 && filter.value.players[0] === p
    return {
      id: p,
      name: name(p),
      global: j ? `${rate(j.made, j.takes)} %` : '—',
      // Au-dessus ou au-dessous du groupe : une valeur, donc vert ou orange.
      color: j && rate(j.made, j.takes) >= groupRate.value ? GOOD : BAD,
      background: picked ? 'rgba(217,164,65,.1)' : 'rgba(255,255,255,.04)',
      edge: picked ? 'rgba(217,164,65,.45)' : 'rgba(255,255,255,.08)',
      barItems: barItems([p], 92, maxGlobal),
    }
  })
})

// --- Le panache
const panache = computed(() => {
  const withBelote = players.value.filter((j) => j.panache !== null)
  const max = Math.max(10, ...withBelote.map((j) => Math.abs(j.panache!)))
  return [...withBelote]
    .sort((a, b) => b.panache! - a.panache!)
    .map((j) => {
      const share = (Math.abs(j.panache!) / max) * 50
      const positive = j.panache! > 0
      return {
        name: name(j.player),
        fill: positive ? BAD : GOOD,
        left: `${(positive ? 50 : 50 - share).toFixed(1)}%`,
        width: `${share.toFixed(1)}%`,
        value: signed(j.panache!),
      }
    })
})

/** Les titres : qui ose, qui ose trop, qui compte, et le plus beau coup. */
const titles = computed(() => {
  const withBelote = players.value.filter((j) => j.panache !== null && j.takes > 0)
  if (!withBelote.length) return []
  const success = (j: (typeof withBelote)[number]) => rate(j.made, j.takes)
  const bold = [...withBelote].sort((a, b) => b.panache! - a.panache!)
  const out: { title: string; who: string; color: string; detail: string }[] = []
  const panacheCalc = bold.find((j) => j.panache! > 0 && success(j) >= groupRate.value)
  if (panacheCalc) {
    out.push({
      title: 'LE PANACHE',
      who: name(panacheCalc.player),
      color: GOOD,
      detail: `${signed(panacheCalc.panache!)} au-dessus du groupe, et ${success(panacheCalc)} % de réussite quand même`,
    })
  }
  const kamikaze = bold.find((j) => j.panache! > 0 && success(j) < groupRate.value)
  if (kamikaze) {
    out.push({
      title: 'LE KAMIKAZE',
      who: name(kamikaze.player),
      color: BAD,
      detail: `${signed(kamikaze.panache!)} au-dessus du groupe, ${success(kamikaze)} % seulement`,
    })
  }
  const countable = [...withBelote].reverse().find((j) => j.panache! < 0)
  if (countable) {
    out.push({
      title: 'LE COMPTABLE',
      who: name(countable.player),
      color: LIGHT,
      detail: `${signed(countable.panache!)} sous le groupe, mais ${success(countable)} % de réussite`,
    })
  }
  // La prise du siècle : le contrat tenu le plus haut au regard de la main.
  let century: { player: PlayerId; value: number; strength: number; date: number } | null = null
  for (const a of props.archives) {
    for (const [p, j] of Object.entries(a.players)) {
      for (const d of j.detail) {
        if (!d.isMade || d.strength === null || d.capot) continue
        const boldness = d.value - 8 * d.strength
        if (!century || boldness > century.value - 8 * century.strength) {
          century = { player: p, value: d.value, strength: d.strength, date: a.finishedAt }
        }
      }
    }
  }
  if (century) {
    const dayOf = new Date(century.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
    out.push({
      title: 'LA PRISE DU SIÈCLE',
      who: name(century.player),
      color: GOOD,
      detail: `${century.value} avec une main de force ${century.strength}, réussi le ${dayOf}`,
    })
  }
  return out
})

// Nuages : force de la main (4 → 20) en abscisse, annonce (80 → 160) en ordonnée
const posX = (strength: number) => ((Math.max(4, Math.min(20, strength)) - 4) / 16) * 286 + 2
const posY = (bid: number) => 138 - ((Math.max(80, Math.min(160, bid)) - 80) / 80) * 132
const clouds = computed(() => {
  const every = takesWithStrength(props.archives)
  const habit = groupHabit(every)
  const bands = [...habit.keys()].sort((a, b) => a - b)
  const reference = bands
    .map((b) => `${posX(b * BAND_WIDTH + BAND_WIDTH / 2).toFixed(1)},${posY(habit.get(b)!).toFixed(1)}`)
    .join(' ')
  return playersOf(props.archives).map((p) => {
    const takes = takesOf(props.archives, p).filter((d) => !d.capot)
    const strengths = takes.map((d) => d.strength!).sort((a, b) => a - b)
    const median = strengths.length ? strengths[Math.floor(strengths.length / 2)] : null
    return {
      id: p,
      name: name(p),
      resume: median === null ? 'pas encore de prise' : `force médiane ${median} · bande de ${BAND_WIDTH}`,
      reference,
      points: takes.map((d, i) => ({
        key: i,
        left: `${((posX(d.strength!) / 290) * 100).toFixed(1)}%`,
        top: `${((posY(d.value) / 150) * 100).toFixed(1)}%`,
        fill: d.isMade ? GOLD : SLATE,
      })),
    }
  })
})
</script>

<template>
  <div>
    <template v-if="view === 'duos'">
      <!-- Quatre repères : le meilleur et le pire, en duo et en individuel -->
      <div class="mt-4 grid grid-cols-4 gap-3.5">
        <div
          v-for="r in highlights"
          :key="r.tag"
          class="rounded-xl px-[18px] py-3.5"
          :style="{ background: r.background, border: `1px solid ${r.edge}` }"
        >
          <p class="text-[10px] tracking-[.1em]" :style="{ color: r.color }">{{ r.tag }}</p>
          <div class="mt-1 flex items-baseline gap-2.5">
            <span class="grow font-display text-2xl leading-none">{{ r.who }}</span>
            <span class="font-display text-[28px] leading-none" :style="{ color: r.color }">{{
              r.value
            }}</span>
          </div>
          <p class="mt-2 text-xs leading-snug text-mist">{{ r.detail }}</p>
        </div>
      </div>

      <h2 class="mt-[26px] mb-[3px] font-display text-xl font-normal">Duo par duo</h2>
      <p class="mb-2.5 text-xs text-sage">
        {{
          playersOf(archives).length <= 4
            ? "Les six paires possibles. Chaque paire n'a qu'un adversaire possible : les deux autres joueurs."
            : "Les paires qui ont joué ensemble, et les paires qu'elles ont affrontées."
        }}
      </p>
      <table class="w-full border-collapse text-[13px]">
        <thead>
          <tr class="text-[10px] tracking-[.1em] text-dusk">
            <th colspan="2" class="pb-[5px]"></th>
            <th colspan="5" class="border-b border-l border-white/14 pb-[5px] text-center font-semibold">
              PARTIES
            </th>
            <th colspan="7" class="border-b border-l border-white/14 pb-[5px] text-center font-semibold">
              DONNES
            </th>
          </tr>
          <tr class="text-[10px] tracking-[.05em] text-sage">
            <th
              v-for="(c, i) in pairCols"
              :key="i"
              class="pt-[7px] pr-4 pb-2 font-semibold"
              :style="{ textAlign: c.align as 'left' | 'right', borderLeft: c.sep }"
            >
              {{ c.t }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in pairRows" :key="d.key" class="border-t border-white/7">
            <td class="py-2.5 pr-4 font-semibold whitespace-nowrap">{{ d.pair }}</td>
            <td class="py-2.5 pr-4 whitespace-nowrap text-sage">{{ d.against }}</td>
            <td
              v-for="(v, i) in d.cells"
              :key="i"
              class="py-2.5 pr-4 text-right"
              :style="{ borderLeft: v.sep }"
            >
              <span
                class="inline-block rounded-[5px] px-[7px] py-0.5 tabular-nums"
                :style="{ background: v.background, color: v.c, fontWeight: v.w }"
                >{{ v.v }}</span
              >
            </td>
          </tr>
        </tbody>
      </table>
    </template>
    <template v-else-if="view === 'players'">
      <h2 class="mt-7 mb-[3px] font-display text-xl font-normal">Joueur par joueur</h2>
      <p class="mb-2.5 text-xs text-sage">
        {{
          playersOf(archives).length <= 4
            ? "Les quatre jouent toutes les parties : c'est le camp qui change."
            : 'Chacun compte ses propres parties.'
        }}
        Les colonnes se trient d'un clic.
      </p>
      <table class="w-full border-collapse text-[13px]">
        <thead>
          <tr class="text-[10px] tracking-[.1em] text-dusk">
            <th class="pb-[5px]"></th>
            <th colspan="5" class="border-b border-l border-white/14 pb-[5px] text-center font-semibold">
              PARTIES
            </th>
            <th colspan="8" class="border-b border-l border-white/14 pb-[5px] text-center font-semibold">
              DONNES
            </th>
          </tr>
          <tr class="text-[10px] tracking-[.05em] text-sage">
            <th
              v-for="(c, i) in playerCols"
              :key="i"
              class="pt-[7px] pr-4 pb-2 font-semibold"
              :class="i > 0 ? 'cursor-pointer select-none hover:text-ivory' : ''"
              :style="{ textAlign: c.align as 'left' | 'right', borderLeft: c.sep }"
              :aria-sort="sort.col === i ? (sort.desc ? 'descending' : 'ascending') : undefined"
              @click="sortBy(i)"
            >
              {{ c.t }}<span v-if="sort.col === i" class="text-gold">{{ sort.desc ? ' ▾' : ' ▴' }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="j in playerRows" :key="j.id" class="border-t border-white/7">
            <td class="py-2.5 pr-4 font-semibold whitespace-nowrap">{{ j.name }}</td>
            <td
              v-for="(v, i) in j.cells"
              :key="i"
              class="py-2.5 pr-4 text-right"
              :style="{ borderLeft: v.sep }"
            >
              <span
                class="inline-block rounded-[5px] px-[7px] py-0.5 tabular-nums"
                :style="{ background: v.background, color: v.c, fontWeight: v.w }"
                >{{ v.v }}</span
              >
            </td>
          </tr>
        </tbody>
      </table>

      <h2 class="mt-7 mb-2.5 font-display text-xl font-normal">Belotes, impasses, étoiles et réflexion</h2>
      <div class="grid grid-cols-4 gap-4">
        <div
          v-for="d in details"
          :key="d.name"
          class="rounded-xl border border-white/8 bg-white/4 px-[18px] py-3.5"
        >
          <p class="mb-2.5 text-[15px] font-semibold">{{ d.name }}</p>
          <div v-for="l in d.rows" :key="l.what" class="flex items-baseline gap-2.5 py-[5px]">
            <span class="grow text-xs text-sage">{{ l.what }}</span>
            <span class="text-sm font-semibold whitespace-nowrap tabular-nums" :style="{ color: l.color }">{{
              l.value
            }}</span>
          </div>
        </div>
      </div>

      <h2 class="mt-[34px] mb-1 font-display text-xl font-normal">Jusqu'où chacun peut monter</h2>
      <p class="mb-3 text-[13px] text-sage">
        Hauteur de la barre = contrats pris à ce palier · part dorée = contrats passés
      </p>
      <div
        class="flex flex-wrap items-center gap-2 rounded-xl border border-white/8 bg-white/4 px-3.5 py-2.5"
      >
        <span class="mr-1 text-[11px] tracking-[.06em] text-dusk">AFFICHER</span>
        <button
          v-for="f in filters"
          :key="f.name"
          type="button"
          class="cursor-pointer rounded-full border px-3.5 py-1.5 text-[12.5px] transition"
          :class="
            filter.name === f.name
              ? 'border-gold bg-gold/20 font-semibold text-gold'
              : 'border-white/14 font-medium text-mist hover:border-white/35'
          "
          @click="choice = f.name"
        >
          {{ f.name }}
        </button>
      </div>
      <div class="mt-[18px] grid grid-cols-[1.5fr_1fr] gap-9">
        <section>
          <div class="flex items-baseline gap-3">
            <h3 class="text-base font-semibold">{{ filter.name }}</h3>
            <p class="text-[12.5px] text-sage">{{ filterSummary }}</p>
            <span class="ml-auto flex gap-3.5 text-xs text-mist">
              <span class="flex items-center gap-1.5"
                ><span class="size-[11px] rounded-[3px] bg-gold"></span>réussis</span
              >
              <span class="flex items-center gap-1.5"
                ><span class="size-[11px] rounded-[3px] bg-[#5d7a70]"></span>chutés</span
              >
            </span>
          </div>
          <div class="mt-3 flex items-end gap-2.5">
            <div v-for="p in large" :key="p.tier" class="flex grow flex-col items-center">
              <div class="flex h-[300px] items-end">
                <div
                  v-if="p.total"
                  class="relative flex w-[78px] flex-col gap-0.5"
                  :style="{ height: p.hTotal }"
                  :title="`${p.detail} contrats tenus`"
                >
                  <div class="rounded-t bg-[#5d7a70]" :style="{ flexGrow: p.shareDown }"></div>
                  <div class="rounded-b bg-gold" :style="{ flexGrow: p.shareMade }"></div>
                  <span
                    class="absolute inset-x-0 bottom-[7px] text-center text-sm font-bold"
                    :style="{ color: p.pctColor }"
                    >{{ p.pct }}</span
                  >
                </div>
                <div
                  v-else
                  class="h-2.5 w-[78px] rounded border border-dashed border-white/20"
                  title="jamais pris"
                ></div>
              </div>
              <span class="mt-2 text-[13px] font-semibold">{{ p.tier }}</span>
              <span class="mt-0.5 text-[11px] text-dusk">{{ p.detail }}</span>
            </div>
          </div>
        </section>
        <section>
          <h3 class="mb-0.5 text-base font-semibold">
            {{ playersOf(archives).length === 4 ? 'Les quatre' : 'Chacun' }}, à la même échelle
          </h3>
          <p class="mb-2.5 text-xs text-sage">
            Le nombre inscrit dans chaque barre est le taux de réussite, en pourcentage.
          </p>
          <div class="grid grid-cols-2 gap-3">
            <div
              v-for="j in smallOnes"
              :key="j.id"
              class="rounded-[11px] px-3 py-2.5"
              :style="{ background: j.background, border: `1px solid ${j.edge}` }"
            >
              <div class="flex items-baseline gap-1.5">
                <span class="grow text-[13px] font-semibold">{{ j.name }}</span>
                <span class="text-xs font-bold" :style="{ color: j.color }">{{ j.global }}</span>
              </div>
              <div class="mt-2 flex items-end gap-1">
                <div v-for="b in j.barItems" :key="b.tier" class="flex grow flex-col items-center">
                  <div class="flex h-[100px] items-end">
                    <div
                      v-if="b.total"
                      class="relative flex w-[22px] flex-col gap-0.5"
                      :style="{ height: b.hTotal }"
                    >
                      <div class="rounded-t-[3px] bg-[#5d7a70]" :style="{ flexGrow: b.shareDown }"></div>
                      <div class="rounded-b-[3px] bg-gold" :style="{ flexGrow: b.shareMade }"></div>
                      <span
                        class="absolute inset-x-0 bottom-[3px] text-center text-[9px] font-bold"
                        :style="{ color: b.pctColor }"
                        >{{ b.pctShort }}</span
                      >
                    </div>
                  </div>
                  <span class="mt-1 text-[8px] text-dusk">{{ b.tier }}</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <h2 class="mt-9 mb-1 font-display text-xl font-normal">Le panache</h2>
      <p class="mb-3.5 text-[13px] text-sage">
        Force de main : +{{ SCALE.trump }} par atout, +{{ SCALE.trumpJack }} pour le valet, +{{
          SCALE.trumpNine
        }}
        pour le 9, +{{ SCALE.sideAce }} par as extérieur, +{{ SCALE.extraTrump }} par atout au-delà du
        quatrième, +{{ SCALE.void }} par chicane. Le panache est l'écart moyen entre ce qu'un joueur annonce
        et ce que le groupe annonce habituellement avec la même main.
      </p>
      <div class="grid grid-cols-[1fr_1.6fr] gap-9">
        <section>
          <h3 class="mb-3 text-[15px] font-semibold">Audacieux ou prudent</h3>
          <p v-if="!panache.length" class="text-sm text-sage">
            Pas encore assez de prises pour comparer les tempéraments.
          </p>
          <div class="flex flex-col gap-2.5">
            <div v-for="p in panache" :key="p.name" class="flex items-center gap-3.5">
              <span class="w-[74px] text-right text-sm font-semibold">{{ p.name }}</span>
              <div class="relative h-[30px] grow">
                <div class="absolute -top-[3px] -bottom-[3px] left-1/2 w-px bg-white/22"></div>
                <div
                  class="absolute top-0 h-[30px] rounded"
                  :style="{ background: p.fill, left: p.left, width: p.width }"
                ></div>
              </div>
              <span class="w-11 text-sm font-bold tabular-nums" :style="{ color: p.fill }">{{
                p.value
              }}</span>
            </div>
          </div>
          <div v-if="panache.length" class="mt-2 ml-[88px] flex justify-between text-[11px] text-dusk">
            <span>plus prudent que le groupe</span>
            <span>plus audacieux</span>
          </div>
          <div class="mt-4 flex flex-col gap-2">
            <div
              v-for="t in titles"
              :key="t.title"
              class="flex items-baseline gap-3 rounded-[10px] border border-white/8 bg-white/4 px-[15px] py-[11px]"
            >
              <span class="w-[140px] text-[12.5px] font-semibold" :style="{ color: t.color }">{{
                t.title
              }}</span>
              <span class="text-sm font-semibold">{{ t.who }}</span>
              <span class="grow text-right text-xs text-sage">{{ t.detail }}</span>
            </div>
          </div>
        </section>
        <section>
          <div class="flex items-baseline gap-3.5">
            <h3 class="text-[15px] font-semibold">Ce qu'il lui faut en main pour partir</h3>
            <span class="ml-auto flex gap-3.5 text-xs text-mist">
              <span class="flex items-center gap-1.5"
                ><span class="size-2.5 rounded-full bg-gold"></span>contrat réussi</span
              >
              <span class="flex items-center gap-1.5"
                ><span class="size-2.5 rounded-full bg-[#5d7a70]"></span>contrat chuté</span
              >
              <span class="flex items-center gap-1.5">
                <span class="w-3.5 border-t-2 border-dashed border-mist/60"></span>habitude du groupe
              </span>
            </span>
          </div>
          <div class="mt-2.5 grid grid-cols-2 gap-3.5">
            <div
              v-for="n in clouds"
              :key="n.id"
              class="rounded-[11px] border border-white/8 bg-white/4 px-[13px] pt-[11px] pb-[9px]"
            >
              <div class="flex items-baseline gap-2">
                <span class="grow text-[13px] font-semibold">{{ n.name }}</span>
                <span class="text-[11.5px] text-sage">{{ n.resume }}</span>
              </div>
              <div class="mt-2 flex gap-1.5">
                <div class="flex flex-col justify-between pt-0.5 pb-[18px] text-[9px] text-dusk">
                  <span>160</span><span>120</span><span>80</span>
                </div>
                <div class="grow">
                  <div class="relative h-[140px]">
                    <svg
                      viewBox="0 0 290 150"
                      width="100%"
                      height="140"
                      preserveAspectRatio="none"
                      class="absolute inset-0"
                      role="img"
                      :aria-label="`${n.name} : force de main et hauteur d'annonce`"
                    >
                      <g stroke="rgba(255,255,255,.07)" stroke-width="1">
                        <line x1="0" y1="6" x2="290" y2="6" />
                        <line x1="0" y1="72" x2="290" y2="72" />
                        <line x1="0" y1="138" x2="290" y2="138" />
                      </g>
                      <polyline
                        :points="n.reference"
                        fill="none"
                        stroke="rgba(207,224,216,.5)"
                        stroke-width="2"
                        stroke-dasharray="5 4"
                        vector-effect="non-scaling-stroke"
                      />
                    </svg>
                    <!-- Les points en HTML : ils restent ronds quelle que soit la largeur -->
                    <span
                      v-for="pt in n.points"
                      :key="pt.key"
                      class="absolute size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#0a2a1f]"
                      :style="{ left: pt.left, top: pt.top, background: pt.fill }"
                    ></span>
                  </div>
                  <div class="flex justify-between text-[9px] text-dusk">
                    <span>main faible</span><span>main forte</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </template>
    <div v-else-if="view === 'bidding'" class="mt-4 grid grid-cols-2 items-start gap-x-10">
      <StatsBidding :players="thePlayers" :colors="playerColors" :calls="calls" :roles="roles" />
      <StatsGaps :players="thePlayers" :colors="playerColors" :gaps="gaps" />
    </div>
    <div v-else-if="view === 'times'" class="mt-4 grid grid-cols-2 items-start gap-x-10">
      <StatsTimes :players="thePlayers" :colors="playerColors" :times="times" />
    </div>
    <div v-else class="mt-4 grid grid-cols-2 items-start gap-x-10">
      <StatsGames :archives="archives" :unfinished="unfinished" />
    </div>

    <p v-if="view === 'duos' || view === 'players'" class="mt-6 text-xs leading-relaxed text-dusk">
      <b class="text-mist">Lecture.</b>
      L'or et le bleu désignent les équipes, jamais la qualité d'un résultat ; le vert et le rouge sont
      réservés aux valeurs, et le signe est toujours écrit. Les pourcentages portent un fond dégradé, d'autant
      plus soutenu que le taux est élevé. « Pire score » remplace le maximum, qui tourne toujours autour de
      1000 puisque la partie s'y arrête. « Bilan » est le net par donne : points marqués en prenant, moins
      points offerts en chutant.
    </p>
  </div>
</template>
