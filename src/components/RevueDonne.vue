<script setup lang="ts">
/**
 * Revoir une donne : les mains telles que distribuées, puis les huit plis dans l'ordre.
 * De quoi refaire la donne après coup, et comprendre une chute.
 */
import { computed, onBeforeUnmount, ref, toRaw } from 'vue'
import type { Analyse } from '../game/analyse'
import type { Card } from '../game/cards'
import type { DonneRevue } from '../game/revue'
import { type PlayerId, partnerOf, playerAtSeat, seatOf, teamOfPlayer } from '../game/players'
import { SUIT_GLYPH, isRed } from '../game/display'
import { nomDe } from '../stores/roster'
import { useSession } from '../stores/session'
import { useLargeScreen } from '../composables/useLargeScreen'
import { useTableLayout } from '../composables/useTableLayout'
import PlayingCard from './PlayingCard.vue'

const props = defineProps<{ donne: DonneRevue }>()
const emit = defineEmits<{ fermer: [] }>()
const session = useSession()
const grand = useLargeScreen()
const L = useTableLayout()

const vue = ref<'mains' | 'plis' | 'analyse'>('mains')

// --- « Aurait-on pu gagner ? » : calculé à la demande, dans un fil à part.
const analyse = ref<Analyse | null>(null)
const calcul = ref(false)
let fil: Worker | null = null
function analyser(): void {
  if (analyse.value || calcul.value) return
  calcul.value = true
  fil = new Worker(new URL('../game/analyse.worker.ts', import.meta.url), { type: 'module' })
  fil.onmessage = (e: MessageEvent<Analyse>) => {
    analyse.value = e.data
    calcul.value = false
    fil?.terminate()
    fil = null
  }
  fil.onerror = () => {
    analyse.value = { impossible: 'Le calcul a échoué.' }
    calcul.value = false
  }
  // Des objets simples : le fil ne reçoit pas les proxys réactifs.
  fil.postMessage(JSON.parse(JSON.stringify({ donne: toRaw(props.donne), seating: toRaw(session.seating) })))
}
onBeforeUnmount(() => fil?.terminate())
function ouvrir(id: 'mains' | 'plis' | 'analyse'): void {
  vue.value = id
  if (id === 'analyse') analyser()
}
const unite = computed(() => (analyse.value?.objectif === 'plis' ? 'plis' : 'points'))
const equipeDuPreneur = computed(() => {
  const t = props.donne.contrat?.taker
  if (!t) return ''
  const s = session.seating
  return `${nomDe(t)} et ${nomDe(partnerOf(t, s))}`
})
const glyphe = (c: Card): string => {
  const couleur = c.slice(-1) as 's' | 'h' | 'd' | 'c'
  const rang = c.slice(0, -1)
  const noms: Record<string, string> = { J: 'V', Q: 'D', K: 'R', A: 'A' }
  return `${noms[rang] ?? rang}${SUIT_GLYPH[couleur]}`
}

/** Nous d'abord (moi, mon partenaire), puis eux, dans l'ordre de la table. */
const ordre = computed<PlayerId[]>(() => {
  const s = session.seating
  const moi = session.playerId && s.includes(session.playerId) ? session.playerId : s[0]
  const i = seatOf(moi, s)
  return [moi, partnerOf(moi, s), playerAtSeat(i + 1, s), playerAtSeat(i + 3, s)]
})
const nous = computed(() => session.myTeam)
const couleurNom = (p: PlayerId): string =>
  teamOfPlayer(p, session.seating) === nous.value ? 'text-gold' : 'text-them'

/**
 * Sur téléphone, la main prend toute la largeur de la fenêtre (le nom passe au-dessus) :
 * à côté du nom, les cartes étaient trop petites pour se lire.
 */
const largeurMain = computed(() => (grand.value ? 64 : 48))
const pasMain = computed(() => {
  if (grand.value) return 54
  const place = Math.min(L.value.width, 448) - 24 - 40
  return Math.min(40, Math.floor((place - largeurMain.value) / 7))
})
const largeurPli = computed(() => (grand.value ? 64 : 44))

