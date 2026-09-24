<script setup lang="ts">
/** Fin de donne : le décompte, l'étoile éventuelle, et la donne suivante. */
import { computed, ref } from 'vue'
import { type PlayerId, teamOfPlayer } from '../game/players'
import { nomDe } from '../stores/roster'
import { SUIT_GLYPH, isRed } from '../game/display'
import { SHAME_THRESHOLD } from '../game/replay'
import { useSession } from '../stores/session'
import { useLargeScreen } from '../composables/useLargeScreen'
import { useTableLayout } from '../composables/useTableLayout'

const session = useSession()
const grand = useLargeScreen()
const L = useTableLayout()
const emit = defineEmits<{ stats: [] }>()

const result = computed(() => {
  const e = [...session.events].reverse().find((x) => x.type === 'donne_terminee')
  return e && e.type === 'donne_terminee' ? e : null
})

const over = computed(() => session.game?.phase === 'terminee')
/**
 * La partie finie, on montre d'abord le décompte de la dernière donne, comme les
 * autres : l'écran « Partie gagnée » arrivait directement, sans ses scores.
 */
const bilanVu = ref(false)

/** L'organisateur : noté sur la partie, ou à défaut le premier assis (parties d'avant). */
const createur = computed<PlayerId>(() => {
  if (session.game?.createur) return session.game.createur
  const e = session.events.find((x) => x.type === 'partie_creee')
  return e && e.type === 'partie_creee' ? (Object.keys(e.seats)[0] ?? '') : ''
})
const organisateur = computed(() => session.playerId !== null && session.playerId === createur.value)
/** ENC-7 — quatre passes : la donne est annulée et le même donneur redistribue. */
const blanche = computed(() => session.game?.phase === 'lobby')
const final = computed(() => {
  const e = [...session.events].reverse().find((x) => x.type === 'partie_terminee')
  return e && e.type === 'partie_terminee' ? e : null
})

const STATUS: Record<string, string> = {
  reussi: 'Contrat réussi', chute: 'Contrat chuté', capot: 'Capot !', generale: 'Générale !',
}

const iAmDealer = computed(() => session.playerId === session.game?.dealer)
const stars = (p: PlayerId): number => session.stars.get(p) ?? 0

/** Le contrat de la donne qui s'achève, pour rappeler ce qui était en jeu. */
const contract = computed(() => {
  const r = session.biddingResult
  return r && r.status === 'contrat' ? r : null
})
const contractText = computed(() => {
  const c = contract.value
  if (!c) return ''
  const d = c.declaration
  const couleur = d === 'sa' ? 'sans-atout' : d === 'ta' ? 'tout-atout' : ''
  if (c.generale) return `Générale ${couleur}`.trim()
  if (c.capot) return `Capot ${couleur}`.trim()
  return String(c.value)
})
/** BEL-3 — la belote de la défense ne compte pas : le dire, sinon le +0 surprend. */
const beloteEnDefense = computed(() => {
  const r = result.value
  const c = contract.value
  if (!r?.beloteDeclaredBy || !c) return false
  return teamOfPlayer(r.beloteDeclaredBy, session.seating) !== teamOfPlayer(c.taker, session.seating)
})
/** Un bot distribue : il attend qu'on ait lu le décompte. */
const waitingForBot = computed(
  () => session.botDealerHere && session.dealAcknowledged === session.game?.dealNumber,
)
function next(): void {
  if (iAmDealer.value) void session.startDeal()
  else session.continueToNextDeal()
}
</script>

