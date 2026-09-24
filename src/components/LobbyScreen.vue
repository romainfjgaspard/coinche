<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  type PlayerId, type Seating, pairingKey, pairingsOf, partnerOf, playerAtSeat, randomSeating, seatOf,
  teamOfPlayer,
} from '../game/players'
import DealerChip from './DealerChip.vue'
import { useSession } from '../stores/session'
import { nomDe, useRoster } from '../stores/roster'
import { useLargeScreen } from '../composables/useLargeScreen'
import { useTableLayout } from '../composables/useTableLayout'
import { useFitZoom } from '../composables/useFitZoom'

const session = useSession()
const roster = useRoster()
onMounted(() => void roster.charger())
const grand = useLargeScreen()
const L = useTableLayout()
/** À l'échelle de l'écran, sans jamais dépasser sa hauteur. */
const contenu = ref<HTMLElement | null>(null)
const zoom = useFitZoom(contenu, computed(() => L.value.t * 1.3), computed(() => L.value.height - 24))

const seatedCount = computed(() => session.present.length)
const seating = computed<Seating | null>(() => session.game?.seating ?? null)
/** Le donneur n'est tiré qu'avec le placement, quand la table est complète. */
const dealer = computed<PlayerId | null>(() => (seating.value ? (session.game?.dealer ?? null) : null))
const iAmDealer = computed(() => session.playerId !== null && session.playerId === dealer.value)
/**
 * Les quatre places, vues de mon siège comme à la table : moi en bas, mon partenaire
 * en face. Tant que la table n'est pas complète, les présents s'installent dans
 * l'ordre d'arrivée ; le placement définitif arrive avec le quatrième.
 */
type Place = 'bas' | 'gauche' | 'haut' | 'droite'
const PLACES: Place[] = ['haut', 'gauche', 'droite', 'bas']
const places = computed<Record<Place, PlayerId | null>>(() => {
  const moi = session.playerId
  if (seating.value && moi && seating.value.includes(moi)) {
    const s = seatOf(moi, seating.value)
    return {
      bas: moi,
      gauche: playerAtSeat(s + 1, seating.value),
      haut: playerAtSeat(s + 2, seating.value),
      droite: playerAtSeat(s + 3, seating.value),
    }
  }
  const autres = session.present.filter((p) => p !== moi)
  return { bas: moi, gauche: autres[0] ?? null, haut: autres[1] ?? null, droite: autres[2] ?? null }
})
/** Ceux qui ne sont pas encore là : on peut confier leur place à un bot. */
const absents = computed<PlayerId[]>(() =>
  seatedCount.value >= 4 ? [] : roster.joueurs.filter((p) => !session.takenBy[p]),
)
/** Mon équipe en or, l'autre en bleu — comme à la table, quel que soit le numéro d'équipe. */
const avatarClass = (p: PlayerId): string => {
  const moi = session.playerId
  if (!seating.value || !moi || !seating.value.includes(moi)) return 'bg-gold'
  return teamOfPlayer(p, seating.value) === teamOfPlayer(moi, seating.value) ? 'bg-gold' : 'bg-them'
}

/** Les trois duos possibles entre les quatre de la table, pour choisir plutôt que subir le tirage. */
const duos = computed(() =>
  seating.value
    // Moi en tête : chaque duo se lit « Romain & … », dans le même ordre d'une partie à l'autre.
    ? pairingsOf(
      session.playerId && seating.value.includes(session.playerId)
        ? [
          session.playerId,
          ...seating.value
            .filter((p) => p !== session.playerId)
            .sort((a, b) => roster.joueurs.indexOf(a) - roster.joueurs.indexOf(b)),
        ]
        : seating.value,
    ).map((s) => ({
        seating: s,
        label: `${nomDe(s[0])} & ${nomDe(s[2])}`,
        contre: `${nomDe(s[1])} & ${nomDe(s[3])}`,
        actif: seating.value !== null && pairingKey(s) === pairingKey(seating.value),
      }))
    : [],
)
/** Un siège tenu par un bot : les parties concernées sortent des stats par défaut. */
const estUnBot = (p: PlayerId): boolean => Boolean(session.game?.seats[p]?.bot)
/** Le niveau n'est connu que de l'onglet qui fait tourner le bot. */
const niveauBot = (p: PlayerId) => session.bots.find((b) => b.player === p)?.level ?? null

