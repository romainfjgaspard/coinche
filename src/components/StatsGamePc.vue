<script setup lang="ts">
import { bidGaps, bidDistribution, takeRoles, timesByPlayer } from '../game/statsBidding'
import { gameColors } from '../composables/playerColors'
import StatsBidding from './StatsBidding.vue'
import StatsGaps from './StatsGaps.vue'
import StatsTimes from './StatsTimes.vue'
import StatsDeals from './StatsDeals.vue'
/**
 * Statistiques de la partie en cours, sur grand écran — la maquette validée
 * « Stats — partie en cours — ordinateur ». Dessinée pour 1920 px de large ; le parent
 * la met à l'échelle de l'écran.
 */
import { computed } from 'vue'
import { type PlayerId, partnerOf, playerAtSeat, seatOf, teamOfPlayer } from '../game/players'
import { nameOf } from '../stores/roster'
import { type Timing, balance, cascade, averageBid, average, teamTallies } from '../game/stats'
import { duration } from '../game/display'
import { useSession } from '../stores/session'

const session = useSession()

const GOLD = '#d9a441'
const BLUE = '#7fa8c9'
const RED_INK = '#e2564a'
const LIGHT = '#cfe0d8'

const usTeam = computed(() => session.myTeam)
const themTeam = computed(() => (session.myTeam === 0 ? 1 : 0))
const colorOf = (p: PlayerId): string => (teamOfPlayer(p, session.seating) === usTeam.value ? GOLD : BLUE)
const name = (p: PlayerId): string => nameOf(p)

const scores = computed<[number, number]>(() => session.game?.scores ?? [0, 0])
const us = computed(() => scores.value[usTeam.value])
const them = computed(() => scores.value[themTeam.value])

/** Les joueurs de chaque camp, pour l'en-tête et le tableau par équipe. */
const teamIdxOf = (team: 0 | 1): PlayerId[] =>
  session.seating.filter((p) => teamOfPlayer(p, session.seating) === team)
const teamName = (team: 0 | 1): string => teamIdxOf(team).map(name).join(' & ')
const dealsPlayedCount = computed(() => session.dealSummaries.filter((d) => d.status !== null).length)

// --- Évolution du score : repère de 900 × 250, comme la maquette
const curve = computed(() => {
  const points = session.scoreCurve
  const n = Math.max(1, points.length - 1)
  const ceiling = Math.max(160, ...points.map((p) => Math.max(...p.scores)))
  const max = Math.ceil(ceiling / 160) * 160
  const X0 = 40
  const X1 = 886
  const Y0 = 230
  const Y1 = 16
  const x = (i: number) => X0 + (i * (X1 - X0)) / n
  const y = (v: number) => Y0 - (v / max) * (Y0 - Y1)
  const row = (t: 0 | 1) => points.map((p, i) => `${x(i).toFixed(1)},${y(p.scores[t]).toFixed(1)}`).join(' ')
  const end = points.at(-1)
  const last = points.length - 1
  // Étiquettes de fin à gauche du dernier point, comme la maquette : celle du camp en
  // tête au-dessus de sa courbe, l'autre en dessous, pour qu'elles ne se croisent jamais.
  const yU = end ? y(end.scores[usTeam.value]) : Y0
  const yT = end ? y(end.scores[themTeam.value]) : Y0
  const usOnTop = end ? end.scores[usTeam.value] >= end.scores[themTeam.value] : true
  const step = max / 4
  return {
    grid: [0, 1, 2, 3, 4].map((k) => ({ v: k * step, y: y(k * step) })),
    us: row(usTeam.value),
    them: row(themTeam.value),
    endUs: { x: x(last), y: yU, lx: x(last) - 66, ly: usOnTop ? yU - 10 : yU + 18 },
    endThem: { x: x(last), y: yT, lx: x(last) - 62, ly: usOnTop ? yT + 18 : yT - 10 },
  }
})

