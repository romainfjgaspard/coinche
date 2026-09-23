<script setup lang="ts">
/**
 * La table vue par le joueur : lui en bas, son partenaire en face,
 * les adversaires sur les côtés. Le tapis et les cartes suivent la maquette.
 */
import { computed } from 'vue'
import PlayingCard from './PlayingCard.vue'
import CardBack from './CardBack.vue'
import PlayerChip from './PlayerChip.vue'
import type { Card } from '../game/cards'
import { SUIT_GLYPH } from '../game/display'
import { PLAYER_NAMES, type PlayerId, playerAtSeat, seatOf } from '../game/players'
import { HAND_SIZE } from '../game/deal'
import { useSession } from '../stores/session'

const session = useSession()
const emit = defineEmits<{ stats: [] }>()

const me = computed<PlayerId>(() => session.playerId ?? 'romain')
const around = computed(() => {
  const places = session.seating
  const moi = seatOf(me.value, places)
  return {
    left: playerAtSeat(moi + 1, places),
    top: playerAtSeat(moi + 2, places),
    right: playerAtSeat(moi + 3, places),
  }
})

/** Cartes restantes d'un adversaire : ce qu'il n'a pas encore posé. */
function remaining(player: PlayerId): number {
  const st = session.play
  if (!st) return HAND_SIZE
  const played = [...st.completed.flatMap((t) => t.plays), ...st.current]
    .filter((p) => p.player === player).length
  return HAND_SIZE - played
}

const contract = computed(() => {
  const r = session.biddingResult
  return r && r.status === 'contrat' ? r : null
})

/** Le pli en cours, rangé par position autour de la table. */
const trickAt = computed(() => {
  const map: Partial<Record<'me' | 'left' | 'top' | 'right', Card>> = {}
  for (const p of session.play?.current ?? []) {
    if (p.player === me.value) map.me = p.card
    else if (p.player === around.value.left) map.left = p.card
    else if (p.player === around.value.top) map.top = p.card
    else if (p.player === around.value.right) map.right = p.card
  }
  return map
})

const isTrump = (card: Card): boolean => {
  // Pendant les enchères il n'y a pas d'atout : sans cette garde, `endsWith('')`
  // marquerait toute la main.
  const trump = contract.value?.trump
  return trump != null && card.endsWith(trump)
}

const canPlay = (card: Card): boolean =>
  session.myPlayTurn && session.playable.includes(card)

const starsOf = (p: PlayerId): number => session.stars.get(p) ?? 0
</script>

