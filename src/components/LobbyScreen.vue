<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  type PlayerId, type Seating, pairingKey, pairingsOf, partnerOf, randomSeating, teamOfPlayer,
} from '../game/players'
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
 * Table complète : ses quatre joueurs. Sinon, ceux déjà assis puis tous les autres,
 * à qui l'on peut confier un bot.
 */
const lignes = computed<PlayerId[]>(() =>
  seating.value
    ? [...seating.value]
    : [...session.present, ...roster.joueurs.filter((p) => !session.takenBy[p])],
)
const avatarClass = (p: PlayerId): string =>
  seating.value && teamOfPlayer(p, seating.value) === 1 ? 'bg-them' : 'bg-gold'

/** Les trois duos possibles entre les quatre de la table, pour choisir plutôt que subir le tirage. */
const duos = computed(() =>
  seating.value
    ? pairingsOf(seating.value).map((s) => ({
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
    class="mx-auto flex w-full max-w-md flex-col px-6 pt-14 pb-8 max-lg:min-h-full lg:my-auto lg:py-10"
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

    <ul class="flex flex-col gap-2.5">
      <li
        v-for="p in lignes"
        :key="p"
        class="flex min-h-14 items-center gap-3.5 rounded-xl border px-4"
        :class="session.takenBy[p] ? 'border-white/15 bg-white/5' : 'border-dashed border-white/15'"
      >
        <span
          class="flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-felt"
          :class="session.takenBy[p] ? avatarClass(p) : 'bg-white/10 text-mist'"
        >{{ nomDe(p).charAt(0) }}</span>
        <span class="grow font-semibold" :class="session.takenBy[p] ? '' : 'text-dusk'">
          {{ nomDe(p) }}
          <span v-if="p === session.playerId" class="text-xs text-sage">— toi</span>
        </span>
        <span v-if="estUnBot(p)" class="text-xs text-sage">{{ niveauBot(p) === 'compteur' ? 'bot ★' : 'bot' }}</span>
        <span v-if="p === dealer" class="text-xs text-gold">donneur</span>
        <!-- Indépendant du donneur : son siège peut très bien être encore libre -->
        <template v-if="!session.takenBy[p] && seatedCount < 4">
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
        </template>
      </li>
    </ul>
    <p v-if="seatedCount < 4" class="mt-2.5 text-xs text-sage">
      <span class="font-semibold text-mist">bot</span> : ne voit que sa main ·
      <span class="font-semibold text-mist">bot ★</span> : retient aussi les cartes tombées
    </p>

    <div class="grow lg:hidden"></div>

    <template v-if="session.ready">
      <button
        v-if="iAmDealer"
        type="button"
        :disabled="session.busy"
        class="mt-8 h-14 cursor-pointer rounded-xl bg-gold text-base font-bold text-felt transition enabled:hover:brightness-110 disabled:opacity-40"
        @click="session.startDeal()"
      >Distribuer</button>
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
