<script setup lang="ts">
/**
 * L'analyse de toute la partie, à la demande : chaque donne jouée passe à l'analyse
 * carte par carte, l'une après l'autre. On en tire la justesse de chacun sur la partie
 * et les plus gros tournants — les cartes qui ont coûté le plus de chances à leur camp.
 */
import { computed, ref } from 'vue'
import type { GameEvent } from '../game/events'
import type { CarteJugee, Qualite } from '../game/analyseJoueur'
import { type PlayerId, type Seating, partnerOf, playerAtSeat, seatOf, teamOfPlayer } from '../game/players'
import CarteTexte from './CarteTexte.vue'
import { revoirDonne } from '../game/revue'
import { nomDe } from '../stores/roster'
import { useAnalyseCartes } from '../composables/useAnalyseCartes'

const props = defineProps<{ events: GameEvent[]; seating: Seating; moi: PlayerId | null; nous: 0 | 1 }>()
const { fait, total, lancer } = useAnalyseCartes()

/** Les donnes qui se prêtent à l'analyse : jouées jusqu'au bout, contrat à la couleur ou capot. */
const donnes = computed(() =>
  props.events
    .filter((e) => e.type === 'donne_commencee')
    .map((e) =>
      e.type === 'donne_commencee' ? revoirDonne(props.events, e.dealNumber, props.seating) : null,
    )
    .filter((d): d is NonNullable<typeof d> =>
      Boolean(
        d &&
        d.mains &&
        d.contrat &&
        !d.blitz &&
        !d.contrat.generale &&
        (d.contrat.capot || (d.contrat.declaration !== 'sa' && d.contrat.declaration !== 'ta')),
      ),
    ),
)

const enCours = ref(false)
const donneEnCours = ref(0)
const resultats = ref<{ numero: number; jugees: CarteJugee[] }[] | null>(null)

async function analyser(): Promise<void> {
  enCours.value = true
  const out: { numero: number; jugees: CarteJugee[] }[] = []
  for (const [i, d] of donnes.value.entries()) {
    donneEnCours.value = i + 1
    const jugees = await lancer(d, props.seating)
    if (jugees) out.push({ numero: d.numero, jugees })
  }
  resultats.value = out
  enCours.value = false
}

const ORDRE: Qualite[] = ['meilleure', 'bonne', 'imprecision', 'erreur', 'gaffe']
const SYMBOLE: Record<Qualite, string> = {
  meilleure: '!',
  bonne: '✓',
  imprecision: '?!',
  erreur: '?',
  gaffe: '??',
  forcee: '—',
}
const COULEUR: Record<Qualite, string> = {
  meilleure: '#52a884',
  bonne: '#8fbf7a',
  imprecision: '#e8c86a',
  erreur: '#e0876a',
  gaffe: '#e05a48',
  forcee: '#6b7f75',
}

const joueurs = computed<PlayerId[]>(() => {
  const s = props.seating
  const moi = props.moi && s.includes(props.moi) ? props.moi : s[0]
  const i = seatOf(moi, s)
  return [moi, partnerOf(moi, s), playerAtSeat(i + 1, s), playerAtSeat(i + 3, s)]
})
const bilan = computed(() => {
  if (!resultats.value) return []
  const toutes = resultats.value.flatMap((r) => r.jugees)
  return joueurs.value.map((p) => {
    const siennes = toutes.filter((j) => j.joueur === p && j.qualite !== 'forcee')
    const compte = Object.fromEntries(
      ORDRE.map((q) => [q, siennes.filter((j) => j.qualite === q).length]),
    ) as Record<Qualite, number>
    return {
      p,
      compte,
      justes: siennes.length ? Math.round((100 * (compte.meilleure + compte.bonne)) / siennes.length) : null,
      perdues: Math.round(siennes.reduce((s, j) => s + j.perteChances, 0)),
    }
  })
})
/** Les cartes qui ont coûté le plus de chances à leur camp. */
const tournants = computed(() =>
  (resultats.value ?? [])
    .flatMap((r) => r.jugees.map((j) => ({ ...j, donne: r.numero })))
    .filter((j) => j.perteChances >= 12)
    .sort((a, b) => b.perteChances - a.perteChances)
    .slice(0, 5),
)
const couleurNom = (p: PlayerId): string =>
  teamOfPlayer(p, props.seating) === props.nous ? 'text-gold' : 'text-them'