// --- Momentum en cascade : chaque barre part de la fin de la précédente
const MOMENTUM_HEIGHT = 240
const momentum = computed(() => {
  const c = cascade(session.momentumBars, usTeam.value)
  const hi = Math.max(0, ...c.map((b) => Math.max(b.before, b.after)))
  const lo = Math.min(0, ...c.map((b) => Math.min(b.before, b.after)))
  const y = (v: number) => ((hi - v) / Math.max(1, hi - lo)) * MOMENTUM_HEIGHT
  return {
    zeroY: y(0),
    barItems: c.map((b) => {
      const top = y(Math.max(b.before, b.after))
      return {
        n: `D${b.deal}`,
        us: b.us,
        points: b.points,
        top: top,
        height: Math.max(2, y(Math.min(b.before, b.after)) - top),
        title: `Donne ${b.deal} : ${b.points} points pour ${b.us ? 'nous' : 'eux'}`,
      }
    }),
  }
})

// --- Par équipe
const teams = computed(() => {
  const t = teamTallies(session.dealSummaries, session.seating)
  return ([usTeam.value, themTeam.value] as const).map((team) => {
    const e = t[team]
    return {
      name: `${team === usTeam.value ? 'Nous' : 'Eux'} — ${teamName(team)}`,
      color: team === usTeam.value ? GOLD : BLUE,
      cells: [
        String(e.dealsWon),
        String(e.takes),
        String(e.made),
        e.averageBid === null ? '—' : String(e.averageBid),
        `${e.coinches} / ${e.coinchesWon}`,
        String(e.shameStars),
        String(scores.value[team]),
      ],
    }
  })
})

// --- Par joueur
const takes = computed(() =>
  session.seating
    .map((p) => {
      const t = session.playerTallies.get(p)
      const outcomes = session.dealSummaries
        .filter((d) => d.taker === p && d.status !== null)
        .map((d) => d.status !== 'down')
      const b = t ? balance(t) : 0
      return {
        id: p,
        name: name(p),
        takes: t?.takes ?? 0,
        outcomes,
        bidEntry: t ? (averageBid(t) ?? '—') : '—',
        balance: `${b > 0 ? '+' : b < 0 ? '−' : ''}${Math.abs(b)}`,
        rawBalance: b,
        color: colorOf(p),
      }
    })
    .sort((a, b) => b.rawBalance - a.rawBalance),
)

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

// --- Ce qui s'est passé
const playedTricks = computed(() => {
  const list = session.dealSummaries.filter((d) => d.status !== null)
  const shameStars = list.filter((d) => d.shameStar)
  const forgets = list.filter((d) => d.beloteForgottenBy)
  const biggest = [...list].sort((a, b) => Math.max(...b.scores) - Math.max(...a.scores))[0]
  const coinched = list.filter((d) => d.coinchers.length > 0)
  const t = teamTallies(session.dealSummaries, session.seating)
  const coinchesWon = t[0].coinchesWon + t[1].coinchesWon
  const coinchesMade = t[0].coinches + t[1].coinches
  return [
    {
      title: shameStars.length > 1 ? 'Étoiles de la honte' : 'Étoile de la honte',
      value: shameStars.length ? shameStars.map((d) => name(d.shameStar!)).join(', ') : 'aucune',
      color: shameStars.length ? RED_INK : LIGHT,
      detail: shameStars.map((d) => `capot à la donne ${d.dealNumber}, annoncé ${d.value}`).join(' · '),
    },
    {
      title: forgets.length > 1 ? 'Belotes oubliées' : 'Belote oubliée',
      value: forgets.length ? forgets.map((d) => name(d.beloteForgottenBy!)).join(', ') : 'aucune',
      color: forgets.length ? RED_INK : LIGHT,
      detail: forgets.map((d) => `20 points laissés donne ${d.dealNumber}`).join(' · '),
    },
    {
      title: 'Plus grosse donne',
      value: biggest ? `${Math.max(...biggest.scores)} points` : '—',
      color: GOLD,
      detail: biggest?.taker
        ? `${name(biggest.taker)}, contrat${biggest.multiplier > 1 ? ' coinché' : ''} donne ${biggest.dealNumber}`
        : '',
    },
    {
      title: 'Coinches',
      value: coinchesMade
        ? `${coinchesMade} donnée${coinchesMade > 1 ? 's' : ''}, ${coinchesWon} gagnée${coinchesWon > 1 ? 's' : ''}`
        : 'aucune',
      color: LIGHT,
      detail: coinched.map((d) => `${d.coinchers.map(name).join(' et ')} donne ${d.dealNumber}`).join(', '),
    },
  ]
})

