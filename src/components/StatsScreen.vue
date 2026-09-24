<script setup lang="ts">
/**
 * Statistiques de la partie en cours, calculées depuis le journal — donc vivantes :
 * un événement arrive, les chiffres bougent.
 */
import { computed, onMounted, ref } from 'vue'
import { PLAYER_IDS, PLAYER_NAMES, type PlayerId, teamOfPlayer } from '../game/players'
import { bilan, enchereMoyenne } from '../game/stats'
import StatsGlobalView from './StatsGlobalView.vue'
import StatsPartiePc from './StatsPartiePc.vue'
import StatsGlobalPc from './StatsGlobalPc.vue'
import { resumeGlobal } from '../game/statsGlobal'
import { useSession } from '../stores/session'
import { useLargeScreen } from '../composables/useLargeScreen'
import { useTableLayout } from '../composables/useTableLayout'

const session = useSession()
const grand = useLargeScreen()
const L = useTableLayout()
const emit = defineEmits<{ fermer: [] }>()
const onglet = ref<'partie' | 'global'>('partie')

/*
 * Sur PC, les archives sont lues ici : l'en-tête résume toutes les parties, et le
 * choix « avec ou sans bots » s'y trouve. Rechargées à chaque ouverture.
 */
onMounted(() => { if (grand.value) void session.loadArchives() })
const avecBots = ref(false)
const partiesAvecBot = computed(() => session.archives.filter((a) => (a.bots ?? []).length > 0).length)
const archives = computed(() =>
  avecBots.value ? session.archives : session.archives.filter((a) => (a.bots ?? []).length === 0),
)
const nomCamp = (team: 0 | 1): string =>
  PLAYER_IDS.filter((p) => teamOfPlayer(p, session.seating) === team).map((p) => PLAYER_NAMES[p]).join(' & ')
/** La phrase à droite des onglets, comme sur la maquette. */
const enTete = computed(() => {
  if (onglet.value === 'partie') {
    const n = session.dealSummaries.filter((d) => d.status !== null).length
    const eux = session.myTeam === 0 ? 1 : 0
    return `${nomCamp(session.myTeam)} contre ${nomCamp(eux)} · ${n} donne${n > 1 ? 's' : ''} · objectif 1000`
  }
  const r = resumeGlobal(archives.value)
  const pl = (v: number, mot: string) => `${v} ${mot}${v > 1 ? 's' : ''}`
  const depuis = r.depuis === null
    ? ''
    : ` · depuis le ${new Date(r.depuis).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`
  return `${pl(r.parties, 'partie')} · ${pl(r.donnes, 'donne')} · ${pl(r.prises, 'prise')}${depuis}`
})
const ONGLETS = [
  { id: 'partie', label: 'Partie en cours' },
  { id: 'global', label: 'Toutes les parties' },
] as const

const OR = '#d9a441'
const BLEU = '#7fa8c9'

/** Le camp du joueur est toujours « nous » : les couleurs suivent, pas les numéros. */
const mien = (team: 0 | 1): boolean => team === session.myTeam

const scores = computed<[number, number]>(() => session.game?.scores ?? [0, 0])
const nous = computed(() => scores.value[session.myTeam])
const eux = computed(() => scores.value[session.myTeam === 0 ? 1 : 0])

/**
 * Courbe d'évolution : deux polylignes dans un repère de 360 × 170. Chaque donne
 * porte son point et son numéro, et le score final est écrit au bout des courbes :
 * un graphe sans valeurs obligeait à deviner.
 */
