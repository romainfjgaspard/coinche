<script setup lang="ts">
/**
 * Statistiques de la partie en cours, calculées depuis le journal — donc vivantes :
 * un événement arrive, les chiffres bougent.
 */
import { computed, onMounted, ref } from 'vue'
import { type PlayerId, teamOfPlayer } from '../game/players'
import { nameOf } from '../stores/roster'
import { type Timing, balance, cascade, averageBid, average } from '../game/stats'
import { duration } from '../game/display'
import StatsGlobalView from './StatsGlobalView.vue'
import StatsGamePc from './StatsGamePc.vue'
import StatsGlobalPc from './StatsGlobalPc.vue'
import { globalSummary } from '../game/statsGlobal'
import { partnerOf, playerAtSeat, seatOf } from '../game/players'
import { bidGaps, bidDistribution, takeRoles, timesByPlayer } from '../game/statsBidding'
import { gameColors } from '../composables/playerColors'
import { useArchiveFilter } from '../composables/useArchiveFilter'
import BotFilter from './BotFilter.vue'
import SubTabs from './SubTabs.vue'
import StatsBidding from './StatsBidding.vue'
import StatsGaps from './StatsGaps.vue'
import StatsTimes from './StatsTimes.vue'
import StatsDeals from './StatsDeals.vue'
import { useSession } from '../stores/session'
import { useLargeScreen } from '../composables/useLargeScreen'
import { useTableLayout } from '../composables/useTableLayout'

