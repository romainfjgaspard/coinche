<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  type BotLevelName,
  type PlayerId,
  type Seating,
  botId,
  isBotId,
  pairingKey,
  pairingsOf,
  partnerOf,
  playerAtSeat,
  randomSeating,
  seatOf,
  teamOfPlayer,
} from '../game/players'
import DealerChip from './DealerChip.vue'
import { TARGETS } from '../firebase/game'
import { useSession } from '../stores/session'
import { nameOf, useRoster } from '../stores/roster'
import { useLargeScreen } from '../composables/useLargeScreen'
import { useTableLayout } from '../composables/useTableLayout'
import { useFitZoom } from '../composables/useFitZoom'

const session = useSession()
const roster = useRoster()
onMounted(() => void roster.load())
const large = useLargeScreen()
const L = useTableLayout()
/** À l'échelle de l'écran, sans jamais dépasser sa hauteur. */
const content = ref<HTMLElement | null>(null)
// Toute la hauteur de l'écran, et au plus 60 % de sa largeur : à échelle fixe, le salon
// flottait au milieu d'un grand vide.
const zoom = useFitZoom(
  content,
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
type Spot = 'bottom' | 'left' | 'top' | 'right'
const SPOTS: Spot[] = ['top', 'left', 'right', 'bottom']
/** Haut et bas accrochés au bord de la table (26 % – 74 %), les côtés à mi-hauteur. */
const spotStyle = (spot: Spot): Record<string, string> =>
  spot === 'top'
    ? { left: '50%', bottom: '76%', transform: 'translateX(-50%)' }
    : spot === 'bottom'
      ? { left: '50%', top: '76%', transform: 'translateX(-50%)' }
      : { left: spot === 'left' ? '12%' : '88%', top: '50%', transform: 'translate(-50%, -50%)' }
const spots = computed<Record<Spot, PlayerId | null>>(() => {
  const me = session.playerId
  if (seating.value && me && seating.value.includes(me)) {
    const s = seatOf(me, seating.value)
    return {
      bottom: me,
      left: playerAtSeat(s + 1, seating.value),
      top: playerAtSeat(s + 2, seating.value),
      right: playerAtSeat(s + 3, seating.value),
    }
  }
  const others = session.present.filter((p) => p !== me)
  return { bottom: me, left: others[0] ?? null, top: others[1] ?? null, right: others[2] ?? null }
})
/**
 * Un bot sans nom sur une place libre. On ne propose plus la liste des absents : les
 * autres apparaissent quand ils rejoignent, un bot n'est plus « le bot de Viv ».
 */
function addBotHere(level: BotLevelName): void {
  void session.addBot(botId(level, Object.keys(session.game?.seats ?? {})), level)
}

/** Le lien de la partie : l'ouvrir remplit le code sur l'accueil. */
const link = computed(() => `${location.origin}${import.meta.env.BASE_URL}?code=${session.code ?? ''}`)
/** Copié : oui, non (on affiche alors le lien à copier à la main), ou rien à dire. */
const linkCopied = ref<boolean | null>(null)
/** La bulle d'aide du blitz, ouverte au toucher sur téléphone. */
const blitzHelp = ref(false)
/** Sur téléphone, le menu de partage du système ; sinon, le lien copié. */
async function share(): Promise<void> {
  const text = `Rejoins ma partie de coinche (code ${session.code})`
  if (typeof navigator.share === 'function' && !large.value) {
    try {
      await navigator.share({ title: 'Coinche', text: text, url: link.value })
    } catch {
      /* partage annulé */
    }
    return
  }
  linkCopied.value = await copy(link.value)
  setTimeout(() => (linkCopied.value = null), 4000)
}

/** Le presse-papiers moderne, sinon l'ancienne méthode (page non sécurisée, cadre). */
async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const field = document.createElement('textarea')
    field.value = text
    field.style.cssText = 'position:fixed;opacity:0'
    document.body.appendChild(field)
    field.select()
    const ok = document.execCommand('copy')
    field.remove()
    return ok
  }
}
/** Mon équipe en or, l'autre en bleu — comme à la table, quel que soit le numéro d'équipe. */
const avatarClass = (p: PlayerId): string => {
  const me = session.playerId
  if (!seating.value || !me || !seating.value.includes(me)) return 'bg-gold'
  return teamOfPlayer(p, seating.value) === teamOfPlayer(me, seating.value) ? 'bg-gold' : 'bg-them'
}