<template>
  <div class="relative h-full overflow-hidden bg-[#071d15] text-ivory">
    <!-- Tapis : feutre tissé, rebord de bois, liseré cousu -->
    <div
      class="absolute rounded-[50%] border-[13px] border-[#33241a] shadow-[inset_0_0_0_3px_rgba(217,164,65,.22),inset_0_26px_64px_rgba(0,0,0,.3),0_22px_54px_rgba(0,0,0,.55)]"
      style="
        top: 12%; left: -16%; right: -16%; bottom: 20%;
        background-color: #15583f;
        background-image:
          repeating-linear-gradient(45deg, rgba(255,255,255,.028) 0 2px, transparent 2px 5px),
          repeating-linear-gradient(-45deg, rgba(0,0,0,.055) 0 2px, transparent 2px 5px);
      "
    ></div>
    <div
      class="absolute rounded-[50%] border border-dashed border-gold/30"
      style="top: 15%; left: -12%; right: -12%; bottom: 23%;"
    ></div>

    <!-- Bandeau : donne, scores -->
    <header class="absolute inset-x-0 top-0 flex h-14 items-center gap-3 bg-felt-dark px-4">
      <span class="text-xs font-medium tracking-wider text-sage">
        DONNE {{ session.game?.dealNumber ?? 0 }}
      </span>
      <div class="flex grow items-baseline justify-center gap-2.5">
        <span class="text-[13px] font-semibold text-gold">Nous</span>
        <span class="font-display text-2xl leading-none">
          {{ session.game?.scores[session.myTeam] ?? 0 }}
        </span>
        <span class="text-[13px] text-dusk">·</span>
        <span class="font-display text-2xl leading-none text-mist">
          {{ session.game?.scores[session.myTeam === 0 ? 1 : 0] ?? 0 }}
        </span>
        <span class="text-[13px] font-semibold text-them">Eux</span>
      </div>
      <button
        type="button"
        class="shrink-0 cursor-pointer rounded-lg border border-white/15 px-2.5 py-1 text-xs font-semibold text-mist"
        @click="emit('stats')"
      >Stats</button>
    </header>

    <!-- Contrat en cours -->
    <div v-if="contract" class="absolute inset-x-0 top-16 flex justify-center">
      <div class="flex items-center gap-2 rounded-full border border-gold/50 bg-gold/15 px-3.5 py-1">
        <span class="text-sm font-bold text-gold">{{ contract.value }}</span>
        <span class="text-base" :class="contract.trump === 'h' || contract.trump === 'd' ? 'text-red-card' : 'text-felt-dark'">
          {{ contract.trump ? SUIT_GLYPH[contract.trump] : (contract.declaration === 'sa' ? 'SA' : 'TA') }}
        </span>
        <span class="text-xs text-mist">par {{ PLAYER_NAMES[contract.taker] }}</span>
      </div>
    </div>

    <!-- Partenaire, en face -->
    <div class="absolute inset-x-0 top-28 flex flex-col items-center gap-1.5">
      <div class="flex">
        <CardBack v-for="i in remaining(around.top)" :key="i" :width="26" class="-ml-2.5" />
      </div>
      <PlayerChip
        :player="around.top" :dealer="session.game?.dealer === around.top"
        :active="session.toPlay === around.top || session.toBid === around.top"
        :stars="starsOf(around.top)"
      />
    </div>

    <!-- Adversaires, sur les côtés -->
    <div class="absolute left-2 top-1/2 flex -translate-y-1/2 flex-col items-center gap-1.5">
      <div class="flex flex-col">
        <CardBack v-for="i in remaining(around.left)" :key="i" :width="26" rotated class="-mt-2.5" />
      </div>
      <PlayerChip
        :player="around.left" :dealer="session.game?.dealer === around.left"
        :active="session.toPlay === around.left || session.toBid === around.left"
        :stars="starsOf(around.left)"
      />
    </div>
    <div class="absolute right-2 top-1/2 flex -translate-y-1/2 flex-col items-center gap-1.5">
      <div class="flex flex-col">
        <CardBack v-for="i in remaining(around.right)" :key="i" :width="26" rotated class="-mt-2.5" />
      </div>
      <PlayerChip
        :player="around.right" :dealer="session.game?.dealer === around.right"
        :active="session.toPlay === around.right || session.toBid === around.right"
        :stars="starsOf(around.right)"
      />
    </div>

    <!-- Le pli en cours -->
    <div class="absolute left-1/2 top-1/2 size-52 -translate-x-1/2 -translate-y-1/2">
      <div class="absolute left-1/2 top-0 -translate-x-1/2">
        <PlayingCard v-if="trickAt.top" :card="trickAt.top" :width="54" />
      </div>
      <div class="absolute left-0 top-1/2 -translate-y-1/2">
        <PlayingCard v-if="trickAt.left" :card="trickAt.left" :width="54" />
      </div>
      <div class="absolute right-0 top-1/2 -translate-y-1/2">
        <PlayingCard v-if="trickAt.right" :card="trickAt.right" :width="54" />
      </div>
      <div class="absolute bottom-0 left-1/2 -translate-x-1/2">
        <PlayingCard v-if="trickAt.me" :card="trickAt.me" :width="54" />
        <span
          v-else-if="session.myPlayTurn"
          class="block h-[78px] w-[54px] rounded-lg border-2 border-dashed border-gold/50 bg-black/10"
        ></span>
      </div>
    </div>

    <!-- Moi -->
    <div class="absolute inset-x-0 bottom-[184px] flex items-center justify-center gap-2">
      <PlayerChip
        :player="me" :dealer="session.game?.dealer === me" :active="session.myPlayTurn"
        :stars="starsOf(me)" me
      />
      <span v-if="session.myPlayTurn" class="text-[13px] font-semibold text-gold">à toi de jouer</span>
    </div>

    <div data-testid="main" class="absolute inset-x-0 bottom-[92px] flex h-32 items-end justify-center px-2">
      <div v-for="card in session.hand" :key="card" class="relative -ml-2.5 first:ml-0">
        <PlayingCard
          :card="card"
          :width="54"
          :dimmed="session.myPlayTurn && !canPlay(card)"
          :trump="isTrump(card)"
          :clickable="canPlay(card)"
          @select="session.playTheCard($event)"
        />
        <!-- BEL-2 : l'annonce est un geste volontaire. Sans ce clic, la belote est perdue. -->
        <button
          v-if="canPlay(card) && session.beloteCards.includes(card)"
          type="button"
          :aria-label="`Jouer en annonçant la belote`"
          title="Annoncer la belote"
          class="absolute -top-2 -right-1 flex size-6 items-center justify-center rounded-full border border-felt bg-gold text-[11px] font-bold text-felt shadow-md"
          @click.stop="session.playTheCard(card, true)"
        >B</button>
      </div>
    </div>

    <!-- Bande d'information : dernier pli et plis gagnés -->
    <footer class="absolute inset-x-0 bottom-0 flex h-[84px] items-center gap-3.5 bg-felt-dark px-3.5 py-2.5">
      <div class="flex flex-col gap-1.5">
        <span class="text-[9px] tracking-widest text-dusk">DERNIER PLI</span>
        <div v-if="session.lastTrick" class="flex items-end">
          <PlayingCard
            v-for="p in session.lastTrick.plays"
            :key="p.card"
            :card="p.card"
            :width="30"
            class="-ml-1.5"
            :winner="p.player === session.lastTrick.winner"
          />
        </div>
        <span v-else class="text-[10px] text-sage">aucun pli joué</span>
        <span v-if="session.lastTrick" class="text-[10px] text-sage">
          pris par <span class="font-semibold text-gold">{{ PLAYER_NAMES[session.lastTrick.winner] }}</span>
        </span>
      </div>

      <div class="flex grow flex-col gap-1.5">
        <span class="text-[9px] tracking-widest text-dusk">PLIS DE LA DONNE</span>
        <div
          v-for="(row, i) in [
            { team: 'Nous', count: session.trickCounts[session.myTeam], color: 'text-gold' },
            { team: 'Eux', count: session.trickCounts[session.myTeam === 0 ? 1 : 0], color: 'text-them' },
          ]"
          :key="i"
          class="flex items-center gap-2"
        >
          <span class="w-8 text-[11px] font-semibold" :class="row.color">{{ row.team }}</span>
          <span class="flex">
            <CardBack v-for="n in row.count" :key="n" :width="13" class="-ml-0.5" />
          </span>
          <span class="text-[13px] font-bold tabular-nums" :class="row.color">{{ row.count }}</span>
        </div>
      </div>
    </footer>
  </div>
</template>
