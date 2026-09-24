<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  type PlayerId, type Seating, pairingKey, pairingsOf, partnerOf, playerAtSeat, randomSeating, seatOf,
  teamOfPlayer,
} from '../game/players'
import DealerChip from './DealerChip.vue'
import { OBJECTIFS } from '../firebase/partie'
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
// Toute la hauteur de l'écran, et au plus 60 % de sa largeur : à échelle fixe, le salon
// flottait au milieu d'un grand vide.
const zoom = useFitZoom(
  contenu,
  computed(() => Math.min(L.value.t * 2.4, (L.value.width * 0.6) / 600)),
  computed(() => L.value.height - 16),
)

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
/** Haut et bas accrochés au bord de la table (26 % – 74 %), les côtés à mi-hauteur. */
const placeStyle = (place: Place): Record<string, string> =>
  place === 'haut' ? { left: '50%', bottom: '76%', transform: 'translateX(-50%)' }
    : place === 'bas' ? { left: '50%', top: '76%', transform: 'translateX(-50%)' }
      : { left: place === 'gauche' ? '12%' : '88%', top: '50%', transform: 'translate(-50%, -50%)' }
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
  <!--
    Une seule colonne, centrée. Sur PC elle prend toute la hauteur de l'écran (et au
    plus 60 % de sa largeur) : à échelle fixe, elle flottait au milieu d'un grand vide.
    Duos côte à côte, objectif et blitz sur une ligne, absents en cases : elle reste
    basse, donc large une fois mise à l'échelle.
  -->
  <div class="flex min-h-full">
  <div
    class="mx-auto flex w-full max-w-md flex-col px-6 pt-14 pb-8 [@media(max-height:820px)]:pt-8 max-lg:min-h-full lg:my-auto lg:max-w-[600px] lg:py-3"
    ref="contenu"
    :style="grand ? { zoom } : undefined"
  >
    <!-- Sur une ligne, sans en faire un titre : il suffit de pouvoir le lire aux autres -->
    <div class="flex items-baseline gap-2.5">
      <span class="text-sm text-sage">Code de la partie :</span>
      <span class="font-display text-2xl tracking-[0.15em] leading-none">{{ session.code }}</span>
      <button
        type="button"
        class="ml-auto text-[13px] text-sage underline underline-offset-4 hover:text-mist"
        @click="session.leave()"
      >quitter</button>
    </div>

    <!-- Les règles de cette partie : figées à la première donne -->
    <div class="mt-5 lg:flex lg:items-stretch lg:gap-3">
    <div class="flex items-center gap-2 lg:grow">
      <span class="w-20 text-sm text-mist lg:w-auto">En</span>
      <button
        v-for="o in OBJECTIFS"
        :key="o"
        type="button"
        :disabled="session.busy"
        class="h-9 grow cursor-pointer rounded-lg border text-sm font-semibold transition disabled:opacity-50"
        :class="(session.game?.objectif ?? 1000) === o
          ? 'border-gold bg-gold/15 text-gold'
          : 'border-white/15 text-mist hover:border-white/35'"
        @click="session.chooseOptions({ objectif: o })"
      >{{ o }}</button>
    </div>
    <label class="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-white/15 px-3.5 py-2.5 transition hover:border-white/35 lg:mt-0 lg:items-center lg:rounded-lg lg:py-0">
      <input
        type="checkbox"
        class="mt-0.5 size-4 accent-[#d9a441]"
        :checked="session.game?.blitz ?? false"
        :disabled="session.busy"
        @change="session.chooseOptions({ blitz: ($event.target as HTMLInputElement).checked })"
      />
      <span>
        <span class="block text-sm font-semibold">Blitz</span>
        <span class="block text-xs text-sage lg:hidden">
          Donne non coinchée : pas jouée, le contrat compte.
        </span>
      </span>
    </label>
    </div>

    <!--
      Les places comme à la table : moi en bas, mon partenaire en face. Haut et bas sont
      accrochés au bord de la table, avec un écart : centrées sur un pourcentage, ma
      pastille touchait le tapis.
    -->
    <div class="relative mx-auto mt-5 h-[270px] w-full max-w-[420px]">
      <div
        class="absolute inset-x-[24%] inset-y-[26%] rounded-[40%] border-[7px] border-[#33241a] shadow-[inset_0_0_0_2px_rgba(217,164,65,.22),0_10px_24px_rgba(0,0,0,.45)]"
        style="background-color: #15583f; background-image: repeating-linear-gradient(45deg, rgba(255,255,255,.028) 0 2px, transparent 2px 5px), repeating-linear-gradient(-45deg, rgba(0,0,0,.055) 0 2px, transparent 2px 5px);"
      ></div>
      <div
        v-for="place in PLACES"
        :key="place"
        class="absolute flex w-32 items-center gap-1 text-center"
        :class="place === 'haut' ? 'flex-col-reverse' : 'flex-col'"
        :style="placeStyle(place)"
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
          <span class="text-sm leading-tight font-semibold whitespace-nowrap">
            {{ nomDe(places[place]!) }}<span v-if="places[place] === session.playerId" class="text-xs text-sage"> · toi</span><span
              v-if="estUnBot(places[place]!)"
              class="text-xs font-normal text-sage"
            > · {{ niveauBot(places[place]!) === 'compteur' ? 'bot ★' : 'bot' }}</span>
          </span>
        </template>
        <span
          v-else
          class="flex size-11 items-center justify-center rounded-full border-2 border-dashed border-white/25 text-sm text-dusk"
        >?</span>
      </div>
    </div>

    <!-- Les absents : on peut confier leur place à un bot -->
    <div v-if="absents.length" class="mt-4 flex flex-col gap-2 lg:grid lg:grid-cols-3">
      <div
        v-for="p in absents"
        :key="p"
        class="flex min-h-11 items-center gap-3 rounded-xl border border-dashed border-white/15 px-3.5 lg:flex-wrap lg:gap-x-2 lg:gap-y-1.5 lg:px-3 lg:py-2"
      >
        <span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-mist">
          {{ nomDe(p).charAt(0) }}
        </span>
        <span class="grow text-sm font-semibold text-dusk lg:basis-[calc(100%-2.5rem)]">{{ nomDe(p) }}</span>
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
    <p v-if="seatedCount < 4" class="mt-2.5 text-center text-xs text-sage">
      <span class="font-semibold text-mist">bot</span> : ne voit que sa main ·
      <span class="font-semibold text-mist">bot ★</span> : retient aussi les cartes tombées
    </p>
    <p v-if="!seating" class="mt-2 text-center text-xs text-sage">
      Équipes tirées au sort dès que la table est complète.
    </p>

    <!-- La table complète : les équipes, sous la table, à choisir ou à retirer au sort -->
    <template v-if="seating">
      <p v-if="monPartenaire" class="mt-5 mb-2 text-xs text-mist">
        Tu joues avec <span class="font-semibold text-gold">{{ nomDe(monPartenaire) }}</span>.
      </p>
      <div class="flex flex-col gap-1.5 lg:grid lg:grid-cols-3">
        <button
          v-for="duo in duos"
          :key="duo.label"
          type="button"
          class="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-1.5 text-left transition lg:flex-col lg:items-start lg:gap-0"
          :class="duo.actif ? 'border-gold bg-gold/15' : 'border-white/15 hover:border-white/35 hover:bg-white/5'"
          @click="session.chooseSeating(duo.seating)"
        >
          <span class="grow text-xs font-semibold" :class="duo.actif ? 'text-gold' : 'text-mist'">
            {{ duo.label }}
          </span>
          <span class="text-[11px] text-sage">contre {{ duo.contre }}</span>
        </button>
      </div>
      <button
        type="button"
        class="mt-1.5 h-8 w-full cursor-pointer rounded-lg border border-white/15 text-xs text-mist transition hover:border-white/35 hover:bg-white/5"
        @click="seating && session.chooseSeating(randomSeating(Math.random, seating))"
      >Retirer au sort</button>
    </template>

    <div class="grow lg:hidden"></div>

    <template v-if="session.ready">
      <!-- Un bot donneur de cet onglet attend qu'on le lance : le temps de choisir les équipes -->
      <button
        v-if="iAmDealer || session.botDealerHere"
        type="button"
        :disabled="session.busy || (!iAmDealer && session.dealAcknowledged === 0)"
        class="mt-6 h-14 cursor-pointer rounded-xl bg-gold text-base font-bold text-felt transition enabled:hover:brightness-110 disabled:opacity-40"
        @click="iAmDealer ? session.startDeal() : session.continueToNextDeal()"
      >{{ iAmDealer ? 'Distribuer' : `Lancer la partie — ${dealer ? nomDe(dealer) : ''} distribue` }}</button>
      <p v-else class="mt-6 text-center text-sm text-mist">
        Tout le monde est là. {{ dealer ? nomDe(dealer) : '' }} distribue.
      </p>
    </template>
    <p v-else class="mt-6 text-center text-sm text-sage">
      En attente de {{ 4 - seatedCount }} joueur{{ 4 - seatedCount > 1 ? 's' : '' }}…
    </p>

    <p v-if="session.error" class="mt-4 text-center text-sm text-red-card">{{ session.error }}</p>
  </div>
  </div>
</template>