/** Les trois duos possibles entre les quatre de la table, pour choisir plutôt que subir le tirage. */
const duos = computed(() =>
  seating.value
    ? // Moi en tête : chaque duo se lit « Romain & … », dans le même ordre d'une partie à l'autre.
      pairingsOf(
        session.playerId && seating.value.includes(session.playerId)
          ? [
              session.playerId,
              ...seating.value
                .filter((p) => p !== session.playerId)
                .sort((a, b) => roster.players.indexOf(a) - roster.players.indexOf(b)),
            ]
          : seating.value,
      ).map((s) => ({
        seating: s,
        label: `${nameOf(s[0])} & ${nameOf(s[2])}`,
        against: `${nameOf(s[1])} & ${nameOf(s[3])}`,
        on: seating.value !== null && pairingKey(s) === pairingKey(seating.value),
      }))
    : [],
)
/** Un siège tenu par un bot : les parties concernées sortent des stats par défaut. */
const isBot = (p: PlayerId): boolean => Boolean(session.game?.seats[p]?.bot)
/** Un joueur remplacé par un bot garde son nom : on précise alors que c'est un bot. */
const botLevelOf = (p: PlayerId) => session.game?.seats[p]?.level ?? null

const myPartner = computed(() =>
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
      ref="contenu"
      class="mx-auto flex w-full max-w-md flex-col px-6 pt-14 pb-8 [@media(max-height:820px)]:pt-8 max-lg:min-h-full lg:my-auto lg:max-w-[600px] lg:py-3"
      :style="large ? { zoom } : undefined"
    >
      <!-- Sur une ligne, sans en faire un titre : il suffit de pouvoir le lire aux autres -->
      <div class="flex flex-wrap items-baseline gap-x-2.5 gap-y-1.5">
        <span class="text-base text-sage lg:text-sm">Code de la partie :</span>
        <span class="font-display text-[32px] tracking-[0.15em] leading-none lg:text-2xl">{{
          session.code
        }}</span>
        <button
          type="button"
          class="order-last basis-full cursor-pointer text-left text-[15px] text-sage underline underline-offset-4 transition hover:text-mist lg:order-none lg:basis-auto lg:self-center lg:rounded-full lg:border lg:border-white/20 lg:px-2.5 lg:py-0.5 lg:text-xs lg:font-semibold lg:text-mist lg:no-underline lg:hover:border-gold/60 lg:hover:text-gold"
          :title="link"
          @click="share"
        >
          {{ linkCopied ? 'Lien copié ✓' : 'Partager le lien' }}
        </button>
        <span
          v-if="linkCopied === false"
          class="order-last basis-full text-xs break-all text-sage select-all"
          >{{ link }}</span
        >
        <button
          type="button"
          class="ml-auto text-base text-sage underline underline-offset-4 hover:text-mist lg:text-[13px]"
          @click="session.leave()"
        >
          quitter
        </button>
      </div>

      <!-- Les règles de cette partie : figées à la première donne -->
      <div class="mt-5 lg:flex lg:items-stretch lg:gap-3">
        <div class="flex items-center gap-2 lg:grow">
          <span class="w-12 text-base text-mist lg:w-auto lg:text-sm">En</span>
          <button
            v-for="o in TARGETS"
            :key="o"
            type="button"
            :disabled="session.busy"
            class="h-12 grow cursor-pointer rounded-lg border text-[17px] font-semibold transition disabled:opacity-50 lg:h-9 lg:text-sm"
            :class="
              (session.game?.target ?? 1000) === o
                ? 'border-gold bg-gold/15 text-gold'
                : 'border-white/15 text-mist hover:border-white/35'
            "
            @click="session.chooseOptions({ target: o })"
          >
            {{ o }}
          </button>
        </div>
        <!-- Blitz : ce que c'est, dans une bulle — au survol sur PC, au toucher du « ? » sur téléphone -->
        <label
          class="group relative mt-3 flex cursor-pointer items-center gap-3 rounded-xl border border-white/15 px-3.5 py-2.5 transition hover:border-white/35 lg:mt-0 lg:rounded-lg lg:py-0"
          @mouseleave="blitzHelp = false"
        >
          <input
            type="checkbox"
            class="mt-0.5 size-4 accent-[#d9a441]"
            :checked="session.game?.blitz ?? false"
            :disabled="session.busy"
            @change="session.chooseOptions({ blitz: ($event.target as HTMLInputElement).checked })"
          />
          <span class="grow text-sm font-semibold">Blitz</span>
          <button
            type="button"
            class="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/25 text-[11px] font-bold text-sage transition hover:border-white/50 hover:text-mist"
            aria-label="Qu'est-ce que le blitz ?"
            :aria-expanded="blitzHelp"
            @click.prevent.stop="blitzHelp = !blitzHelp"
          >
            ?
          </button>
          <span
            role="tooltip"
            class="absolute top-full right-0 z-20 mt-2 w-64 rounded-xl border border-white/15 bg-felt-dark px-3.5 py-2.5 text-left text-xs leading-relaxed font-normal text-mist shadow-xl lg:group-hover:block"
            :class="blitzHelp ? 'block' : 'hidden'"
          >
            <b class="text-ivory">Blitz</b> : une donne qui n'est pas coinchée ne se joue pas. Le contrat est
            réputé réussi : le preneur marque sa valeur, et on passe à la donne suivante. Seules les donnes
            coinchées se jouent.
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
          style="
            background-color: #15583f;
            background-image:
              repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.028) 0 2px, transparent 2px 5px),
              repeating-linear-gradient(-45deg, rgba(0, 0, 0, 0.055) 0 2px, transparent 2px 5px);
          "
        ></div>
        <div
          v-for="spot in SPOTS"
          :key="spot"
          class="absolute flex w-32 items-center gap-1 text-center"
          :class="spot === 'top' ? 'flex-col-reverse' : 'flex-col'"
          :style="spotStyle(spot)"
        >
          <template v-if="spots[spot]">
            <span class="relative">
              <span
                class="flex size-11 items-center justify-center rounded-full text-base font-bold text-felt shadow-md"
                :class="avatarClass(spots[spot]!)"
                >{{ nameOf(spots[spot]!).charAt(0) }}</span
              >
              <!-- Le donneur porte le jeton, comme à une vraie table -->
              <span v-if="spots[spot] === dealer" class="absolute -right-2 -bottom-1">
                <DealerChip :size="26" />
              </span>
            </span>
            <span class="text-sm leading-tight font-semibold whitespace-nowrap">
              {{ nameOf(spots[spot]!)
              }}<span v-if="spots[spot] === session.playerId" class="text-xs text-sage"> · toi</span
              ><span
                v-if="isBot(spots[spot]!) && !isBotId(spots[spot]!)"
                class="text-xs font-normal text-sage"
              >
                · {{ botLevelOf(spots[spot]!) === 'expert' ? 'bot ★' : 'bot' }}</span
              >
            </span>
          </template>
          <span
            v-else
            class="flex size-11 items-center justify-center rounded-full border-2 border-dashed border-white/25 text-sm text-dusk"
            >?</span
          >
        </div>
      </div>

      <!-- Une place libre : on la confie à un bot, sans nom. Chaque bouton porte son explication. -->
      <div v-if="seatedCount < 4" class="mt-4 grid grid-cols-2 gap-2.5">
        <div class="flex flex-col items-center gap-1">
          <button
            type="button"
            :disabled="session.busy"
            class="h-11 w-full cursor-pointer rounded-xl border border-dashed border-white/25 text-sm font-semibold text-mist transition enabled:hover:border-gold/60 enabled:hover:text-gold disabled:opacity-40"
            @click="addBotHere('basic')"
          >
            + bot
          </button>
          <span class="text-center text-xs text-sage">soutient, tire l'atout, compte les cartes</span>
        </div>
        <div class="flex flex-col items-center gap-1">
          <button
            type="button"
            :disabled="session.busy"
            class="h-11 w-full cursor-pointer rounded-xl border border-dashed border-white/25 text-sm font-semibold text-mist transition enabled:hover:border-gold/60 enabled:hover:text-gold disabled:opacity-40"
            @click="addBotHere('expert')"
          >
            + bot ★
          </button>
          <span class="text-center text-xs text-sage">réfléchit à chaque carte, sans voir vos jeux</span>
        </div>
      </div>
      <p v-if="!seating" class="mt-3 text-center text-xs text-sage">
        Équipes tirées au sort ou choisies dès que la table est complète.
      </p>

      <!-- La table complète : les équipes, sous la table, à choisir ou à retirer au sort -->
      <template v-if="seating">
        <p v-if="myPartner" class="mt-5 mb-2 text-xs text-mist">
          Tu joues avec <span class="font-semibold text-gold">{{ nameOf(myPartner) }}</span
          >.
        </p>
        <div class="flex flex-col gap-1.5 lg:grid lg:grid-cols-3">
          <button
            v-for="duo in duos"
            :key="duo.label"
            type="button"
            class="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-1.5 text-left transition lg:flex-col lg:items-start lg:gap-0"
            :class="
              duo.on ? 'border-gold bg-gold/15' : 'border-white/15 hover:border-white/35 hover:bg-white/5'
            "
            @click="session.chooseSeating(duo.seating)"
          >
            <span class="grow text-xs font-semibold" :class="duo.on ? 'text-gold' : 'text-mist'">
              {{ duo.label }}
            </span>
            <span class="text-[11px] text-sage">contre {{ duo.against }}</span>
          </button>
        </div>
        <button
          type="button"
          class="mt-1.5 h-8 w-full cursor-pointer rounded-lg border border-white/15 text-xs text-mist transition hover:border-white/35 hover:bg-white/5"
          @click="seating && session.chooseSeating(randomSeating(Math.random, seating))"
        >
          Retirer au sort
        </button>
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
        >
          {{ iAmDealer ? 'Distribuer' : `Lancer la partie — ${dealer ? nameOf(dealer) : ''} distribue` }}
        </button>
        <p v-else class="mt-6 text-center text-sm text-mist">
          Tout le monde est là. {{ dealer ? nameOf(dealer) : '' }} distribue.
        </p>
      </template>
      <p v-else class="mt-6 text-center text-sm text-sage">
        En attente de {{ 4 - seatedCount }} joueur{{ 4 - seatedCount > 1 ? 's' : '' }}…
      </p>

      <p v-if="session.error" class="mt-4 text-center text-sm text-red-card">{{ session.error }}</p>
    </div>
  </div>
</template>
