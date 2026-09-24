<script setup lang="ts">
/**
 * L'historique des enchères sur PC, en colonne à droite du tapis, comme sur la
 * maquette : chaque prise de parole sur sa ligne — qui, quoi, et le temps qu'il a
 * pris pour se décider. La fenêtre d'annonce, elle, ne garde que de quoi annoncer.
 */
import { computed } from 'vue'
import type { Suit } from '../game/cards'
import { SUIT_GLYPH, duree } from '../game/display'
import { currentDeal } from '../game/replay'
import { useSession } from '../stores/session'
import { nomDe } from '../stores/roster'
import DealerChip from './DealerChip.vue'
import { type PlayerId, teamOfPlayer } from '../game/players'

const session = useSession()
/** Le nom à la couleur de son équipe : or pour la mienne, bleu pour l'autre, comme partout. */
const couleurEquipe = (p: PlayerId): string =>
  teamOfPlayer(p, session.seating) === session.myTeam ? 'text-gold' : 'text-them'

const lignes = computed(() => {
  const donne = currentDeal(session.events)
  return donne.flatMap((e, i) => {
    if (e.type !== 'enchere' && e.type !== 'coinche' && e.type !== 'surcoinche') return []
    // Le temps mesuré par le joueur lui-même ; à défaut (annonce écrite avant qu'on le
    // mesure), l'écart avec la prise de parole précédente. La coinche, hors tour, n'en a pas.
    const avant = donne[i - 1]
    const ms = e.thinkMs ?? (e.type === 'enchere' && avant ? e.at - avant.at : null)
    if (e.type !== 'enchere') {
      return [{ cle: e.seq, joueur: e.player, qui: nomDe(e.player), quoi: e.type === 'coinche' ? 'Coinche ! ×2' : 'Surcoinche ! ×4', couleur: null as Suit | 'sa' | 'ta' | null, passe: false, coinche: true, temps: ms === null ? '' : duree(ms) }]
    }
    const b = e.entry
    const couleur = b.kind === 'contrat' ? b.suit : b.kind === 'capot' || b.kind === 'generale' ? b.declaration : null
    const quoi = b.kind === 'passe' ? 'Passe'
      : b.kind === 'contrat' ? String(b.value)
        : b.kind === 'capot' ? 'Capot' : b.kind === 'generale' ? 'Générale' : ''
    return [{ cle: e.seq, joueur: e.player, qui: nomDe(e.player), quoi, couleur, passe: b.kind === 'passe', coinche: false, temps: ms === null ? '' : duree(ms) }]
  })
})
</script>

<template>
  <aside class="w-full rounded-2xl border border-white/8 bg-felt-dark/90 px-5 pt-4 pb-4 shadow-[0_12px_32px_rgba(0,0,0,.45)]">
    <h2 class="flex items-center gap-2 text-xs font-semibold tracking-wider text-sage">
      ENCHÈRES — DONNEUR : {{ session.game ? nomDe(session.game.dealer).toUpperCase() : '' }}
      <DealerChip :size="16" />
    </h2>
    <p v-if="!lignes.length" class="mt-3 text-sm text-sage">Personne n'a encore parlé.</p>
    <ol class="mt-2">
      <li
        v-for="l in lignes"
        :key="l.cle"
        class="flex items-center gap-3 border-b border-white/7 py-2 last:border-0"
      >
        <span class="w-[70px] truncate text-sm font-semibold" :class="couleurEquipe(l.joueur)">{{ l.qui }}</span>
        <!-- Même formalisme que le contrat : le chiffre doré en police d'affichage, le symbole sur rond ivoire -->
        <span class="flex grow items-center gap-2">
          <span
            class="font-display text-xl leading-none"
            :class="l.coinche ? 'text-[#f0a293]' : l.passe ? 'text-sage' : 'text-gold'"
          >{{ l.quoi }}</span>
          <span
            v-if="l.couleur"
            class="flex h-6 min-w-6 items-center justify-center rounded-full bg-ivory px-1 text-[15px] leading-none font-bold"
            :class="l.couleur === 'h' || l.couleur === 'd' ? 'text-red-card' : 'text-felt-dark'"
          >{{ l.couleur === 'sa' || l.couleur === 'ta' ? l.couleur.toUpperCase() : SUIT_GLYPH[l.couleur] }}</span>
        </span>
        <span class="text-[11px] tabular-nums text-dusk" title="temps de réflexion">{{ l.temps }}</span>
      </li>
    </ol>
    <p class="mt-3 text-[11px] leading-relaxed text-dusk">
      Chaque prise de parole est enregistrée : qui, quoi, et le temps de réflexion.
    </p>
  </aside>
</template>
