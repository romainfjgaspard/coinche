<script setup lang="ts">
/**
 * L'analyse carte par carte, lancée à la demande : chaque carte jugée du point de vue de
 * celui qui l'a jouée, avec ce qu'il savait (voir `analyseJoueur.ts`). Un bilan par
 * joueur, la courbe des chances du contrat au fil des cartes, puis le détail pli par pli.
 */
import { computed } from 'vue'
import type { DonneRevue } from '../game/revue'
import type { CarteJugee, Qualite } from '../game/analyseJoueur'
import { type PlayerId, type Seating, partnerOf, playerAtSeat, seatOf, teamOfPlayer } from '../game/players'
import type { Card } from '../game/cards'
import CarteTexte from './CarteTexte.vue'
import { nomDe } from '../stores/roster'
import { ECHANTILLONS, useAnalyseCartes } from '../composables/useAnalyseCartes'

const props = defineProps<{ donne: DonneRevue; seating: Seating; moi: PlayerId | null; nous: 0 | 1 }>()
const { jugees, enCours, fait, total, erreur, lancer } = useAnalyseCartes()

const QUALITES: Record<Qualite, { label: string; couleur: string; symbole: string }> = {
  meilleure: { label: 'Meilleure', couleur: '#52a884', symbole: '!' },
  bonne: { label: 'Bonne', couleur: '#8fbf7a', symbole: '✓' },
  imprecision: { label: 'Imprécision', couleur: '#e8c86a', symbole: '?!' },
  erreur: { label: 'Erreur', couleur: '#e0876a', symbole: '?' },
  gaffe: { label: 'Gaffe', couleur: '#e05a48', symbole: '??' },
  forcee: { label: 'Forcée', couleur: '#6b7f75', symbole: '—' },
}
const ORDRE_QUALITES: Qualite[] = ['meilleure', 'bonne', 'imprecision', 'erreur', 'gaffe']

const couleurNom = (p: PlayerId): string => (teamOfPlayer(p, props.seating) === props.nous ? 'text-gold' : 'text-them')

/** Moi, mon partenaire, puis les deux autres. */
const joueurs = computed<PlayerId[]>(() => {
  const s = props.seating
  const moi = props.moi && s.includes(props.moi) ? props.moi : s[0]
  const i = seatOf(moi, s)
  return [moi, partnerOf(moi, s), playerAtSeat(i + 1, s), playerAtSeat(i + 3, s)]
})

/** Par joueur : combien de cartes dans chaque catégorie, et la part de bonnes cartes. */
const bilan = computed(() => {
  if (!jugees.value) return []
  return joueurs.value.map((p) => {
    const siennes = jugees.value!.filter((j) => j.joueur === p && j.qualite !== 'forcee')
    const compte = Object.fromEntries(ORDRE_QUALITES.map((q) => [q, siennes.filter((j) => j.qualite === q).length])) as Record<Qualite, number>
    const bonnes = compte.meilleure + compte.bonne
    return { p, compte, precision: siennes.length ? Math.round((100 * bonnes) / siennes.length) : null }
  })
})

