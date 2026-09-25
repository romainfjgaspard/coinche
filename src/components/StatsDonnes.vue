<script setup lang="ts">
/**
 * La partie donne par donne : le contrat et son issue, et en dépliant, les enchères
 * complètes (qui a dit quoi, tour par tour) et « Revoir la donne ».
 */
import { computed, ref } from 'vue'
import type { GameEvent } from '../game/events'
import { type PlayerId, type Seating, nextPlayer, teamOfPlayer } from '../game/players'
import type { BiddingEntry } from '../game/bidding'
import { SUIT_GLYPH } from '../game/display'
import { type DonneRevue, revoirDonne } from '../game/revue'
import { nomDe } from '../stores/roster'
import RevueDonne from './RevueDonne.vue'
import AnalysePartie from './AnalysePartie.vue'
import { useSession } from '../stores/session'

const props = defineProps<{ events: GameEvent[]; seating: Seating; nous: 0 | 1 }>()
const session = useSession()

interface Ligne {
  numero: number
  donneur: PlayerId
  paroles: { player: PlayerId; texte: string; enseigne: string; rouge: boolean; coinche: boolean }[]
  contrat: { qui: string; valeur: string; enseigne: string; rouge: boolean; multiplicateur: number } | null
  issue: string
  scores: [number, number] | null
}

/** Le symbole d'une annonce, et s'il s'écrit en rouge (cœur, carreau). */
const enseigneDe = (x: string | null | undefined): { enseigne: string; rouge: boolean } =>
  !x
    ? { enseigne: '', rouge: false }
    : x === 'sa' || x === 'ta'
      ? { enseigne: x.toUpperCase(), rouge: false }
      : { enseigne: SUIT_GLYPH[x as 's' | 'h' | 'd' | 'c'], rouge: x === 'h' || x === 'd' }
const texteDe = (b: BiddingEntry): { texte: string; enseigne: string; rouge: boolean } => {
  switch (b.kind) {
    case 'passe':
      return { texte: 'Passe', enseigne: '', rouge: false }
    case 'contrat':
      return { texte: String(b.value), ...enseigneDe(b.suit) }
    case 'capot':
      return { texte: 'Capot', ...enseigneDe(b.declaration) }
    case 'generale':
      return { texte: 'Générale', ...enseigneDe(b.declaration) }
    default:
      return { texte: b.kind, enseigne: '', rouge: false }
  }
}
const ISSUE: Record<string, string> = {
  reussi: 'réussi',
  chute: 'chuté',
  capot: 'capot',
  generale: 'générale',
}

const lignes = computed<Ligne[]>(() => {
  const out: Ligne[] = []
  let courante: Ligne | null = null
  for (const e of props.events) {
    if (e.type === 'donne_commencee') {
      courante = {
        numero: e.dealNumber,
        donneur: e.dealer,
        paroles: [],
        contrat: null,
        issue: 'en cours',
        scores: null,
      }
      out.push(courante)
    } else if (!courante) continue
    else if (e.type === 'enchere')
      courante.paroles.push({ player: e.player, ...texteDe(e.entry), coinche: false })
    else if (e.type === 'coinche' || e.type === 'surcoinche') {
      courante.paroles.push({
        player: e.player,
        texte: e.type === 'coinche' ? 'Coinche' : 'Surcoinche',
        enseigne: '',
        rouge: false,
        coinche: true,
      })
    } else if (e.type === 'contrat_fixe') {
      courante.contrat = {
        qui: nomDe(e.taker),
        valeur: e.generale ? 'Générale' : e.capot ? 'Capot' : String(e.value),
        ...enseigneDe(e.declaration ?? e.trump),
        multiplicateur: e.multiplier,
      }
    } else if (e.type === 'donne_terminee') {
      courante.issue = e.blitz ? 'blitz' : (ISSUE[e.status] ?? e.status)
      courante.scores = e.scores
    } else if (e.type === 'donne_annulee') courante.issue = 'blanche'
  }
  return out.reverse()
})

