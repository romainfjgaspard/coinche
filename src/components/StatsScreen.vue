<script setup lang="ts">
/**
 * Statistiques de la partie en cours, calculées depuis le journal — donc vivantes :
 * un événement arrive, les chiffres bougent.
 */
import { computed, ref } from 'vue'
import { PLAYER_IDS, PLAYER_NAMES, teamOfPlayer } from '../game/players'
import { bilan, enchereMoyenne } from '../game/stats'
import StatsGlobalView from './StatsGlobalView.vue'
import { useSession } from '../stores/session'

const session = useSession()
const emit = defineEmits<{ fermer: [] }>()
const onglet = ref<'partie' | 'global'>('partie')

const OR = '#d9a441'
const BLEU = '#7fa8c9'

/** Le camp du joueur est toujours « nous » : les couleurs suivent, pas les numéros. */
const mien = (team: 0 | 1): boolean => team === session.myTeam

const scores = computed<[number, number]>(() => session.game?.scores ?? [0, 0])
const nous = computed(() => scores.value[session.myTeam])
const eux = computed(() => scores.value[session.myTeam === 0 ? 1 : 0])

/** Courbe d'évolution : deux polylignes dans un repère de 340 × 150. */
const courbe = computed(() => {
  const points = session.scoreCurve
  const max = Math.max(320, ...points.map((p) => Math.max(...p.scores)))
  const n = Math.max(1, points.length - 1)
  const x = (i: number): number => 30 + (i / n) * 306
  const y = (v: number): number => 140 - (v / max) * 126
  const ligne = (team: 0 | 1): string =>
    points.map((p, i) => `${x(i).toFixed(1)},${y(p.scores[team]).toFixed(1)}`).join(' ')
  const paliers = [0, Math.round(max / 2), max]
  return {
    nous: ligne(session.myTeam),
    eux: ligne(session.myTeam === 0 ? 1 : 0),
    paliers: paliers.map((v) => ({ v, y: y(v) })),
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
      valeur: etoiles.length === 0 ? 'aucune' : etoiles.map((d) => PLAYER_NAMES[d.etoile!]).join(', '),
      alerte: etoiles.length > 0,
    },
    {
      titre: 'Belotes oubliées',
      valeur: oublis.length === 0 ? 'aucune' : oublis.map((d) => PLAYER_NAMES[d.beloteForgottenBy!]).join(', '),
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
  <div class="mx-auto h-full w-full max-w-md overflow-y-auto bg-felt-dark px-5 pt-4 pb-8 text-ivory lg:max-w-[1500px] lg:px-10 lg:pt-8">
    <div class="flex items-center gap-1.5">
      <button
        v-for="t in ([
          { id: 'partie', label: 'Partie en cours' },
          { id: 'global', label: 'Toutes les parties' },
        ] as const)"
        :key="t.id"
        type="button"
        class="rounded-full border px-3.5 py-1.5 text-[13px]"
        :class="onglet === t.id
          ? 'border-gold bg-gold/20 font-semibold text-gold'
          : 'border-white/15 text-sage'"
        @click="onglet = t.id"
      >{{ t.label }}</button>
      <button
        type="button"
        class="ml-auto rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-semibold text-mist"
        @click="emit('fermer')"
      >Table</button>
    </div>

    <StatsGlobalView v-if="onglet === 'global'" />

    <template v-else>
    <div class="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-12">
    <section class="lg:col-span-2">

    <div class="mt-4 flex items-baseline gap-3">
      <div>
        <p class="text-[11px] tracking-widest text-gold">NOUS</p>
        <p class="font-display text-4xl leading-none">{{ nous }}</p>
      </div>
      <p class="text-xl text-dusk">·</p>
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
    <svg viewBox="0 0 350 160" class="mt-2 w-full lg:max-w-[620px]" role="img" aria-label="Évolution du score">
      <g stroke="rgba(255,255,255,.08)" stroke-width="1">
        <line v-for="p in courbe.paliers" :key="p.v" x1="30" :y1="p.y" x2="340" :y2="p.y" />
      </g>
      <text
        v-for="p in courbe.paliers"
        :key="`t${p.v}`"
        x="26" :y="p.y + 3" text-anchor="end" font-size="9" fill="#6f8f82"
      >{{ p.v }}</text>
      <polyline :points="courbe.nous" fill="none" :stroke="OR" stroke-width="2" stroke-linejoin="round" />
      <polyline :points="courbe.eux" fill="none" :stroke="BLEU" stroke-width="2" stroke-linejoin="round" />
    </svg>
    <div class="flex gap-4 text-[11px] text-mist">
      <span class="flex items-center gap-1.5"><span class="h-0.5 w-3 bg-gold"></span>Nous</span>
      <span class="flex items-center gap-1.5"><span class="h-0.5 w-3 bg-them"></span>Eux</span>
    </div>
    </section>

    <section>
    <h2 class="mt-6 text-[13px] font-semibold">Momentum</h2>
    <p class="mb-2 text-[11px] text-sage">
      Points gagnés par donne — vers le haut pour nous, vers le bas pour eux
    </p>
    <div v-if="barres.length" class="flex items-stretch justify-start gap-1" style="height: 170px">
      <div v-for="b in barres" :key="b.deal" class="flex max-w-12 grow flex-col items-center">
        <div class="flex h-[76px] w-full items-end justify-center">
          <div
            v-if="b.haut"
            class="w-3/4 rounded-t bg-gold"
            :style="{ height: b.hauteur }"
            :title="`Donne ${b.deal} : ${b.points} points`"
          ></div>
        </div>
        <div class="h-px w-full bg-white/20"></div>
        <div class="flex h-[76px] w-full items-start justify-center">
          <div
            v-if="!b.haut"
            class="w-3/4 rounded-b bg-them"
            :style="{ height: b.hauteur }"
            :title="`Donne ${b.deal} : ${b.points} points`"
          ></div>
        </div>
        <span class="mt-1 text-[9px] text-dusk">{{ b.deal }}</span>
      </div>
    </div>
    <p v-else class="text-sm text-sage">Aucune donne terminée.</p>
    </section>

    <section>
    <h2 class="mt-6 mb-1 text-[13px] font-semibold">Les prises</h2>
    <div v-for="p in prises" :key="p.id" class="flex items-center gap-2.5 border-b border-white/8 py-2">
      <span class="w-16 text-[13px] font-semibold">{{ p.nom }}</span>
      <span class="w-6 text-[13px] tabular-nums text-mist">{{ p.prises }}</span>
      <span class="flex grow gap-1">
        <span
          v-for="(ok, i) in p.resultats"
          :key="i"
          class="size-3.5 rounded-[3px] border"
          :class="ok ? 'border-gold bg-gold' : 'border-gold/45'"
          :title="ok ? 'contrat réussi' : 'contrat chuté'"
        ></span>
      </span>
      <span v-if="p.enchere" class="text-[11px] text-sage">{{ p.enchere }}</span>
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
</template>