const session = useSession()
const large = useLargeScreen()
const L = useTableLayout()
/** Ouvert depuis l'accueil : pas de partie en cours, seulement l'historique. */
const props = defineProps<{ globalOnly?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const tab = ref<'game' | 'global'>(props.globalOnly ? 'global' : 'game')

/*
 * Sur PC, les archives sont lues ici : l'en-tête résume toutes les parties, et le
 * choix « avec ou sans bots » s'y trouve. Rechargées à chaque ouverture.
 */
onMounted(() => {
  if (large.value) void session.loadArchives()
})
const { archives } = useArchiveFilter()

/** Les sous-onglets de la partie en cours : une page par thème. */
const SUB_TABS_GAME = [
  { id: 'score', label: 'Score' },
  { id: 'bidding', label: 'Enchères' },
  { id: 'playing', label: 'Jeu' },
  { id: 'deals', label: 'Donnes' },
] as const
const gameView = ref<string>('score')
const SUB_TABS_GLOBAL = [
  { id: 'duos', label: 'Duos' },
  { id: 'players', label: 'Joueurs' },
  { id: 'bidding', label: 'Enchères' },
  { id: 'times', label: 'Temps' },
  { id: 'games', label: 'Parties' },
] as const
const globalView = ref<string>('duos')

/** Moi, mon partenaire, puis les deux autres : l'ordre et les couleurs des courbes. */
const gamePlayers = computed<PlayerId[]>(() => {
  const s = session.seating
  const me = session.playerId && s.includes(session.playerId) ? session.playerId : s[0]
  const i = seatOf(me, s)
  return [me, partnerOf(me, s), playerAtSeat(i + 1, s), playerAtSeat(i + 3, s)]
})
const gamePlayerColors = computed(() => gameColors(gamePlayers.value))
const gameCalls = computed(() => bidDistribution(session.events))
const gameRoles = computed(() => takeRoles(session.events, session.seating))
const gameGaps = computed(() => bidGaps(session.events, session.seating))
const gameTimes = computed(() => timesByPlayer(session.events))
const teamName = (team: 0 | 1): string =>
  session.seating
    .filter((p) => teamOfPlayer(p, session.seating) === team)
    .map((p) => nameOf(p))
    .join(' & ')
/** La phrase à droite des onglets, comme sur la maquette. */
const header = computed(() => {
  if (tab.value === 'game') {
    const n = session.dealSummaries.filter((d) => d.status !== null).length
    const them = session.myTeam === 0 ? 1 : 0
    return `${teamName(session.myTeam)} contre ${teamName(them)} · ${n} donne${n > 1 ? 's' : ''} · objectif ${session.game?.target ?? 1000}${session.game?.blitz ? ' · blitz' : ''}`
  }
  const r = globalSummary(archives.value)
  const pl = (v: number, word: string) => `${v} ${word}${v > 1 ? 's' : ''}`
  const since =
    r.since === null
      ? ''
      : ` · depuis le ${new Date(r.since).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`
  return `${pl(r.games, 'partie')} · ${pl(r.deals, 'donne')} · ${pl(r.takes, 'prise')}${since}`
})
/** Les donnes jouées jusqu'au bout, comme sur PC : ni la donne en cours ni les blanches. */
const dealsPlayedCount = computed(() => session.dealSummaries.filter((d) => d.status !== null).length)
const TABS = computed(() =>
  (
    [
      { id: 'game', label: 'Partie en cours' },
      { id: 'global', label: 'Toutes les parties' },
    ] as const
  ).filter((t) => !props.globalOnly || t.id === 'global'),
)
const backLabel = computed(() => (props.globalOnly ? 'Accueil' : 'Table'))

const GOLD = '#d9a441'
const BLUE = '#7fa8c9'

/** Le camp du joueur est toujours « nous » : les couleurs suivent, pas les numéros. */
const isMyTeam = (team: 0 | 1): boolean => team === session.myTeam

const scores = computed<[number, number]>(() => session.game?.scores ?? [0, 0])
const us = computed(() => scores.value[session.myTeam])
const them = computed(() => scores.value[session.myTeam === 0 ? 1 : 0])

/**
 * Courbe d'évolution : deux polylignes dans un repère de 360 × 170. Chaque donne
 * porte son point et son numéro, et le score final est écrit au bout des courbes :
 * un graphe sans valeurs obligeait à deviner.
 */
const curve = computed(() => {
  const points = session.scoreCurve
  const max = Math.max(320, ...points.map((p) => Math.max(...p.scores)))
  const n = Math.max(1, points.length - 1)
  const x = (i: number): number => 34 + (i / n) * 262
  const y = (v: number): number => 140 - (v / max) * 126
  const them = session.myTeam === 0 ? 1 : 0
  const seriesOf = (team: 0 | 1) => points.map((p, i) => ({ x: x(i), y: y(p.scores[team]) }))
  const row = (team: 0 | 1): string =>
    seriesOf(team)
      .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(' ')
  const tiers = [0, Math.round(max / 2), max]
  const last = points.at(-1)
  // Les deux étiquettes de fin ne doivent pas se chevaucher quand les scores sont proches.
  let yUs = last ? y(last.scores[session.myTeam]) : 0
  let yThem = last ? y(last.scores[them]) : 0
  if (Math.abs(yUs - yThem) < 12) {
    const middle = (yUs + yThem) / 2
    const usOnTop = last ? last.scores[session.myTeam] >= last.scores[them] : true
    yUs = middle + (usOnTop ? -6 : 6)
    yThem = middle + (usOnTop ? 6 : -6)
  }
  // Un numéro de donne sur deux au-delà de quinze, pour qu'ils restent lisibles.
  const step = points.length > 16 ? 2 : 1
  return {
    us: row(session.myTeam),
    them: row(them),
    pointsUs: seriesOf(session.myTeam),
    pointsThem: seriesOf(them),
    tiers: tiers.map((v) => ({ v, y: y(v) })),
    // Le numéro de la donne, pas son rang : une donne blanche ne laisse pas de point.
    deals: points.map((p, i) => ({ i, n: p.deal, x: x(i) })).filter((d) => d.i % step === 0),
    end: last
      ? {
          x: x(points.length - 1) + 8,
          us: last.scores[session.myTeam],
          them: last.scores[them],
          yUs,
          yThem,
        }
      : null,
  }
})

/** Momentum en cascade, comme sur PC : chaque barre part de la fin de la précédente. */
const MOMENTUM_HEIGHT = 170
const momentum = computed(() => {
  const c = cascade(session.momentumBars, session.myTeam)
  const hi = Math.max(0, ...c.map((b) => Math.max(b.before, b.after)))
  const lo = Math.min(0, ...c.map((b) => Math.min(b.before, b.after)))
  const y = (v: number) => ((hi - v) / Math.max(1, hi - lo)) * MOMENTUM_HEIGHT
  return {
    zeroY: y(0),
    barItems: c.map((b) => {
      const top = y(Math.max(b.before, b.after))
      return {
        deal: b.deal,
        us: b.us,
        points: b.points,
        top: top,
        height: Math.max(2, y(Math.min(b.before, b.after)) - top),
      }
    }),
  }
})

/** Les prises, joueur par joueur — sans pourcentage : trop peu de donnes. */
const takes = computed(() =>
  session.seating
    .map((p) => {
      const t = session.playerTallies.get(p)
      const outcomes = session.dealSummaries
        .filter((d) => d.taker === p && d.status !== null)
        .map((d) => d.status !== 'down')
      return {
        id: p,
        name: nameOf(p),
        takes: t?.takes ?? 0,
        outcomes,
        bidEntry: t ? averageBid(t) : null,
        balance: t ? balance(t) : 0,
        color: isMyTeam(teamOfPlayer(p, session.seating)) ? GOLD : BLUE,
      }
    })
    .sort((a, b) => b.balance - a.balance),
)

/**
 * Les impasses : garder l'as de la couleur entamée alors que personne n'a coupé.
 * Coupé derrière, c'est raté ; s'il ramasse un dix, c'est réussi.
 */
const finesses = computed(() =>
  session.seating
    .map((p) => {
      const t = session.finesseCounts.get(p)
      return {
        id: p,
        name: nameOf(p),
        tried: t?.tried ?? 0,
        made: t?.made ?? 0,
        failed: t?.failed ?? 0,
      }
    })
    .sort((a, b) => b.tried - a.tried),
)

const noFinesse = computed(() => finesses.value.every((i) => i.tried === 0))

/** Le temps de réflexion : moyenne pour annoncer, pour jouer, et la plus longue hésitation. */
const thinkRows = computed(() =>
  [...session.seating].map((p) => {
    const r = session.gameThinkTimes.get(p)
    const m = (c?: Timing) => (c ? average(c) : null)
    const max = Math.max(r?.bids.max ?? 0, r?.cards.max ?? 0)
    return {
      id: p,
      name: nameOf(p),
      bid: m(r?.bids),
      card: m(r?.cards),
      max: max > 0 ? max : null,
    }
  }),
)
const noTimes = computed(() => thinkRows.value.every((t) => t.bid === null && t.card === null))

/** « Roux ×2, Viv » plutôt que « Roux, Roux, Viv ». */
function byPlayer(players: PlayerId[]): string {
  const n = new Map<PlayerId, number>()
  for (const j of players) n.set(j, (n.get(j) ?? 0) + 1)
  return [...n].map(([j, k]) => (k > 1 ? `${nameOf(j)} ×${k}` : nameOf(j))).join(', ')
}

const playedTricks = computed(() => {
  const list = session.dealSummaries
  const shameStars = list.filter((d) => d.shameStar)
  const forgets = list.filter((d) => d.beloteForgottenBy)
  const biggest = [...list].sort((a, b) => Math.max(...b.scores) - Math.max(...a.scores))[0]
  const coinches = list.reduce((s, d) => s + d.coinchers.length, 0)
  return [
    {
      title: 'Étoiles de la honte',
      value: shameStars.length === 0 ? 'aucune' : byPlayer(shameStars.map((d) => d.shameStar!)),
      alert: shameStars.length > 0,
    },
    {
      title: 'Belotes oubliées',
      value: forgets.length === 0 ? 'aucune' : byPlayer(forgets.map((d) => d.beloteForgottenBy!)),
      alert: forgets.length > 0,
    },
    {
      title: 'Plus grosse donne',
      value:
        biggest && biggest.status
          ? `${Math.max(...biggest.scores)} points · donne ${biggest.dealNumber}`
          : '—',
      alert: false,
    },
    { title: 'Coinches', value: coinches === 0 ? 'aucune' : String(coinches), alert: false },
  ]
})
</script>

<template>
  <!-- Sur PC : les maquettes validées, dessinées pour 1920 px et mises à l'échelle de l'écran -->
  <div v-if="large" class="h-full w-full overflow-y-auto bg-felt-dark text-ivory">
    <div class="px-11 pt-[22px] pb-10" :style="{ zoom: L.t }">
      <div class="flex items-center gap-2">
        <button
          v-for="t in TABS"
          :key="t.id"
          type="button"
          class="cursor-pointer rounded-full border px-3.5 py-[7px] text-[13px] transition"
          :class="
            tab === t.id
              ? 'border-gold bg-gold/20 font-semibold text-gold'
              : 'border-white/14 font-medium text-sage hover:border-white/35 hover:text-mist'
          "
          @click="tab = t.id"
        >
          {{ t.label }}
        </button>
        <BotFilter v-if="tab === 'global'" class="ml-3" />
        <span class="ml-auto text-xs text-dusk">{{ header }}</span>
        <button
          type="button"
          class="ml-4 cursor-pointer rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-semibold text-mist transition hover:border-white/35 hover:bg-white/5"
          @click="emit('close')"
        >
          {{ backLabel }}
        </button>
      </div>
      <SubTabs v-if="tab === 'game'" v-model="gameView" :options="SUB_TABS_GAME" class="mt-5 max-w-xl" />
      <SubTabs v-else v-model="globalView" :options="SUB_TABS_GLOBAL" class="mt-5 max-w-2xl" />
      <StatsGamePc v-if="tab === 'game'" :view="gameView" />
      <template v-else>
        <p v-if="!archives.length && globalView !== 'games'" class="mt-10 text-sm text-sage">
          Aucune partie terminée dans cette sélection : changez les interrupteurs ci-dessus.
        </p>
        <StatsGlobalPc v-else :archives="archives" :view="globalView" />
      </template>
    </div>
  </div>

  <div v-else class="mx-auto h-full w-full max-w-md overflow-y-auto bg-felt-dark text-ivory">
    <!-- Sur PC le contenu suit l'échelle de l'écran : à 2560 px, les textes tombaient à 11 px -->
    <div
      class="mx-auto px-5 pt-4 pb-8 max-[380px]:px-4 lg:max-w-[1180px] lg:px-10 lg:pt-8"
      :style="large ? { zoom: L.t * 1.2 } : undefined"
    >
      <div class="flex items-center gap-1.5">
        <button
          v-for="t in TABS"
          :key="t.id"
          type="button"
          class="cursor-pointer rounded-full border px-3.5 py-1.5 text-[15px] whitespace-nowrap transition max-[380px]:px-3"
          :class="
            tab === t.id
              ? 'border-gold bg-gold/20 font-semibold text-gold'
              : 'border-white/15 text-sage hover:border-white/35 hover:text-mist'
          "
          @click="tab = t.id"
        >
          {{ t.label }}
        </button>
        <button
          type="button"
          class="ml-auto shrink-0 cursor-pointer rounded-lg border border-white/15 px-2.5 py-1.5 text-[13px] font-semibold text-mist transition hover:border-white/35 hover:bg-white/5"
          @click="emit('close')"
        >
          {{ backLabel }}
        </button>
      </div>

      <StatsGlobalView v-if="tab === 'global'" />

      <template v-else>
        <div class="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-12">
          <section class="lg:col-span-2">
            <SubTabs v-model="gameView" :options="SUB_TABS_GAME" class="mt-3" />

            <div class="mt-4 flex items-end gap-3">
              <div>
                <p class="text-[13px] tracking-widest text-gold">NOUS</p>
                <p class="font-display text-5xl leading-none">{{ us }}</p>
              </div>
              <p class="pb-1 text-2xl leading-none text-dusk">·</p>
              <div>
                <p class="text-[13px] tracking-widest text-them">EUX</p>
                <p class="font-display text-5xl leading-none text-mist">{{ them }}</p>
              </div>
              <p class="ml-auto text-right text-[13px] text-sage">
                {{ dealsPlayedCount }} donne{{ dealsPlayedCount > 1 ? 's' : '' }}<br />objectif
                {{ session.game?.target ?? 1000 }}<template v-if="session.game?.blitz"> · blitz</template>
              </p>
            </div>
          </section>

          <section v-if="gameView === 'score'">
            <h2 class="mt-6 text-[15px] font-semibold">Évolution du score</h2>
            <p class="text-[13px] text-sage">Cumul après chaque donne</p>
            <!-- Un point unique ne fait pas une courbe : on attend la première donne -->
            <p v-if="session.scoreCurve.length < 2" class="mt-2 text-[15px] text-sage">
              Aucune donne terminée.
            </p>
            <template v-else>
              <svg
                viewBox="0 0 360 170"
                class="mt-2 w-full lg:max-w-[640px]"
                role="img"
                aria-label="Évolution du score"
              >
                <g stroke="rgba(255,255,255,.08)" stroke-width="1">
                  <line v-for="p in curve.tiers" :key="p.v" x1="34" :y1="p.y" x2="300" :y2="p.y" />
                </g>
                <text
                  v-for="p in curve.tiers"
                  :key="`t${p.v}`"
                  x="28"
                  :y="p.y + 3"
                  text-anchor="end"
                  font-size="12.5"
                  fill="#8fb3a4"
                >
                  {{ p.v }}
                </text>
                <!-- Numéros de donne sous l'axe ; la donne 0 est le point de départ -->
                <text
                  v-for="d in curve.deals"
                  :key="`d${d.i}`"
                  :x="d.x"
                  y="156"
                  text-anchor="middle"
                  font-size="12"
                  fill="#8fb3a4"
                >
                  {{ d.n }}
                </text>
                <text x="165" y="168" text-anchor="middle" font-size="9.5" fill="#6f8f82">donne</text>
                <polyline
                  :points="curve.us"
                  fill="none"
                  :stroke="GOLD"
                  stroke-width="2"
                  stroke-linejoin="round"
                />
                <polyline
                  :points="curve.them"
                  fill="none"
                  :stroke="BLUE"
                  stroke-width="2"
                  stroke-linejoin="round"
                />
                <circle
                  v-for="(p, i) in curve.pointsUs"
                  :key="`pn${i}`"
                  :cx="p.x"
                  :cy="p.y"
                  r="2.2"
                  :fill="GOLD"
                />
                <circle
                  v-for="(p, i) in curve.pointsThem"
                  :key="`pe${i}`"
                  :cx="p.x"
                  :cy="p.y"
                  r="2.2"
                  :fill="BLUE"
                />
                <template v-if="curve.end">
                  <text
                    :x="curve.end.x"
                    :y="curve.end.yUs + 3.5"
                    font-size="12.5"
                    font-weight="700"
                    :fill="GOLD"
                  >
                    {{ `Nous ${curve.end.us}` }}
                  </text>
                  <text
                    :x="curve.end.x"
                    :y="curve.end.yThem + 3.5"
                    font-size="12.5"
                    font-weight="700"
                    :fill="BLUE"
                  >
                    {{ `Eux ${curve.end.them}` }}
                  </text>
                </template>
              </svg>
              <div class="flex gap-4 text-[13px] text-mist">
                <span class="flex items-center gap-1.5"><span class="h-0.5 w-3 bg-gold"></span>Nous</span>
                <span class="flex items-center gap-1.5"><span class="h-0.5 w-3 bg-them"></span>Eux</span>
              </div>
            </template>
          </section>

          <section v-if="gameView === 'score'">
            <h2 class="mt-6 text-[15px] font-semibold">Momentum</h2>
            <p class="mb-2 text-[13px] text-sage">
              Points gagnés par donne, en cascade : chaque barre part de la fin de la précédente — vers le
              haut pour nous, vers le bas pour eux
            </p>
            <!-- Chaque barre porte ses points : une barre sans valeur obligeait à deviner -->
            <div v-if="momentum.barItems.length">
              <div class="relative mt-4 mb-4" :style="{ height: `${MOMENTUM_HEIGHT}px` }">
                <div
                  class="absolute inset-x-0 h-px bg-white/20"
                  :style="{ top: `${momentum.zeroY}px` }"
                ></div>
                <div class="absolute inset-0 flex gap-1">
                  <div
                    v-for="b in momentum.barItems"
                    :key="b.deal"
                    class="relative max-w-12 grow"
                    :title="`Donne ${b.deal} : ${b.points} points pour ${b.us ? 'nous' : 'eux'}`"
                  >
                    <div
                      class="absolute left-[12.5%] w-3/4 rounded-sm"
                      :class="b.us ? 'bg-gold' : 'bg-them'"
                      :style="{ top: `${b.top}px`, height: `${b.height}px` }"
                    ></div>
                    <span
                      class="absolute inset-x-0 text-center text-[12px] font-semibold tabular-nums"
                      :class="b.us ? 'text-gold' : 'text-them'"
                      :style="b.us ? { top: `${b.top - 18}px` } : { top: `${b.top + b.height + 2}px` }"
                      >{{ b.points }}</span
                    >
                  </div>
                </div>
              </div>
              <div class="flex gap-1">
                <span
                  v-for="b in momentum.barItems"
                  :key="b.deal"
                  class="max-w-12 grow text-center text-[12px] text-sage"
                  >D{{ b.deal }}</span
                >
              </div>
            </div>
            <p v-else class="text-[15px] text-sage">Aucune donne terminée.</p>
          </section>

          <section v-if="gameView === 'playing'">
            <h2 class="mt-6 mb-1 text-[15px] font-semibold">Les prises</h2>
            <!-- En-têtes : sans eux, la colonne de l'enchère moyenne n'était qu'un nombre isolé -->
            <div
              class="flex items-center gap-2.5 border-b border-white/15 pb-1 text-[12px] tracking-wider text-dusk uppercase"
            >
              <span class="w-16">Joueur</span>
              <span class="w-12">Prises</span>
              <span class="grow">Résultats</span>
              <span class="w-[72px] text-right whitespace-nowrap">Ench. moy.</span>
              <span class="w-12 text-right">Bilan</span>
            </div>
            <div
              v-for="p in takes"
              :key="p.id"
              class="flex items-center gap-2.5 border-b border-white/8 py-2"
            >
              <span class="w-16 text-[15px] font-semibold">{{ p.name }}</span>
              <span class="w-12 text-[15px] tabular-nums text-mist">{{ p.takes }}</span>
              <span class="flex grow gap-1">
                <span
                  v-for="(ok, i) in p.outcomes"
                  :key="i"
                  class="size-3.5 rounded-[3px] border"
                  :class="ok ? 'border-gold bg-gold' : 'border-gold/45'"
                  :title="ok ? 'contrat réussi' : 'contrat chuté'"
                ></span>
              </span>
              <span class="w-[72px] text-right text-[14px] tabular-nums text-sage">{{
                p.bidEntry ?? '—'
              }}</span>
              <span class="w-12 text-right text-[15px] font-bold tabular-nums" :style="{ color: p.color }">
                {{ p.balance > 0 ? '+' : '' }}{{ p.balance }}
              </span>
            </div>
            <p class="mt-2 text-[13px] leading-relaxed text-dusk">
              Carré plein = contrat réussi, creux = chuté. Le bilan est ce que la prise a rapporté à son camp,
              moins ce qu'elle a offert en chutant. Pas de pourcentage sur si peu de donnes.
            </p>
          </section>

          <section v-if="gameView === 'playing'">
            <h2 class="mt-6 mb-1 text-[15px] font-semibold">Les impasses</h2>
            <p v-if="noFinesse" class="text-[15px] text-sage">Personne n'a encore gardé un as. Ça viendra.</p>
            <template v-else>
              <div
                v-for="i in finesses"
                :key="i.id"
                class="flex items-center gap-2.5 border-b border-white/8 py-2"
              >
                <span class="w-16 text-[15px] font-semibold">{{ i.name }}</span>
                <span class="w-6 text-[15px] tabular-nums text-mist">{{ i.tried }}</span>
                <span class="grow text-[14px]">
                  <span v-if="i.made" class="text-good">{{ i.made }} réussie{{ i.made > 1 ? 's' : '' }}</span>
                  <span v-if="i.made && i.failed" class="text-dusk"> · </span>
                  <span v-if="i.failed" class="text-bad"
                    >{{ i.failed }} ratée{{ i.failed > 1 ? 's' : '' }}</span
                  >
                  <span v-if="!i.made && !i.failed" class="text-dusk">sans suite</span>
                </span>
              </div>
              <p class="mt-2 text-[13px] leading-relaxed text-dusk">
                Impasse = garder l'as de la couleur entamée alors que personne n'a coupé. L'as coupé derrière,
                c'est raté ; s'il ramasse un dix, c'est réussi.
              </p>
            </template>
          </section>

          <template v-if="gameView === 'playing'">
            <StatsGaps :players="gamePlayers" :colors="gamePlayerColors" :gaps="gameGaps" />
          </template>
          <template v-if="gameView === 'bidding'">
            <StatsBidding
              :players="gamePlayers"
              :colors="gamePlayerColors"
              :calls="gameCalls"
              :roles="gameRoles"
            />
          </template>
          <section v-if="gameView === 'playing'">
            <h2 class="mt-6 mb-1 text-[15px] font-semibold">Temps de réflexion</h2>
            <p v-if="noTimes" class="text-[15px] text-sage">Pas encore mesuré sur cette partie.</p>
            <template v-else>
              <div
                class="flex items-center gap-2.5 border-b border-white/15 pb-1 text-[12px] tracking-wider text-dusk uppercase"
              >
                <span class="w-16">Joueur</span>
                <span class="grow text-right">Annoncer</span>
                <span class="w-16 text-right">Jouer</span>
                <span class="w-16 text-right">Max</span>
              </div>
              <div
                v-for="t in thinkRows"
                :key="t.id"
                class="flex items-center gap-2.5 border-b border-white/8 py-2"
              >
                <span class="w-16 text-[15px] font-semibold">{{ t.name }}</span>
                <span class="grow text-right text-[14px] tabular-nums text-mist">{{
                  t.bid === null ? '—' : duration(t.bid)
                }}</span>
                <span class="w-16 text-right text-[14px] tabular-nums text-mist">{{
                  t.card === null ? '—' : duration(t.card)
                }}</span>
                <span class="w-16 text-right text-[14px] tabular-nums text-mist">{{
                  t.max === null ? '—' : duration(t.max)
                }}</span>
              </div>
              <p class="mt-2 text-[13px] leading-relaxed text-dusk">
                Moyennes, mesurées sur l'écran de chacun depuis que c'est à lui ; « Max » est la plus longue
                hésitation.
              </p>
            </template>
          </section>

          <StatsTimes
            v-if="gameView === 'playing'"
            :players="gamePlayers"
            :colors="gamePlayerColors"
            :times="gameTimes"
          />
          <StatsDeals
            v-if="gameView === 'deals'"
            :events="session.events"
            :seating="session.seating"
            :us="session.myTeam"
          />
          <section v-if="gameView === 'deals'" class="lg:col-span-2">
            <h2 class="mt-6 mb-2 text-[15px] font-semibold">Ce qui s'est passé</h2>
            <div class="grid grid-cols-2 gap-2.5">
              <div
                v-for="f in playedTricks"
                :key="f.title"
                class="rounded-xl border border-white/8 bg-white/5 px-3.5 py-3"
              >
                <p class="text-[13px] text-sage">{{ f.title }}</p>
                <p class="mt-1 text-[15px] font-semibold" :class="f.alert ? 'text-red-card' : 'text-ivory'">
                  {{ f.value }}
                </p>
              </div>
            </div>
          </section>
        </div>
      </template>
    </div>
  </div>
</template>