const ouverte = ref<number | null>(null)
const revue = ref<DonneRevue | null>(null)
function revoir(n: number): void {
  revue.value = revoirDonne(props.events, n, props.seating)
}
/** L'ordre de parole de la donne : celui qui suit le donneur, puis le tour de table. */
const ordre = (donneur: PlayerId): PlayerId[] => {
  const premier = nextPlayer(donneur, props.seating)
  return [
    premier,
    nextPlayer(premier, props.seating),
    nextPlayer(nextPlayer(premier, props.seating), props.seating),
    donneur,
  ]
}
const couleur = (p: PlayerId): string =>
  teamOfPlayer(p, props.seating) === props.nous ? 'text-gold' : 'text-them'
</script>

<template>
  <div>
    <AnalysePartie :events="events" :seating="seating" :moi="session.playerId" :nous="nous" />
    <section>
      <h2 class="mt-5 mb-2 text-[15px] font-semibold lg:text-[15px]">Donne par donne</h2>
      <p v-if="!lignes.length" class="py-3 text-center text-[15px] lg:text-sm text-sage">
        Aucune donne pour l'instant.
      </p>
      <div v-for="l in lignes" :key="l.numero" class="border-t border-white/8">
        <button
          type="button"
          class="flex w-full cursor-pointer items-center gap-3 py-2 text-left"
          :aria-expanded="ouverte === l.numero"
          @click="ouverte = ouverte === l.numero ? null : l.numero"
        >
          <span class="w-9 shrink-0 text-[13px] lg:text-xs font-semibold text-sage">D{{ l.numero }}</span>
          <span class="grow truncate text-[15px] lg:text-[13px]">
            <template v-if="l.contrat">
              {{ l.contrat.qui }} · {{ l.contrat.valeur }}
              <span :class="l.contrat.rouge ? 'text-[#e8786a]' : ''">{{ l.contrat.enseigne }}</span>
              <span v-if="l.contrat.multiplicateur > 1" class="text-[#f0a293]">
                ×{{ l.contrat.multiplicateur }}</span
              >
            </template>
            <template v-else>{{ l.issue === 'blanche' ? 'Donne blanche' : '—' }}</template>
          </span>
          <span class="shrink-0 text-[13px] lg:text-xs text-mist">{{ l.issue }}</span>
          <span v-if="l.scores" class="w-16 shrink-0 text-right text-[15px] lg:text-[13px] tabular-nums">
            <span class="text-gold">{{ l.scores[nous] }}</span> ·
            <span class="text-them">{{ l.scores[nous === 0 ? 1 : 0] }}</span>
          </span>
          <span
            class="text-[13px] lg:text-xs text-dusk transition"
            :class="ouverte === l.numero ? 'rotate-180' : ''"
            >▼</span
          >
        </button>
        <div v-if="ouverte === l.numero" class="pb-3 pl-12">
          <!-- Les enchères, une colonne par joueur dans l'ordre de parole -->
          <div class="grid grid-cols-4 gap-x-2 text-[14px] lg:text-[12px]">
            <span
              v-for="p in ordre(l.donneur)"
              :key="p"
              class="truncate pb-1 font-semibold"
              :class="couleur(p)"
              >{{ nomDe(p) }}</span
            >
          </div>
          <div class="grid grid-cols-4 gap-x-2 gap-y-0.5 text-[14px] lg:text-[12px]">
            <span
              v-for="(pa, i) in l.paroles"
              :key="i"
              :style="{ gridColumnStart: ordre(l.donneur).indexOf(pa.player) + 1 }"
              :class="
                pa.coinche
                  ? 'font-semibold text-[#f0a293]'
                  : pa.texte === 'Passe'
                    ? 'text-sage'
                    : 'font-semibold'
              "
              >{{ pa.texte }}
              <span v-if="pa.enseigne" :class="pa.rouge ? 'text-[#e8786a]' : ''">{{
                pa.enseigne
              }}</span></span
            >
          </div>
          <button
            v-if="l.issue !== 'blitz' && l.issue !== 'blanche' && l.issue !== 'en cours'"
            type="button"
            class="mt-2.5 cursor-pointer rounded-lg border border-white/15 px-3 py-1.5 text-[13px] lg:text-xs font-semibold text-mist transition hover:border-white/35"
            @click="revoir(l.numero)"
          >
            Revoir la donne
          </button>
        </div>
      </div>
      <RevueDonne v-if="revue" :donne="revue" @fermer="revue = null" />
    </section>
  </div>
</template>