const monPartenaire = computed(() =>
  session.playerId && seating.value ? partnerOf(session.playerId, seating.value) : null,
)
</script>

<template>
  <!-- Sur PC la colonne est mise à l'échelle et centrée : à 2560 px elle faisait un sixième de l'écran -->
  <div class="flex min-h-full">
  <div
    class="mx-auto flex w-full max-w-md flex-col px-6 pt-14 pb-8 [@media(max-height:820px)]:pt-8 max-lg:min-h-full lg:my-auto lg:py-10"
    ref="contenu"
    :style="grand ? { zoom } : undefined"
  >
    <p class="text-[13px] text-sage">Code de la partie</p>
    <div class="mt-1 flex items-baseline gap-3">
      <span class="font-display text-5xl tracking-[0.18em] leading-none">{{ session.code }}</span>
      <button
        type="button"
        class="text-[13px] text-sage underline underline-offset-4 hover:text-mist"
        @click="session.leave()"
      >quitter</button>
    </div>
    <p class="mt-3 text-sm text-mist">
      Donne-le aux trois autres pour qu'ils rejoignent.
    </p>

    <h2 class="mt-8 mb-3 text-[13px] font-semibold tracking-wider text-sage uppercase">Les équipes</h2>
    <p v-if="monPartenaire" class="mb-3 text-sm text-mist">
      Tu joues avec <span class="font-semibold text-gold">{{ nomDe(monPartenaire) }}</span>.
    </p>
    <p v-if="!seating" class="text-sm text-sage">
      Tirées au sort dès que la table est complète. Tu pourras ensuite les choisir.
    </p>
    <div class="flex flex-col gap-2">
      <button
        v-for="duo in duos"
        :key="duo.label"
        type="button"
        class="flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5 text-left transition"
        :class="duo.actif ? 'border-gold bg-gold/15' : 'border-white/15 hover:border-white/35 hover:bg-white/5'"
        @click="session.chooseSeating(duo.seating)"
      >
        <span class="grow text-sm font-semibold" :class="duo.actif ? 'text-gold' : 'text-mist'">
          {{ duo.label }}
        </span>
        <span class="text-xs text-sage">contre {{ duo.contre }}</span>
      </button>
    </div>
    <button
      v-if="seating"
      type="button"
      class="mt-2 h-10 w-full cursor-pointer rounded-xl border border-white/15 text-[13px] text-mist transition hover:border-white/35 hover:bg-white/5"
      @click="seating && session.chooseSeating(randomSeating(Math.random, seating))"
    >Retirer au sort</button>

    <h2 class="mt-8 mb-3 text-[13px] font-semibold tracking-wider text-sage uppercase">
      Autour de la table — {{ seatedCount }} sur 4
    </h2>

    <!-- Les places comme à la table : moi en bas, mon partenaire en face -->
    <div class="relative mx-auto h-[290px] w-full max-w-[400px]">
      <div
        class="absolute inset-x-[25%] inset-y-[27%] rounded-[40%] border-[7px] border-[#33241a] shadow-[inset_0_0_0_2px_rgba(217,164,65,.22),0_10px_24px_rgba(0,0,0,.45)]"
        style="background-color: #15583f; background-image: repeating-linear-gradient(45deg, rgba(255,255,255,.028) 0 2px, transparent 2px 5px), repeating-linear-gradient(-45deg, rgba(0,0,0,.055) 0 2px, transparent 2px 5px);"
      ></div>
      <div
        v-for="place in PLACES"
        :key="place"
        class="absolute flex w-28 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 text-center"
        :style="{
          left: place === 'gauche' ? '12%' : place === 'droite' ? '88%' : '50%',
          top: place === 'haut' ? '12%' : place === 'bas' ? '86%' : '50%',
        }"
      >
        <template v-if="places[place]">
          <span class="relative">
            <span
              class="flex size-11 items-center justify-center rounded-full text-base font-bold text-felt shadow-md"
              :class="avatarClass(places[place]!)"
            >{{ nomDe(places[place]!).charAt(0) }}</span>
            <!-- Le donneur porte le jeton, comme à une vraie table -->
            <span v-if="places[place] === dealer" class="absolute -right-2 -bottom-1">
              <DealerChip :size="26" />
            </span>
          </span>
          <span class="text-sm leading-tight font-semibold">
            {{ nomDe(places[place]!) }}<span v-if="places[place] === session.playerId" class="text-xs text-sage"> · toi</span>
          </span>
          <span v-if="estUnBot(places[place]!)" class="text-[11px] leading-none text-sage">
            {{ niveauBot(places[place]!) === 'compteur' ? 'bot ★' : 'bot' }}
          </span>
        </template>
        <template v-else>
          <span class="flex size-11 items-center justify-center rounded-full border-2 border-dashed border-white/25 text-sm text-dusk">?</span>
          <span class="text-xs text-dusk">place libre</span>
        </template>
      </div>
    </div>

    <!-- Les absents : on peut confier leur place à un bot -->
    <div v-if="absents.length" class="mt-3 flex flex-col gap-2">
      <div
        v-for="p in absents"
        :key="p"
        class="flex min-h-11 items-center gap-3 rounded-xl border border-dashed border-white/15 px-3.5"
      >
        <span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-mist">
          {{ nomDe(p).charAt(0) }}
        </span>
        <span class="grow text-sm font-semibold text-dusk">{{ nomDe(p) }}</span>
        <button
          type="button"
          :disabled="session.busy"
          class="cursor-pointer rounded-lg border border-white/20 px-2.5 py-1 text-xs font-semibold text-mist transition enabled:hover:border-gold/60 enabled:hover:text-gold disabled:opacity-40"
          title="Un bot qui ne voit que sa propre main"
          @click="session.addBot(p, 'simple')"
        >+ bot</button>
        <button
          type="button"
          :disabled="session.busy"
          class="cursor-pointer rounded-lg border border-white/20 px-2.5 py-1 text-xs font-semibold text-mist transition enabled:hover:border-gold/60 enabled:hover:text-gold disabled:opacity-40"
          title="Le même, mais il retient les cartes déjà tombées"
          @click="session.addBot(p, 'compteur')"
        >+ bot ★</button>
      </div>
    </div>
    <p v-if="seatedCount < 4" class="mt-2.5 text-xs text-sage">
      <span class="font-semibold text-mist">bot</span> : ne voit que sa main ·
      <span class="font-semibold text-mist">bot ★</span> : retient aussi les cartes tombées
    </p>

    <div class="grow lg:hidden"></div>

    <template v-if="session.ready">
      <!-- Un bot donneur de cet onglet attend qu'on le lance : le temps de choisir les équipes -->
      <button
        v-if="iAmDealer || session.botDealerHere"
        type="button"
        :disabled="session.busy || (!iAmDealer && session.dealAcknowledged === 0)"
        class="mt-8 h-14 cursor-pointer rounded-xl bg-gold text-base font-bold text-felt transition enabled:hover:brightness-110 disabled:opacity-40"
        @click="iAmDealer ? session.startDeal() : session.continueToNextDeal()"
      >{{ iAmDealer ? 'Distribuer' : `Lancer la partie — ${dealer ? nomDe(dealer) : ''} distribue` }}</button>
      <p v-else class="mt-8 text-center text-sm text-mist">
        Tout le monde est là. {{ dealer ? nomDe(dealer) : '' }} distribue.
      </p>
    </template>
    <p v-else class="mt-8 text-center text-sm text-sage">
      En attente de {{ 4 - seatedCount }} joueur{{ 4 - seatedCount > 1 ? 's' : '' }}…
    </p>

    <p v-if="session.error" class="mt-4 text-center text-sm text-red-card">{{ session.error }}</p>
  </div>
  </div>
</template>
