<script setup lang="ts">
/** Panneau d'enchères : paliers, couleur, capot, générale, coinche. */
import { computed, ref } from 'vue'
import PlayingCard from './PlayingCard.vue'
import type { Suit } from '../game/cards'
import { SUIT_GLYPH, isRed } from '../game/display'
import { PLAYER_NAMES } from '../game/players'
import { currentDeal } from '../game/replay'
import { useSession } from '../stores/session'

const session = useSession()

const value = ref<number | null>(null)
const suit = ref<Suit | null>(null)

const SUITS: Suit[] = ['s', 'h', 'd', 'c']
const ALL_VALUES = [80, 90, 100, 110, 120, 130, 140, 150, 160]

const best = computed(() => {
  const entries = session.bidding?.entries ?? []
  return [...entries].reverse().find((e) => e.kind === 'contrat' || e.kind === 'capot' || e.kind === 'generale')
})

const history = computed(() =>
  currentDeal(session.events).filter((e) => e.type === 'enchere' || e.type === 'coinche' || e.type === 'surcoinche'),
)

const ready = computed(() => value.value !== null && suit.value !== null)

function announce(): void {
  if (!ready.value || !session.playerId) return
  session.bid({ kind: 'contrat', player: session.playerId, value: value.value!, suit: suit.value! })
  value.value = null
  suit.value = null
}

function label(e: (typeof history.value)[number]): string {
  if (e.type === 'coinche') return 'Coinche !'
  if (e.type === 'surcoinche') return 'Surcoinche !'
  if (e.type !== 'enchere') return ''
  const entry = e.entry
  switch (entry.kind) {
    case 'passe':
      return 'Passe'
    case 'contrat':
      return `${entry.value} ${SUIT_GLYPH[entry.suit]}`
    case 'capot':
    case 'generale': {
      const d = entry.declaration
      const nom = d === 'sa' ? 'sans-atout' : d === 'ta' ? 'tout-atout' : SUIT_GLYPH[d]
      return `${entry.kind === 'capot' ? 'Capot' : 'Générale'} ${nom}`
    }
    default:
      return ''
  }
}
</script>

<template>
  <div class="absolute inset-x-0 bottom-0 rounded-t-3xl bg-felt-dark px-5 pb-7 pt-5 shadow-[0_-8px_32px_rgba(0,0,0,.45)] lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:top-1/2 lg:w-[460px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-2xl lg:border lg:border-white/10">
    <div class="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20"></div>

    <!-- On enchérit en regardant son jeu : la main reste sous les yeux. -->
    <div class="mb-4 flex justify-center">
      <PlayingCard v-for="card in session.hand" :key="card" :card="card" :width="38" class="-ml-1.5 first:ml-0" />
    </div>

    <!-- Qui a dit quoi -->
    <ol v-if="history.length" class="mb-4 max-h-24 overflow-y-auto">
      <li
        v-for="(e, i) in history"
        :key="i"
        class="flex items-center gap-2.5 border-b border-white/8 py-1.5 last:border-0"
      >
        <span class="w-16 text-sm font-semibold">{{ PLAYER_NAMES[e.player] }}</span>
        <span class="grow text-[15px]" :class="label(e) === 'Passe' ? 'text-sage' : 'text-ivory'">
          {{ label(e) }}
        </span>
      </li>
    </ol>

    <template v-if="session.myBidTurn">
      <h2 class="text-[17px] font-semibold">Ton enchère</h2>
      <p class="mb-4 text-[13px] text-sage">
        <span v-if="best && best.kind === 'contrat'">
          {{ PLAYER_NAMES[best.player] }} a annoncé {{ best.value }} {{ SUIT_GLYPH[best.suit] }} — il faut faire mieux
        </span>
        <span v-else-if="best">{{ PLAYER_NAMES[best.player] }} a annoncé {{ best.kind }}</span>
        <span v-else>Personne n'a encore parlé</span>
      </p>

      <div class="grid grid-cols-5 gap-2">
        <button
          v-for="v in ALL_VALUES"
          :key="v"
          type="button"
          :disabled="!session.bidValues.includes(v)"
          class="h-11 rounded-[10px] border text-[15px] font-bold disabled:opacity-30"
          :class="value === v ? 'border-gold bg-gold text-felt' : 'border-white/15 bg-white/5 text-ivory'"
          @click="value = v"
        >{{ v }}</button>
      </div>

      <div class="mt-3.5 grid grid-cols-4 gap-2">
        <button
          v-for="s in SUITS"
          :key="s"
          type="button"
          class="h-13 rounded-[10px] border bg-ivory py-2.5 text-[26px] leading-none"
          :class="[suit === s ? 'border-gold' : 'border-black/20', isRed(s) ? 'text-red-card' : 'text-felt-dark']"
          @click="suit = s"
        >{{ SUIT_GLYPH[s] }}</button>
      </div>

      <div class="mt-2.5 grid grid-cols-2 gap-2">
        <button
          type="button"
          class="h-11 rounded-[10px] border border-white/15 bg-white/5 text-sm font-bold"
          @click="session.playerId && suit && session.bid({ kind: 'capot', player: session.playerId, declaration: suit })"
        >Capot · 250</button>
        <button
          type="button"
          class="h-11 rounded-[10px] border border-white/15 bg-white/5 text-sm font-bold"
          @click="session.playerId && suit && session.bid({ kind: 'generale', player: session.playerId, declaration: suit })"
        >Générale · 250</button>
      </div>
      <p class="mt-2 text-xs text-sage">
        Sans-atout et tout-atout ne se jouent qu'en capot ou en générale.
      </p>

      <div class="mt-4 flex gap-2">
        <button
          type="button"
          class="h-12 grow rounded-[10px] border border-white/20 text-[15px] font-semibold text-mist"
          @click="session.playerId && session.bid({ kind: 'passe', player: session.playerId })"
        >Passe</button>
        <button
          type="button"
          :disabled="!ready"
          class="h-12 grow-[1.4] rounded-[10px] bg-gold text-[15px] font-bold text-felt disabled:opacity-40"
          @click="announce"
        >
          Annoncer<span v-if="ready"> {{ value }} {{ SUIT_GLYPH[suit!] }}</span>
        </button>
      </div>
    </template>

    <p v-else class="py-3 text-center text-sm text-mist">
      <span v-if="session.toBid">{{ PLAYER_NAMES[session.toBid] }} réfléchit…</span>
      <span v-else>Enchères closes</span>
    </p>

    <!-- CO-3 : la coinche se prend à la volée, sans attendre son tour -->
    <div v-if="session.mayCoinche || session.maySurcoinche" class="mt-3">
      <button
        v-if="session.mayCoinche"
        type="button"
        class="h-12 w-full rounded-[10px] bg-red-card text-[15px] font-bold text-ivory"
        @click="session.playerId && session.bid({ kind: 'coinche', player: session.playerId })"
      >Coincher</button>
      <button
        v-else
        type="button"
        class="h-12 w-full rounded-[10px] bg-red-card text-[15px] font-bold text-ivory"
        @click="session.playerId && session.bid({ kind: 'surcoinche', player: session.playerId })"
      >Surcoincher</button>
      <p class="mt-2 text-center text-xs text-sage">Possible à tout moment, sans attendre son tour.</p>
    </div>
  </div>
</template>