const courbe = computed(() => {
  const points = session.scoreCurve
  const max = Math.max(320, ...points.map((p) => Math.max(...p.scores)))
  const n = Math.max(1, points.length - 1)
  const x = (i: number): number => 34 + (i / n) * 262
  const y = (v: number): number => 140 - (v / max) * 126
  const eux = session.myTeam === 0 ? 1 : 0
  const serie = (team: 0 | 1) => points.map((p, i) => ({ x: x(i), y: y(p.scores[team]) }))
  const ligne = (team: 0 | 1): string => serie(team).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const paliers = [0, Math.round(max / 2), max]
  const dernier = points.at(-1)
  // Les deux étiquettes de fin ne doivent pas se chevaucher quand les scores sont proches.
  let yNous = dernier ? y(dernier.scores[session.myTeam]) : 0
  let yEux = dernier ? y(dernier.scores[eux]) : 0
  if (Math.abs(yNous - yEux) < 12) {
    const milieu = (yNous + yEux) / 2
    const nousDessus = dernier ? dernier.scores[session.myTeam] >= dernier.scores[eux] : true
    yNous = milieu + (nousDessus ? -6 : 6)
    yEux = milieu + (nousDessus ? 6 : -6)
  }
  // Un numéro de donne sur deux au-delà de quinze, pour qu'ils restent lisibles.
  const pas = points.length > 16 ? 2 : 1
  return {
    nous: ligne(session.myTeam),
    eux: ligne(eux),
    pointsNous: serie(session.myTeam),
    pointsEux: serie(eux),
    paliers: paliers.map((v) => ({ v, y: y(v) })),
    donnes: points.map((_, i) => ({ i, x: x(i) })).filter((d) => d.i % pas === 0),
    fin: dernier
      ? { x: x(points.length - 1) + 8, nous: dernier.scores[session.myTeam], eux: dernier.scores[eux], yNous, yEux }
      : null,
  }
})

/** Momentum : une barre par donne, vers le haut pour nous, vers le bas pour eux. */
const barres = computed(() => {
  const list = session.momentumBars
  const max = Math.max(100, ...list.map((b) => b.points))
  return list.map((b) => ({
    deal: b.deal,
    points: b.points,
    haut: mien(b.team),
    hauteur: `${Math.max(3, Math.round((b.points / max) * 72))}px`,
  }))
})

/** Les prises, joueur par joueur — sans pourcentage : trop peu de donnes. */
const prises = computed(() =>
  PLAYER_IDS.map((p) => {
    const t = session.playerTallies.get(p)
    const resultats = session.dealSummaries
      .filter((d) => d.taker === p && d.status !== null)
      .map((d) => d.status !== 'chute')
    return {
      id: p,
      nom: PLAYER_NAMES[p],
      prises: t?.prises ?? 0,
      resultats,
      enchere: t ? enchereMoyenne(t) : null,
      bilan: t ? bilan(t) : 0,
      couleur: mien(teamOfPlayer(p, session.seating)) ? OR : BLEU,
    }
  }).sort((a, b) => b.bilan - a.bilan),
)

/**
 * Les impasses : garder l'as de la couleur entamée alors que personne n'a coupé.
 * Coupé derrière, c'est raté ; s'il ramasse un dix, c'est réussi.
 */
const impasses = computed(() =>
  PLAYER_IDS.map((p) => {
    const t = session.impasseCounts.get(p)
    return {
      id: p,
      nom: PLAYER_NAMES[p],
      tentees: t?.tentees ?? 0,
      reussies: t?.reussies ?? 0,
      ratees: t?.ratees ?? 0,
    }
  }).sort((a, b) => b.tentees - a.tentees),
)

const aucuneImpasse = computed(() => impasses.value.every((i) => i.tentees === 0))

/** « Roux ×2, Viv » plutôt que « Roux, Roux, Viv ». */
function parJoueur(joueurs: PlayerId[]): string {
  const n = new Map<PlayerId, number>()
  for (const j of joueurs) n.set(j, (n.get(j) ?? 0) + 1)
  return [...n].map(([j, k]) => (k > 1 ? `${PLAYER_NAMES[j]} ×${k}` : PLAYER_NAMES[j])).join(', ')
}

const faits = computed(() => {
  const list = session.dealSummaries
  const etoiles = list.filter((d) => d.etoile)
  const oublis = list.filter((d) => d.beloteForgottenBy)
  const plusGrosse = [...list].sort(
    (a, b) => Math.max(...b.scores) - Math.max(...a.scores),
  )[0]
  const coinches = list.reduce((s, d) => s + d.coincheurs.length, 0)
  return [
    {
      titre: 'Étoiles de la honte',
      valeur: etoiles.length === 0 ? 'aucune' : parJoueur(etoiles.map((d) => d.etoile!)),
      alerte: etoiles.length > 0,
    },
    {
      titre: 'Belotes oubliées',
      valeur: oublis.length === 0 ? 'aucune' : parJoueur(oublis.map((d) => d.beloteForgottenBy!)),
      alerte: oublis.length > 0,
    },
    {
      titre: 'Plus grosse donne',
      valeur: plusGrosse && plusGrosse.status
        ? `${Math.max(...plusGrosse.scores)} points · donne ${plusGrosse.dealNumber}`
        : '—',
      alerte: false,
    },
    { titre: 'Coinches', valeur: coinches === 0 ? 'aucune' : String(coinches), alerte: false },
  ]
})
</script>