<template>
  <div class="absolute inset-0 z-50 flex items-center justify-center bg-black/70 px-5">
    <div
      class="w-full max-w-sm rounded-2xl border border-white/10 bg-felt-dark p-6 text-center"
      :style="grand ? { zoom: L.t * 1.3 } : undefined"
    >

      <!-- DEC-8 : l'étoile de la honte prend toute la place -->
      <!-- En tête : sinon la donne précédente, qui a pu finir sur une étoile, s'afficherait -->
      <template v-if="blanche">
        <h2 class="font-display text-3xl leading-none">Donne blanche</h2>
        <p class="mt-3 text-[15px] text-mist">Tout le monde a passé : personne ne prend.</p>
        <p class="mt-1 text-[13px] text-sage">Même donneur, on redistribue.</p>
      </template>

      <template v-else-if="result?.etoile">
        <div class="text-6xl leading-none text-gold">★</div>
        <h2 class="mt-4 font-display text-4xl leading-none text-red-card">Shame shame</h2>
        <p class="mt-3.5 text-[17px] font-semibold">
          {{ nomDe(result.etoile) }} a fait capot sans l'annoncer
        </p>
        <p class="mt-2 text-sm text-sage">
          Huit plis sur huit. Le score ne bouge pas — on ne compte que les enchères — mais l'étoile reste.
        </p>
        <p v-if="stars(result.etoile) >= SHAME_THRESHOLD" class="mt-3 font-display text-2xl text-red-card">
          {{ SHAME_THRESHOLD }} étoiles : honte complète
        </p>
        <p v-else class="mt-3 text-[13px] text-mist">
          {{ stars(result.etoile) }}<sup v-if="stars(result.etoile) === 1">re</sup><sup v-else>e</sup>
          étoile de la partie
        </p>
      </template>

      <template v-else-if="over && final && bilanVu">
        <h2 class="font-display text-3xl leading-none">
          {{ final.winner === session.myTeam ? 'Partie gagnée' : 'Partie perdue' }}
        </h2>
        <p class="mt-3 text-[17px]">
          {{ final.scores[session.myTeam] }} – {{ final.scores[session.myTeam === 0 ? 1 : 0] }}
          <span class="text-sage">en {{ final.deals }} donne{{ final.deals > 1 ? 's' : '' }}</span>
        </p>
        <!-- La donne qui vient de clore la partie : sans elle, on ne savait pas comment elle s'était finie -->
        <p v-if="result && contract" class="mt-4 text-[13px] text-sage">
          {{ `Dernière donne : ${nomDe(contract.taker)} · ${contractText}${contract.trump ? ' ' + SUIT_GLYPH[contract.trump] : ''} — ${(STATUS[result.status] ?? result.status).toLowerCase()}` }}
        </p>
      </template>

      <template v-else-if="result">
        <h2 class="font-display text-3xl leading-none">{{ STATUS[result.status] ?? result.status }}</h2>
        <!-- Ce qui était en jeu : qui a pris, quoi, et à quel multiplicateur -->
        <p v-if="contract" class="mt-3 flex items-center justify-center gap-2 text-[15px]">
          <span class="font-semibold">{{ nomDe(contract.taker) }}</span>
          <span class="text-sage">·</span>
          <span class="font-bold text-gold">{{ contractText }}</span>
          <span
            v-if="contract.trump"
            class="flex size-6 items-center justify-center rounded-full bg-ivory text-base leading-none"
            :class="isRed(contract.trump) ? 'text-red-card' : 'text-felt-dark'"
          >{{ SUIT_GLYPH[contract.trump] }}</span>
          <span
            v-if="contract.multiplier > 1"
            class="rounded-full bg-red-card px-2 py-0.5 text-[11px] font-bold tracking-wide text-ivory"
          >{{ contract.multiplier === 4 ? 'SURCOINCHÉ ×4' : 'COINCHÉ ×2' }}</span>
        </p>
        <div class="mt-5 flex justify-center gap-8">
          <div>
            <p class="text-xs text-sage">Nous</p>
            <p class="font-display text-3xl text-gold">+{{ result.scores[session.myTeam] }}</p>
          </div>
          <div>
            <p class="text-xs text-sage">Eux</p>
            <p class="font-display text-3xl text-them">+{{ result.scores[session.myTeam === 0 ? 1 : 0] }}</p>
          </div>
        </div>
        <p v-if="result.blitz" class="mt-4 text-[13px] text-mist">
          Blitz : donne non jouée, contrat réputé réussi.
        </p>
        <p v-else class="mt-4 text-[13px] text-mist">
          Aux cartes : {{ result.compared[session.myTeam] }} contre
          {{ result.compared[session.myTeam === 0 ? 1 : 0] }}
        </p>
        <p v-if="result.beloteDeclaredBy" class="mt-1.5 text-[13px] text-sage">
          {{ `Belote annoncée par ${nomDe(result.beloteDeclaredBy)}${beloteEnDefense ? ' — en défense, elle ne compte pas' : ''}` }}
        </p>
        <p v-else-if="result.beloteForgottenBy" class="mt-1.5 text-[13px] text-red-card">
          {{ nomDe(result.beloteForgottenBy) }} avait la belote et ne l'a pas annoncée
        </p>
      </template>

      <button
        type="button"
        class="mt-6 h-11 w-full rounded-xl border border-white/15 text-sm font-medium text-mist"
        @click="emit('stats')"
      >Voir les statistiques</button>

      <button
        v-if="over && !bilanVu"
        type="button"
        class="mt-2.5 h-13 w-full cursor-pointer rounded-xl bg-gold py-3.5 text-base font-bold text-felt transition hover:brightness-110"
        @click="bilanVu = true"
      >Voir le résultat de la partie</button>
      <p v-else-if="!over && waitingForBot" class="mt-3 text-sm text-mist">
        {{ session.game ? nomDe(session.game.dealer) : '' }} distribue…
      </p>
      <button
        v-else-if="!over && (iAmDealer || session.botDealerHere)"
        type="button"
        :disabled="session.busy"
        class="mt-2.5 h-13 w-full cursor-pointer rounded-xl bg-gold py-3.5 text-base font-bold text-felt transition hover:brightness-110 disabled:opacity-40"
        @click="next"
      >Distribuer la donne suivante</button>
      <p v-else-if="!over" class="mt-3 text-sm text-mist">
        {{ session.game ? nomDe(session.game.dealer) : '' }} distribue.
      </p>
      <!-- L'organisateur relance une partie : mêmes équipes, donneur suivant ; les autres suivent -->
      <template v-else-if="organisateur">
        <button
          type="button"
          :disabled="session.busy"
          class="mt-2.5 h-13 w-full cursor-pointer rounded-xl bg-gold py-3.5 text-base font-bold text-felt transition hover:brightness-110 disabled:opacity-40"
          @click="session.rejouer()"
        >{{ session.busy ? 'Nouvelle partie…' : 'Rejouer' }}</button>
        <p class="mt-1.5 text-xs text-sage">
          Mêmes joueurs, même soirée : les équipes se changent au salon avant la première donne.
        </p>
      </template>
      <p v-else class="mt-3 text-sm text-mist">
        {{ nomDe(createur) }} peut relancer une partie : vous y serez tous rebasculés.
      </p>
      <button
        v-if="over && bilanVu"
        type="button"
        class="mt-2.5 h-12 w-full rounded-xl border border-white/15 text-sm font-medium text-mist"
        @click="session.leave()"
      >Quitter la partie</button>
    </div>
  </div>
</template>