const contrat = computed(() => props.donne.contrat)
const declaration = computed(() => {
  const d = contrat.value?.declaration
  if (!d) return ''
  return d === 'sa' ? 'SA' : d === 'ta' ? 'TA' : SUIT_GLYPH[d]
})
const valeur = computed(() => {
  const c = contrat.value
  if (!c) return ''
  return c.generale ? 'Générale' : c.capot ? 'Capot' : String(c.value)
})
const atout = (card: string): boolean => {
  const d = contrat.value?.declaration
  return d === 'ta' || (d !== null && d !== undefined && d !== 'sa' && card.endsWith(d))
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 px-3 py-4"
      @click.self="emit('fermer')"
      @keydown.esc="emit('fermer')"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="revue-titre"
        class="flex max-h-full w-full max-w-md flex-col rounded-2xl border border-white/10 bg-felt-dark text-ivory shadow-2xl lg:max-w-2xl"
      >
        <div class="flex items-center gap-3 px-5 pt-4">
          <h2 id="revue-titre" class="grow font-display text-2xl leading-none">Donne {{ donne.numero }}</h2>
          <span v-if="contrat" class="flex items-center gap-1.5 text-sm">
            <span class="font-semibold">{{ nomDe(contrat.taker) }}</span>
            <span class="text-sage">·</span>
            <span class="font-bold text-gold">{{ valeur }}</span>
            <span
              class="flex h-5 min-w-5 items-center justify-center rounded-full bg-ivory px-1 text-xs leading-none font-bold"
              :class="contrat.declaration && contrat.declaration !== 'sa' && contrat.declaration !== 'ta' && isRed(contrat.declaration) ? 'text-red-card' : 'text-felt-dark'"
            >{{ declaration }}</span>
          </span>
          <button
            type="button"
            class="flex size-8 cursor-pointer items-center justify-center rounded-full text-sage transition hover:bg-white/10 hover:text-mist"
            aria-label="Fermer"
            @click="emit('fermer')"
          >✕</button>
        </div>

        <div class="mx-5 mt-3 grid grid-cols-3 gap-1 rounded-xl bg-black/25 p-1">
          <button
            v-for="o in [{ id: 'mains', label: 'Mains' }, { id: 'plis', label: 'Les 8 plis' }, { id: 'analyse', label: 'Aurait-on pu ?' }] as const"
            :key="o.id"
            type="button"
            class="h-9 cursor-pointer rounded-lg text-sm font-semibold transition"
            :class="vue === o.id ? 'bg-gold text-felt' : 'text-mist hover:bg-white/5'"
            @click="ouvrir(o.id)"
          >{{ o.label }}</button>
        </div>

        <div class="mt-3 overflow-y-auto px-5 pb-5">
          <!-- Les quatre mains, nous d'abord -->
          <div v-if="vue === 'mains' && donne.mains" class="flex flex-col gap-3">
            <div v-for="p in ordre" :key="p" class="flex flex-col gap-1 lg:flex-row lg:items-center lg:gap-3">
              <div class="flex items-baseline gap-2 lg:block lg:w-28 lg:shrink-0">
                <p class="truncate text-sm font-semibold" :class="couleurNom(p)">{{ nomDe(p) }}</p>
                <p class="text-[11px] text-sage">
                  {{ contrat?.taker === p ? 'preneur' : p === donne.donneur ? 'donneur' : '' }}
                </p>
              </div>
              <div class="relative" :style="{ width: `${largeurMain + 7 * pasMain}px`, height: `${Math.round(largeurMain * 1.44)}px` }">
                <div
                  v-for="(c, i) in donne.mains[p]"
                  :key="c"
                  class="absolute top-0"
                  :style="{ left: `${i * pasMain}px` }"
                >
                  <PlayingCard :card="c" :width="largeurMain" :trump="atout(c)" />
                </div>
              </div>
            </div>
          </div>

          <!-- Les plis, dans l'ordre de pose, la carte gagnante en évidence -->
          <div v-else-if="vue === 'plis'" class="flex flex-col gap-2.5">
            <div
              v-for="pli in donne.plis"
              :key="pli.numero"
              class="flex items-center gap-3 border-b border-white/5 pb-2.5 last:border-0"
            >
              <p class="w-9 shrink-0 text-xs font-semibold text-sage">Pli {{ pli.numero }}</p>
              <div class="flex gap-1.5">
                <div v-for="c in pli.cartes" :key="c.card" class="flex flex-col items-center gap-0.5">
                  <PlayingCard :card="c.card" :width="largeurPli" :winner="c.player === pli.gagnant" />
                  <span class="max-w-[3.25rem] truncate text-[10px]" :class="couleurNom(c.player)">{{ nomDe(c.player) }}</span>
                </div>
              </div>
              <p class="ml-auto shrink-0 text-right text-sm tabular-nums">
                <span class="font-semibold" :class="couleurNom(pli.gagnant)">+{{ pli.points + (pli.numero === 8 ? 10 : 0) }}</span>
                <span v-if="pli.numero === 8" class="block text-[10px] text-sage">dont dix de der</span>
              </p>
            </div>
          </div>

          <!-- À cartes ouvertes : le contrat était-il faisable, et où a-t-il échappé ? -->
          <div v-else-if="vue === 'analyse'" class="text-[14px] leading-relaxed">
            <p v-if="calcul" class="py-6 text-center text-sm text-sage">Calcul en cours… (quelques secondes)</p>
            <p v-else-if="analyse?.impossible" class="py-6 text-center text-sm text-sage">{{ analyse.impossible }}</p>
            <template v-else-if="analyse">
              <p
                class="rounded-xl px-4 py-3 font-semibold"
                :class="analyse.faisable ? 'bg-gold/15 text-gold' : 'bg-white/5 text-mist'"
              >
                {{ analyse.faisable ? 'Le contrat était faisable.' : 'Le contrat n\u2019était pas faisable.' }}
              </p>
              <p class="mt-3 text-mist">
                À cartes ouvertes, {{ equipeDuPreneur }} pouvaient garantir
                <b class="text-ivory">{{ analyse.garanti }} {{ unite }}</b>
                face à une défense parfaite ; il en fallait <b class="text-ivory">{{ analyse.requis }}</b>
                <template v-if="analyse.belote"> (belote comprise : 20 points de moins à faire)</template>.
              </p>
              <template v-if="analyse.tournant">
                <p class="mt-3 text-mist">
                  Il a échappé au <b class="text-ivory">pli {{ analyse.tournant.pli }}</b> :
                  {{ nomDe(analyse.tournant.joueur) }} a joué
                  <b :class="['h', 'd'].includes(analyse.tournant.carte.slice(-1)) ? 'text-[#e8786a]' : 'text-ivory'">{{ glyphe(analyse.tournant.carte) }}</b> ;
                  avec
                  <b :class="['h', 'd'].includes(analyse.tournant.mieux.slice(-1)) ? 'text-[#e8786a]' : 'text-ivory'">{{ glyphe(analyse.tournant.mieux) }}</b>,
                  il restait faisable.
                </p>
                <div class="mt-3 flex items-end gap-3">
                  <div class="flex flex-col items-center gap-1">
                  <PlayingCard :card="analyse.tournant.carte" :width="largeurPli" :dimmed="true" />
                    <span class="text-[11px] text-sage">joué</span>
                  </div>
                  <span class="pb-8 text-sage">→</span>
                  <div class="flex flex-col items-center gap-1">
                    <PlayingCard :card="analyse.tournant.mieux" :width="largeurPli" :winner="true" />
                    <span class="text-[11px] text-gold">il fallait</span>
                  </div>
                </div>
              </template>
              <p v-else-if="analyse.faisable" class="mt-3 text-mist">Et il a été fait.</p>
              <p class="mt-4 text-xs text-dusk">
                Calcul à cartes ouvertes : chacun voit les quatre mains et joue parfaitement. Une indication, pas un reproche —
                en vrai, personne ne voit les cartes des autres.
              </p>
            </template>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