// --- Les sous-onglets : enchères, écarts, temps et donnes, comme sur téléphone.
defineProps<{ view: string }>()
const gamePlayers = computed<PlayerId[]>(() => {
  const t = session.seating
  const me = session.playerId && t.includes(session.playerId) ? session.playerId : t[0]
  const i = seatOf(me, t)
  return [me, partnerOf(me, t), playerAtSeat(i + 1, t), playerAtSeat(i + 3, t)]
})
const gamePlayerColors = computed(() => gameColors(gamePlayers.value))
const gameCalls = computed(() => bidDistribution(session.events))
const gameRoles = computed(() => takeRoles(session.events, session.seating))
const gameGaps = computed(() => bidGaps(session.events, session.seating))
const gameTimes = computed(() => timesByPlayer(session.events))
</script>

<template>
  <div class="mt-[26px] grid grid-cols-2 items-start gap-x-10">
    <template v-if="view === 'score'">
      <section>
        <div class="flex items-baseline gap-3.5">
          <div>
            <p class="text-[11px] tracking-[.1em] text-gold">NOUS</p>
            <p class="mt-0.5 font-display text-[46px] leading-none">{{ us }}</p>
          </div>
          <p class="text-[22px] text-dusk">·</p>
          <div>
            <p class="text-[11px] tracking-[.1em] text-them">EUX</p>
            <p class="mt-0.5 font-display text-[46px] leading-none text-mist">{{ them }}</p>
          </div>
        </div>

        <h2 class="mt-[22px] mb-0.5 text-[13px] font-semibold">Évolution du score</h2>
        <p class="mb-2 text-[11px] text-sage">Cumul après chaque donne</p>
        <p v-if="session.scoreCurve.length < 2" class="text-sm text-sage">Aucune donne terminée.</p>
        <svg
          v-else
          viewBox="0 0 900 250"
          width="100%"
          height="250"
          role="img"
          :aria-label="`Évolution du score : Nous ${us}, Eux ${them} après ${dealsPlayedCount} donnes`"
        >
          <g stroke="rgba(255,255,255,.08)" stroke-width="1">
            <line v-for="g in curve.grid" :key="g.v" x1="34" :y1="g.y" x2="886" :y2="g.y" />
          </g>
          <text
            v-for="g in curve.grid"
            :key="`t${g.v}`"
            x="28"
            :y="g.y + 4"
            text-anchor="end"
            font-size="11"
            fill="#6f8f82"
          >
            {{ g.v }}
          </text>
          <polyline
            :points="curve.us"
            fill="none"
            :stroke="GOLD"
            stroke-width="2"
            stroke-linejoin="round"
            stroke-linecap="round"
          />
          <polyline
            :points="curve.them"
            fill="none"
            :stroke="BLUE"
            stroke-width="2"
            stroke-linejoin="round"
            stroke-linecap="round"
          />
          <circle
            :cx="curve.endUs.x"
            :cy="curve.endUs.y"
            r="5"
            :fill="GOLD"
            stroke="#0a2a1f"
            stroke-width="2"
          />
          <circle
            :cx="curve.endThem.x"
            :cy="curve.endThem.y"
            r="5"
            :fill="BLUE"
            stroke="#0a2a1f"
            stroke-width="2"
          />
          <text :x="curve.endUs.lx" :y="curve.endUs.ly" font-size="13" font-weight="700" :fill="GOLD">
            {{ `Nous ${us}` }}
          </text>
          <text :x="curve.endThem.lx" :y="curve.endThem.ly" font-size="13" font-weight="700" :fill="BLUE">
            {{ `Eux ${them}` }}
          </text>
        </svg>

        <h2 class="mt-4 mb-0.5 text-[13px] font-semibold">Momentum</h2>
        <p class="mb-2 text-[11px] text-sage">
          Points gagnés par donne, en cascade : chaque barre part de la fin de la précédente — vers le haut
          pour nous, vers le bas pour eux
        </p>
        <p v-if="!momentum.barItems.length" class="text-sm text-sage">Aucune donne terminée.</p>
        <div v-else>
          <div class="relative mt-5 mb-5" :style="{ height: `${MOMENTUM_HEIGHT}px` }">
            <!-- Le zéro : au-dessus, nous menons ; en dessous, eux -->
            <div class="absolute inset-x-0 h-px bg-white/18" :style="{ top: `${momentum.zeroY}px` }"></div>
            <div class="absolute inset-0 flex gap-1">
              <div
                v-for="b in momentum.barItems"
                :key="b.n"
                class="relative max-w-[88px] grow"
                :title="b.title"
              >
                <div
                  class="absolute left-[15%] w-[70%] rounded-sm"
                  :class="b.us ? 'bg-gold' : 'bg-them'"
                  :style="{ top: `${b.top}px`, height: `${b.height}px` }"
                ></div>
                <!-- Les points au bout de la barre : au-dessus quand elle monte, dessous quand elle descend -->
                <span
                  class="absolute inset-x-0 text-center text-[11px] font-semibold tabular-nums"
                  :class="b.us ? 'text-gold' : 'text-them'"
                  :style="b.us ? { top: `${b.top - 17}px` } : { top: `${b.top + b.height + 3}px` }"
                  >{{ b.points }}</span
                >
              </div>
            </div>
          </div>
          <div class="flex gap-1">
            <span
              v-for="b in momentum.barItems"
              :key="b.n"
              class="max-w-[88px] grow text-center text-[11px] text-dusk"
              >{{ b.n }}</span
            >
          </div>
        </div>
      </section>

      <section>
        <h2 class="mb-2.5 text-[13px] font-semibold">Par équipe</h2>
        <table class="mb-[22px] w-full border-collapse text-[13px]">
          <thead>
            <tr class="text-left text-[11px] tracking-[.06em] text-sage">
              <th class="pr-[18px] pb-2 font-semibold">ÉQUIPE</th>
              <th
                v-for="c in ['DONNES GAGN.', 'PRISES', 'RÉUSSIES', 'ENCH. MOY', 'COINCHES', '★', 'SCORE']"
                :key="c"
                class="pb-2 text-right font-semibold [&:not(:last-child)]:pr-[18px]"
              >
                {{ c }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in teams" :key="e.name" class="border-t border-white/7">
              <td class="py-[11px] pr-[18px] font-semibold" :style="{ color: e.color }">{{ e.name }}</td>
              <td
                v-for="(v, i) in e.cells"
                :key="i"
                class="py-[11px] text-right text-mist tabular-nums [&:not(:last-child)]:pr-[18px]"
              >
                {{ v }}
              </td>
            </tr>
          </tbody>
        </table>

        <h2 class="mb-2.5 text-[13px] font-semibold">Par joueur, donne par donne</h2>
        <table class="w-full border-collapse text-[13px]">
          <thead>
            <tr class="text-left text-[11px] tracking-[.06em] text-sage">
              <th class="pr-[18px] pb-2 font-semibold">JOUEUR</th>
              <th class="pr-[18px] pb-2 text-right font-semibold">PRISES</th>
              <th class="pr-[18px] pb-2 font-semibold">RÉSULTAT</th>
              <th class="pr-[18px] pb-2 text-right font-semibold">ENCHÈRE MOY.</th>
              <th class="pb-2 text-right font-semibold">BILAN</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in takes" :key="p.id" class="border-t border-white/7">
              <td class="py-[11px] pr-[18px] font-semibold">{{ p.name }}</td>
              <td class="py-[11px] pr-[18px] text-right text-mist tabular-nums">{{ p.takes }}</td>
              <td class="py-[11px] pr-[18px]">
                <span class="flex gap-1">
                  <span
                    v-for="(ok, i) in p.outcomes"
                    :key="i"
                    class="size-[15px] rounded-[3px] border"
                    :class="ok ? 'border-gold bg-gold' : 'border-gold/45'"
                    :title="ok ? 'contrat réussi' : 'contrat chuté'"
                  ></span>
                </span>
              </td>
              <td class="py-[11px] pr-[18px] text-right text-mist tabular-nums">{{ p.bidEntry }}</td>
              <td class="py-[11px] text-right font-bold tabular-nums" :style="{ color: p.color }">
                {{ p.balance }}
              </td>
            </tr>
          </tbody>
        </table>
        <p class="mt-2.5 text-[11px] leading-normal text-dusk">
          Carré plein = contrat réussi, creux = chuté. Aucun pourcentage : sur deux ou trois prises, un ratio
          ne dit rien.
        </p>
      </section>
    </template>

    <template v-else-if="view === 'bidding'">
      <StatsBidding :players="gamePlayers" :colors="gamePlayerColors" :calls="gameCalls" :roles="gameRoles" />
    </template>

    <template v-else-if="view === 'playing'">
      <StatsGaps :players="gamePlayers" :colors="gamePlayerColors" :gaps="gameGaps" />
      <section>
        <h2 class="mt-6 mb-2 text-[15px] font-semibold">Temps de réflexion</h2>
        <p v-if="noTimes" class="text-sm text-sage">Pas encore mesuré sur cette partie.</p>
        <table v-else class="w-full border-collapse text-[13px]">
          <thead>
            <tr class="text-[11px] tracking-[.06em] text-sage">
              <th class="pb-2 text-left font-semibold">JOUEUR</th>
              <th class="pb-2 text-right font-semibold">POUR ANNONCER</th>
              <th class="pb-2 text-right font-semibold">POUR JOUER</th>
              <th class="pb-2 text-right font-semibold">PLUS LONGUE HÉSITATION</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in thinkRows" :key="t.id" class="border-t border-white/7">
              <td class="py-2 font-semibold">{{ t.name }}</td>
              <td class="py-2 text-right tabular-nums text-mist">
                {{ t.bid === null ? '—' : duration(t.bid) }}
              </td>
              <td class="py-2 text-right tabular-nums text-mist">
                {{ t.card === null ? '—' : duration(t.card) }}
              </td>
              <td class="py-2 text-right tabular-nums text-mist">
                {{ t.max === null ? '—' : duration(t.max) }}
              </td>
            </tr>
          </tbody>
        </table>
        <p class="mt-2 text-[11px] leading-relaxed text-dusk">
          Moyennes, mesurées sur l'écran de chacun depuis que c'est à lui. La coinche, prise hors tour, n'en a
          pas.
        </p>
      </section>
      <StatsTimes :players="gamePlayers" :colors="gamePlayerColors" :times="gameTimes" />
    </template>

    <template v-else>
      <StatsDeals :events="session.events" :seating="session.seating" :us="session.myTeam" />
      <section>
        <h2 class="mt-5 mb-2.5 text-[15px] font-semibold">Ce qui s'est passé</h2>
        <div class="grid grid-cols-2 gap-2.5">
          <div
            v-for="f in playedTricks"
            :key="f.title"
            class="rounded-[10px] border border-white/8 bg-white/4 px-3.5 py-3"
          >
            <p class="text-[11px] text-sage">{{ f.title }}</p>
            <p class="mt-1 text-[15px] font-semibold" :style="{ color: f.color }">{{ f.value }}</p>
            <p v-if="f.detail" class="mt-0.5 text-xs text-mist">{{ f.detail }}</p>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