/** La courbe : les chances du contrat avant la première carte, puis après chacune. */
const W = 360
const H = 120
const courbe = computed(() => {
  const j = jugees.value
  if (!j) return null
  const premiere = j.find((x) => x.options.length > 0)
  const depart = premiere ? Math.max(...premiere.options.map((o) => o.chances)) : 50
  const valeurs: number[] = [depart]
  for (const x of j) valeurs.push(x.chancesApres >= 0 ? x.chancesApres : valeurs[valeurs.length - 1])
  const X = (i: number) => 26 + (i / (valeurs.length - 1)) * (W - 34)
  const Y = (v: number) => 8 + (1 - v / 100) * (H - 24)
  return {
    trace: valeurs.map((v, i) => `${i === 0 ? 'M' : 'L'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' '),
    points: j.map((x, i) => ({ x: X(i + 1), y: Y(valeurs[i + 1]), q: x.qualite }))
      .filter((pt) => pt.q === 'imprecision' || pt.q === 'erreur' || pt.q === 'gaffe'),
    plis: [...Array(9).keys()].map((k) => ({ k, x: X(k * 4) })),
    Y,
  }
})

const parPli = computed(() => {
  if (!jugees.value) return []
  return props.donne.plis.map((p) => ({
    numero: p.numero,
    cartes: jugees.value!.filter((j) => j.pli === p.numero),
  }))
})
const chancesDe = (j: CarteJugee, c: Card): number => Math.round(j.options.find((o) => o.carte === c)?.chances ?? 0)
</script>

<template>
  <section class="mt-5 border-t border-white/10 pt-4">
    <h3 class="text-[15px] font-semibold">Carte par carte</h3>
    <p class="mt-1 text-xs leading-relaxed text-sage">
      Chaque carte jugée avec ce que le joueur savait : sa main et les cartes tombées, pas celles des autres.
      Le critère, c'est ce qui compte au score — les chances que le contrat passe.
    </p>

    <button
      v-if="!jugees && !enCours"
      type="button"
      class="mt-3 h-11 w-full cursor-pointer rounded-xl bg-gold text-sm font-bold text-felt transition hover:brightness-110"
      @click="lancer(donne, seating)"
    >Analyser chaque carte · une dizaine de secondes</button>

    <div v-else-if="enCours" class="mt-3">
      <div class="h-2 overflow-hidden rounded-full bg-white/10">
        <div class="h-full rounded-full bg-gold transition-all" :style="{ width: `${total ? (100 * fait) / total : 0}%` }"></div>
      </div>
      <p class="mt-1.5 text-center text-xs text-sage">{{ fait }} / {{ total }} cartes · {{ ECHANTILLONS }} répartitions essayées pour chacune</p>
    </div>
    <p v-if="erreur" class="mt-3 text-sm text-red-card">{{ erreur }}</p>

    <template v-if="jugees">
      <!-- Le bilan de chacun -->
      <table class="mt-3 w-full border-collapse text-[13px] tabular-nums">
        <thead>
          <tr class="text-[11px] text-sage">
            <th class="pb-1 text-left font-semibold">Joueur</th>
            <th v-for="q in ORDRE_QUALITES" :key="q" class="pb-1 text-center font-semibold" :title="QUALITES[q].label">
              <span :style="{ color: QUALITES[q].couleur }">{{ QUALITES[q].symbole }}</span>
            </th>
            <th class="pb-1 text-right font-semibold">Justes</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="b in bilan" :key="b.p" class="border-t border-white/8">
            <td class="py-1.5 font-semibold" :class="couleurNom(b.p)">{{ nomDe(b.p) }}</td>
            <td v-for="q in ORDRE_QUALITES" :key="q" class="py-1.5 text-center" :class="b.compte[q] ? '' : 'text-dusk'">{{ b.compte[q] }}</td>
            <td class="py-1.5 text-right font-semibold">{{ b.precision === null ? '—' : `${b.precision} %` }}</td>
          </tr>
        </tbody>
      </table>
      <p class="mt-1 text-[11px] text-dusk">
        ! meilleure · ✓ bonne · ?! imprécision · ? erreur · ?? gaffe. « Justes » : la part de ses cartes (non forcées) meilleures ou bonnes.
      </p>

      <!-- Les chances du contrat au fil des cartes -->
      <h4 class="mt-4 text-[13px] font-semibold">Chances du contrat, carte après carte</h4>
      <svg v-if="courbe" :viewBox="`0 0 ${W} ${H}`" class="mt-1 w-full" role="img">
        <line v-for="v in [0, 50, 100]" :key="v" x1="26" :x2="W - 8" :y1="courbe.Y(v)" :y2="courbe.Y(v)" stroke="rgba(255,255,255,.08)" />
        <text v-for="v in [0, 50, 100]" :key="`t${v}`" x="22" :y="courbe.Y(v) + 3" text-anchor="end" font-size="8" fill="#8fa89a">{{ v }}%</text>
        <text v-for="p in courbe.plis.slice(0, 8)" :key="`p${p.k}`" :x="p.x + 2" :y="H - 4" font-size="8" fill="#8fa89a">pli {{ p.k + 1 }}</text>
        <path :d="courbe.trace" fill="none" stroke="#d9a441" stroke-width="2" stroke-linejoin="round" />
        <circle v-for="(pt, i) in courbe.points" :key="i" :cx="pt.x" :cy="pt.y" r="3.2" :fill="QUALITES[pt.q].couleur" />
      </svg>

      <!-- Pli par pli -->
      <div v-for="p in parPli" :key="p.numero" class="mt-3">
        <p class="text-xs font-semibold text-sage">Pli {{ p.numero }}</p>
        <div v-for="j in p.cartes" :key="j.carte" class="flex items-baseline gap-2 border-b border-white/5 py-1 text-[13px]">
          <span class="w-16 shrink-0 truncate font-semibold" :class="couleurNom(j.joueur)">{{ nomDe(j.joueur) }}</span>
          <span class="w-9 shrink-0"><CarteTexte :carte="j.carte" /></span>
          <span
            class="shrink-0 rounded-full px-1.5 text-[11px] font-bold"
            :style="{ color: QUALITES[j.qualite].couleur, background: `${QUALITES[j.qualite].couleur}22` }"
          >{{ QUALITES[j.qualite].label }}</span>
          <span v-if="j.meilleure" class="min-w-0 text-xs text-mist">
            mieux :
            <CarteTexte :carte="j.meilleure" />
            <span v-if="chancesDe(j, j.meilleure) !== chancesDe(j, j.carte)" class="text-sage"> · contrat {{ chancesDe(j, j.meilleure) }} % au lieu de {{ chancesDe(j, j.carte) }} %</span>
            <span v-else class="text-sage"> · {{ Math.round(j.pertePoints) }} point{{ Math.round(j.pertePoints) > 1 ? 's' : '' }} de plus en moyenne</span>
          </span>
        </div>
      </div>
      <p class="mt-3 text-xs text-dusk">
        Estimé en essayant {{ ECHANTILLONS }} répartitions des cartes cachées compatibles avec ce que le joueur savait :
        une indication fiable à quelques points près, pas une vérité absolue.
      </p>
    </template>
  </section>
</template>
