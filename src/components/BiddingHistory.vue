<script setup lang="ts">
/**
 * L'historique des enchères sur PC, en colonne à droite du tapis, comme sur la
 * maquette : chaque prise de parole sur sa ligne — qui, quoi, et le temps qu'il a
 * pris pour se décider. La fenêtre d'annonce, elle, ne garde que de quoi annoncer.
 */
import { computed } from 'vue'
import type { Suit } from '../game/cards'
import { SUIT_GLYPH, duration } from '../game/display'
import { currentDeal } from '../game/replay'
import { useSession } from '../stores/session'
import { nameOf } from '../stores/roster'
import DealerChip from './DealerChip.vue'
import { type PlayerId, teamOfPlayer } from '../game/players'

const session = useSession()
/** Le nom à la couleur de son équipe : or pour la mienne, bleu pour l'autre, comme partout. */
const teamColor = (p: PlayerId): string =>
  teamOfPlayer(p, session.seating) === session.myTeam ? 'text-gold' : 'text-them'

const rows = computed(() => {
  const deal = currentDeal(session.events)
  return deal.flatMap((e, i) => {
    if (e.type !== 'bid' && e.type !== 'coinche' && e.type !== 'surcoinche') return []
    // Le temps mesuré par le joueur lui-même ; à défaut (annonce écrite avant qu'on le
    // mesure), l'écart avec la prise de parole précédente. La coinche, hors tour, n'en a pas.
    const before = deal[i - 1]
    const ms = e.thinkMs ?? (e.type === 'bid' && before ? e.at - before.at : null)
    if (e.type !== 'bid') {
      return [
        {
          key: e.seq,
          player: e.player,
          who: nameOf(e.player),
          what: e.type === 'coinche' ? 'Coinche ! ×2' : 'Surcoinche ! ×4',
          suit: null as Suit | 'sa' | 'ta' | null,
          pass: false,
          coinche: true,
          times: ms === null ? '' : duration(ms),
        },
      ]
    }
    const b = e.entry
    const suit =
      b.kind === 'contract' ? b.suit : b.kind === 'capot' || b.kind === 'generale' ? b.declaration : null
    const what =
      b.kind === 'pass'
        ? 'Passe'
        : b.kind === 'contract'
          ? String(b.value)
          : b.kind === 'capot'
            ? 'Capot'
            : b.kind === 'generale'
              ? 'Générale'
              : ''
    return [
      {
        key: e.seq,
        player: e.player,
        who: nameOf(e.player),
        what,
        suit,
        pass: b.kind === 'pass',
        coinche: false,
        times: ms === null ? '' : duration(ms),
      },
    ]
  })
})
</script>

<template>
  <aside
    class="w-full rounded-2xl border border-white/8 bg-felt-dark/90 px-5 pt-4 pb-4 shadow-[0_12px_32px_rgba(0,0,0,.45)]"
  >
    <h2 class="flex items-center gap-2 text-sm font-semibold tracking-wider text-sage lg:text-xs">
      ENCHÈRES — DONNEUR : {{ session.game ? nameOf(session.game.dealer).toUpperCase() : '' }}
      <DealerChip :size="16" />
    </h2>
    <p v-if="!rows.length" class="mt-3 text-sm text-sage">Personne n'a encore parlé.</p>
    <ol class="mt-2">
      <li
        v-for="l in rows"
        :key="l.key"
        class="flex items-center gap-3 border-b border-white/7 py-2 last:border-0"
      >
        <span
          class="w-[84px] truncate text-base font-semibold lg:w-[70px] lg:text-sm"
          :class="teamColor(l.player)"
          >{{ l.who }}</span
        >
        <!-- Même formalisme que le contrat : le chiffre doré en police d'affichage, le symbole sur rond ivoire -->
        <span class="flex grow items-center gap-2">
          <span
            class="font-display text-2xl leading-none lg:text-xl"
            :class="l.coinche ? 'text-[#f0a293]' : l.pass ? 'text-sage' : 'text-gold'"
            >{{ l.what }}</span
          >
          <span
            v-if="l.suit"
            class="flex h-7 min-w-7 items-center justify-center rounded-full bg-ivory px-1 text-[17px] leading-none font-bold lg:h-6 lg:min-w-6 lg:text-[15px]"
            :class="l.suit === 'h' || l.suit === 'd' ? 'text-red-card' : 'text-felt-dark'"
            >{{ l.suit === 'sa' || l.suit === 'ta' ? l.suit.toUpperCase() : SUIT_GLYPH[l.suit] }}</span
          >
        </span>
        <span class="text-xs tabular-nums text-dusk lg:text-[11px]" title="temps de réflexion">{{
          l.times
        }}</span>
      </li>
    </ol>
    <p class="mt-3 text-[11px] leading-relaxed text-dusk">
      Chaque prise de parole est enregistrée : qui, quoi, et le temps de réflexion.
    </p>
  </aside>
</template>