</script>

<template>
  <section class="mt-4 rounded-xl border border-white/10 bg-white/4 px-4 py-3">
    <h2 class="text-[13px] font-semibold lg:text-[15px]">Analyse de la partie</h2>
    <template v-if="!resultats">
      <p class="mt-1 text-xs leading-relaxed text-sage">
        Chaque carte de chaque donne jugée avec ce que le joueur savait, comme aux échecs : qui joue le plus
        juste, et quelles cartes ont coûté le plus cher.
      </p>
      <button
        v-if="!enCours"
        type="button"
        :disabled="!donnes.length"
        class="mt-3 h-10 w-full cursor-pointer rounded-xl bg-gold text-sm font-bold text-felt transition enabled:hover:brightness-110 disabled:opacity-40"
        @click="analyser"
      >
        {{
          donnes.length
            ? `Analyser les ${donnes.length} donne${donnes.length > 1 ? 's' : ''} · environ ${Math.max(1, Math.round((donnes.length * 15) / 60))} min`
            : 'Aucune donne à analyser'
        }}
      </button>
      <div v-else class="mt-3">
        <div class="h-2 overflow-hidden rounded-full bg-white/10">
          <div
            class="h-full rounded-full bg-gold transition-all"
            :style="{ width: `${(100 * (donneEnCours - 1 + (total ? fait / total : 0))) / donnes.length}%` }"
          ></div>
        </div>
        <p class="mt-1.5 text-center text-xs text-sage">Donne {{ donneEnCours }} sur {{ donnes.length }}…</p>
      </div>
    </template>

    <template v-else>
      <table class="mt-2 w-full border-collapse text-[13px] tabular-nums">
        <thead>
          <tr class="text-[11px] text-sage">
            <th class="pb-1 text-left font-semibold">Joueur</th>
            <th
              v-for="q in ORDRE"
              :key="q"
              class="pb-1 text-center font-semibold"
              :style="{ color: COULEUR[q] }"
            >
              {{ SYMBOLE[q] }}
            </th>
            <th class="pb-1 text-right font-semibold">Justes</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="b in bilan" :key="b.p" class="border-t border-white/8">
            <td class="py-1.5 font-semibold" :class="couleurNom(b.p)">{{ nomDe(b.p) }}</td>
            <td
              v-for="q in ORDRE"
              :key="q"
              class="py-1.5 text-center"
              :class="b.compte[q] ? '' : 'text-dusk'"
            >
              {{ b.compte[q] }}
            </td>
            <td class="py-1.5 text-right font-semibold">{{ b.justes === null ? '—' : `${b.justes} %` }}</td>
          </tr>
        </tbody>
      </table>
      <p class="mt-1 text-[11px] text-dusk">
        ! meilleure · ✓ bonne · ?! imprécision · ? erreur · ?? gaffe · cartes forcées non comptées.
      </p>

      <h3 class="mt-3 text-[13px] font-semibold">Les tournants de la partie</h3>
      <p v-if="!tournants.length" class="mt-1 text-xs text-sage">
        Aucune carte n'a coûté plus de 12 % de chances à son camp.
      </p>
      <div
        v-for="t in tournants"
        :key="`${t.donne}-${t.carte}`"
        class="flex items-baseline gap-2 border-t border-white/8 py-1.5 text-[13px]"
      >
        <span class="w-14 shrink-0 text-xs text-sage">D{{ t.donne }} · pli {{ t.pli }}</span>
        <span class="w-14 shrink-0 truncate font-semibold" :class="couleurNom(t.joueur)">{{
          nomDe(t.joueur)
        }}</span>
        <span class="shrink-0"><CarteTexte :carte="t.carte" /></span>
        <span class="shrink-0 text-xs font-bold" :style="{ color: COULEUR[t.qualite] }"
          >−{{ Math.round(t.perteChances) }} %</span
        >
        <span v-if="t.meilleure" class="min-w-0 truncate text-xs text-mist">
          mieux : <CarteTexte :carte="t.meilleure" />
        </span>
      </div>
      <p class="mt-2 text-[11px] text-dusk">
        « −20 % » : la carte a fait perdre 20 points de chances à son camp (réussir le contrat, ou le faire
        chuter).
      </p>
    </template>
  </section>
</template>