<template>
  <!-- Sur PC : les maquettes validées, dessinées pour 1920 px et mises à l'échelle de l'écran -->
  <div v-if="grand" class="h-full w-full overflow-y-auto bg-felt-dark text-ivory">
    <div class="px-11 pt-[22px] pb-10" :style="{ zoom: L.t }">
      <div class="flex items-center gap-2">
        <button
          v-for="t in ONGLETS"
          :key="t.id"
          type="button"
          class="cursor-pointer rounded-full border px-3.5 py-[7px] text-[13px] transition"
          :class="onglet === t.id
            ? 'border-gold bg-gold/20 font-semibold text-gold'
            : 'border-white/14 font-medium text-sage hover:border-white/35 hover:text-mist'"
          @click="onglet = t.id"
        >{{ t.label }}</button>
        <button
          v-if="onglet === 'global' && partiesAvecBot > 0"
          type="button"
          class="ml-3 cursor-pointer rounded-full border px-2.5 py-0.5 text-[11px]"
          :class="avecBots ? 'border-gold bg-gold/20 text-gold' : 'border-white/15 text-sage'"
          @click="avecBots = !avecBots"
        >
          {{ avecBots ? 'avec' : 'sans' }} les {{ partiesAvecBot }} partie{{ partiesAvecBot > 1 ? 's' : '' }} à bot
        </button>
        <span class="ml-auto text-xs text-dusk">{{ enTete }}</span>
        <button
          type="button"
          class="ml-4 cursor-pointer rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-semibold text-mist transition hover:border-white/35 hover:bg-white/5"
          @click="emit('fermer')"
        >Table</button>
      </div>
      <StatsPartiePc v-if="onglet === 'partie'" />
      <template v-else>
        <p v-if="!archives.length" class="mt-10 text-sm text-sage">
          {{ partiesAvecBot > 0
            ? 'Toutes les parties terminées avaient un bot à table : affichez-les avec le bouton ci-dessus.'
            : "Aucune partie terminée pour l'instant." }}
        </p>
        <StatsGlobalPc v-else :archives="archives" />
      </template>
    </div>
  </div>

  <div v-else class="mx-auto h-full w-full max-w-md overflow-y-auto bg-felt-dark text-ivory">
  <!-- Sur PC le contenu suit l'échelle de l'écran : à 2560 px, les textes tombaient à 11 px -->
  <div
    class="mx-auto px-5 pt-4 pb-8 lg:max-w-[1180px] lg:px-10 lg:pt-8"
    :style="grand ? { zoom: L.t * 1.2 } : undefined"
  >
    <div class="flex items-center gap-1.5">
      <button
        v-for="t in ([
          { id: 'partie', label: 'Partie en cours' },
          { id: 'global', label: 'Toutes les parties' },
        ] as const)"
        :key="t.id"
        type="button"
        class="cursor-pointer rounded-full border px-3.5 py-1.5 text-[13px] transition"
        :class="onglet === t.id
          ? 'border-gold bg-gold/20 font-semibold text-gold'
          : 'border-white/15 text-sage hover:border-white/35 hover:text-mist'"
        @click="onglet = t.id"
      >{{ t.label }}</button>
      <button
        type="button"
        class="ml-auto cursor-pointer rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-semibold text-mist transition hover:border-white/35 hover:bg-white/5"
        @click="emit('fermer')"
      >Table</button>
    </div>

    <StatsGlobalView v-if="onglet === 'global'" />

    <template v-else>
    <div class="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-12">
    <section class="lg:col-span-2">

    <div class="mt-4 flex items-end gap-3">
      <div>
        <p class="text-[11px] tracking-widest text-gold">NOUS</p>
        <p class="font-display text-4xl leading-none">{{ nous }}</p>
      </div>
      <p class="pb-1 text-xl leading-none text-dusk">·</p>
      <div>
        <p class="text-[11px] tracking-widest text-them">EUX</p>
        <p class="font-display text-4xl leading-none text-mist">{{ eux }}</p>
      </div>
      <p class="ml-auto text-right text-xs text-sage">
        {{ session.dealSummaries.length }} donne{{ session.dealSummaries.length > 1 ? 's' : '' }}<br>objectif 1000
      </p>
    </div>
    </section>

    <section>
    <h2 class="mt-6 text-[13px] font-semibold">Évolution du score</h2>
    <p class="text-[11px] text-sage">Cumul après chaque donne</p>
    <!-- Un point unique ne fait pas une courbe : on attend la première donne -->
    <p v-if="session.scoreCurve.length < 2" class="mt-2 text-sm text-sage">Aucune donne terminée.</p>
    <template v-else>
    <svg viewBox="0 0 360 170" class="mt-2 w-full lg:max-w-[640px]" role="img" aria-label="Évolution du score">
      <g stroke="rgba(255,255,255,.08)" stroke-width="1">
        <line v-for="p in courbe.paliers" :key="p.v" x1="34" :y1="p.y" x2="300" :y2="p.y" />
      </g>
      <text
        v-for="p in courbe.paliers"
        :key="`t${p.v}`"
        x="28" :y="p.y + 3" text-anchor="end" font-size="9" fill="#8fb3a4"
      >{{ p.v }}</text>
      <!-- Numéros de donne sous l'axe ; la donne 0 est le point de départ -->
      <text
        v-for="d in courbe.donnes"
        :key="`d${d.i}`"
        :x="d.x" y="156" text-anchor="middle" font-size="8.5" fill="#8fb3a4"
      >{{ d.i }}</text>
      <text x="165" y="168" text-anchor="middle" font-size="7.5" fill="#6f8f82">donne</text>
      <polyline :points="courbe.nous" fill="none" :stroke="OR" stroke-width="2" stroke-linejoin="round" />
      <polyline :points="courbe.eux" fill="none" :stroke="BLEU" stroke-width="2" stroke-linejoin="round" />
      <circle v-for="(p, i) in courbe.pointsNous" :key="`pn${i}`" :cx="p.x" :cy="p.y" r="2.2" :fill="OR" />
      <circle v-for="(p, i) in courbe.pointsEux" :key="`pe${i}`" :cx="p.x" :cy="p.y" r="2.2" :fill="BLEU" />
      <template v-if="courbe.fin">
        <text :x="courbe.fin.x" :y="courbe.fin.yNous + 3.5" font-size="10.5" font-weight="700" :fill="OR">
          {{ `Nous ${courbe.fin.nous}` }}
        </text>
        <text :x="courbe.fin.x" :y="courbe.fin.yEux + 3.5" font-size="10.5" font-weight="700" :fill="BLEU">
          {{ `Eux ${courbe.fin.eux}` }}
        </text>
      </template>
    </svg>
    <div class="flex gap-4 text-[11px] text-mist">
      <span class="flex items-center gap-1.5"><span class="h-0.5 w-3 bg-gold"></span>Nous</span>
      <span class="flex items-center gap-1.5"><span class="h-0.5 w-3 bg-them"></span>Eux</span>
    </div>
    </template>
    </section>

    <section>
    <h2 class="mt-6 text-[13px] font-semibold">Momentum</h2>
    <p class="mb-2 text-[11px] text-sage">
      Points gagnés par donne — vers le haut pour nous, vers le bas pour eux
    </p>
    <!-- Chaque barre porte ses points : une barre sans valeur obligeait à deviner -->
    <div v-if="barres.length" class="flex items-stretch justify-start gap-1" style="height: 200px">
      <div v-for="b in barres" :key="b.deal" class="flex max-w-12 grow flex-col items-center">
        <div class="flex h-[90px] w-full flex-col items-center justify-end">
          <template v-if="b.haut">
            <span class="mb-0.5 text-[10px] font-semibold tabular-nums text-gold">{{ b.points }}</span>
            <div
              class="w-3/4 rounded-t bg-gold"
              :style="{ height: b.hauteur }"
              :title="`Donne ${b.deal} : ${b.points} points pour nous`"
            ></div>
          </template>
        </div>
        <div class="h-px w-full bg-white/20"></div>
        <div class="flex h-[90px] w-full flex-col items-center justify-start">
          <template v-if="!b.haut">
            <div
              class="w-3/4 rounded-b bg-them"
              :style="{ height: b.hauteur }"
              :title="`Donne ${b.deal} : ${b.points} points pour eux`"
            ></div>
            <span class="mt-0.5 text-[10px] font-semibold tabular-nums text-them">{{ b.points }}</span>
          </template>
        </div>
        <span class="mt-1 text-[10px] text-sage">{{ b.deal }}</span>
      </div>
    </div>
    <p v-else class="text-sm text-sage">Aucune donne terminée.</p>
    </section>

    <section>
    <h2 class="mt-6 mb-1 text-[13px] font-semibold">Les prises</h2>
    <!-- En-têtes : sans eux, la colonne de l'enchère moyenne n'était qu'un nombre isolé -->
    <div class="flex items-center gap-2.5 border-b border-white/15 pb-1 text-[10px] tracking-wider text-dusk uppercase">
      <span class="w-16">Joueur</span>
      <span class="w-12">Prises</span>
      <span class="grow">Résultats</span>
      <span class="w-[72px] text-right whitespace-nowrap">Ench. moy.</span>
      <span class="w-12 text-right">Bilan</span>
    </div>
    <div v-for="p in prises" :key="p.id" class="flex items-center gap-2.5 border-b border-white/8 py-2">
      <span class="w-16 text-[13px] font-semibold">{{ p.nom }}</span>
      <span class="w-12 text-[13px] tabular-nums text-mist">{{ p.prises }}</span>
      <span class="flex grow gap-1">
        <span
          v-for="(ok, i) in p.resultats"
          :key="i"
          class="size-3.5 rounded-[3px] border"
          :class="ok ? 'border-gold bg-gold' : 'border-gold/45'"
          :title="ok ? 'contrat réussi' : 'contrat chuté'"
        ></span>
      </span>
      <span class="w-[72px] text-right text-[12px] tabular-nums text-sage">{{ p.enchere ?? '—' }}</span>
      <span class="w-12 text-right text-[13px] font-bold tabular-nums" :style="{ color: p.couleur }">
        {{ p.bilan > 0 ? '+' : '' }}{{ p.bilan }}
      </span>
    </div>
    <p class="mt-2 text-[11px] leading-relaxed text-dusk">
      Carré plein = contrat réussi, creux = chuté. Le bilan est ce que la prise a rapporté
      à son camp, moins ce qu'elle a offert en chutant. Pas de pourcentage sur si peu de donnes.
    </p>
    </section>

    <section>
    <h2 class="mt-6 mb-1 text-[13px] font-semibold">Les impasses</h2>
    <p v-if="aucuneImpasse" class="text-[13px] text-sage">
      Personne n'a encore gardé un as. Ça viendra.
    </p>
    <template v-else>
      <div
        v-for="i in impasses"
        :key="i.id"
        class="flex items-center gap-2.5 border-b border-white/8 py-2"
      >
        <span class="w-16 text-[13px] font-semibold">{{ i.nom }}</span>
        <span class="w-6 text-[13px] tabular-nums text-mist">{{ i.tentees }}</span>
        <span class="grow text-[12px]">
          <span v-if="i.reussies" class="text-good">{{ i.reussies }} réussie{{ i.reussies > 1 ? 's' : '' }}</span>
          <span v-if="i.reussies && i.ratees" class="text-dusk"> · </span>
          <span v-if="i.ratees" class="text-bad">{{ i.ratees }} ratée{{ i.ratees > 1 ? 's' : '' }}</span>
          <span v-if="!i.reussies && !i.ratees" class="text-dusk">sans suite</span>
        </span>
      </div>
      <p class="mt-2 text-[11px] leading-relaxed text-dusk">
        Impasse = garder l'as de la couleur entamée alors que personne n'a coupé.
        L'as coupé derrière, c'est raté ; s'il ramasse un dix, c'est réussi.
      </p>
    </template>
    </section>

    <section class="lg:col-span-2">
    <h2 class="mt-6 mb-2 text-[13px] font-semibold">Ce qui s'est passé</h2>
    <div class="grid grid-cols-2 gap-2.5">
      <div
        v-for="f in faits"
        :key="f.titre"
        class="rounded-xl border border-white/8 bg-white/5 px-3.5 py-3"
      >
        <p class="text-[11px] text-sage">{{ f.titre }}</p>
        <p class="mt-1 text-sm font-semibold" :class="f.alerte ? 'text-red-card' : 'text-ivory'">
          {{ f.valeur }}
        </p>
      </div>
    </div>
    </section>
    </div>
    </template>
  </div>
  </div>
</template>
