<script setup lang="ts">
/** Fin de donne : le décompte, l'étoile éventuelle, et la donne suivante. */
import { computed, ref } from 'vue'
import { type PlayerId, teamOfPlayer } from '../game/players'
import { nameOf } from '../stores/roster'
import { SUIT_GLYPH, isRed } from '../game/display'
import { SHAME_THRESHOLD } from '../game/replay'
import { useSession } from '../stores/session'
import { useLargeScreen } from '../composables/useLargeScreen'
import { useTableLayout } from '../composables/useTableLayout'
import { trickPoints2, reviewDeal } from '../game/review'
import { LAST_TRICK_BONUS } from '../game/scoring'
import DealReview from './DealReview.vue'

const session = useSession()
const large = useLargeScreen()
const L = useTableLayout()
const emit = defineEmits<{ stats: [] }>()

const result = computed(() => {
  const e = [...session.events].reverse().find((x) => x.type === 'deal_done')
  return e && e.type === 'deal_done' ? e : null
})

const over = computed(() => session.game?.phase === 'finished')
/**
 * La partie finie, on montre d'abord le décompte de la dernière donne, comme les
 * autres : l'écran « Partie gagnée » arrivait directement, sans ses scores.
 */
const summarySeen = ref(false)

/** L'organisateur : noté sur la partie, ou à défaut le premier assis (parties d'avant). */
const creatorId = computed<PlayerId>(() => {
  if (session.game?.creatorId) return session.game.creatorId
  const e = session.events.find((x) => x.type === 'game_created')
  return e && e.type === 'game_created' ? (Object.keys(e.seats)[0] ?? '') : ''
})
const isOrganizer = computed(() => session.playerId !== null && session.playerId === creatorId.value)
/** ENC-7 — quatre passes : la donne est annulée et le même donneur redistribue. */
const passedOut = computed(() => session.game?.phase === 'lobby')
const final = computed(() => {
  const e = [...session.events].reverse().find((x) => x.type === 'game_over')
  return e && e.type === 'game_over' ? e : null
})

const STATUS: Record<string, string> = {
  made: 'Contrat réussi',
  down: 'Contrat chuté',
  capot: 'Capot !',
  generale: 'Générale !',
}

const iAmDealer = computed(() => session.playerId === session.game?.dealer)
const stars = (p: PlayerId): number => session.stars.get(p) ?? 0

/** Le contrat de la donne qui s'achève, pour rappeler ce qui était en jeu. */
const contract = computed(() => {
  const r = session.biddingResult
  return r && r.status === 'contract' ? r : null
})
const contractText = computed(() => {
  const c = contract.value
  if (!c) return ''
  const d = c.declaration
  const suit = d === 'sa' ? 'sans-atout' : d === 'ta' ? 'tout-atout' : ''
  if (c.generale) return `Générale ${suit}`.trim()
  if (c.capot) return `Capot ${suit}`.trim()
  return String(c.value)
})
/** BEL-3 — la belote de la défense ne compte pas : le dire, sinon le +0 surprend. */
const defenseBelote = computed(() => {
  const r = result.value
  const c = contract.value
  if (!r?.beloteDeclaredBy || !c) return false
  return teamOfPlayer(r.beloteDeclaredBy, session.seating) !== teamOfPlayer(c.taker, session.seating)
})
/** Un bot distribue : il attend qu'on ait lu le décompte. */
const waitingForBot = computed(
  () => session.botDealerHere && session.dealAcknowledged === session.game?.dealNumber,
)
/** La donne qui s'achève, relue dans le journal : les points pli par pli. */
const deal = computed(() =>
  result.value ? reviewDeal(session.events, result.value.dealNumber, session.seating) : null,
)
const us = computed(() => session.myTeam)
const them = computed<0 | 1>(() => (session.myTeam === 0 ? 1 : 0))
/** Le détail des points faits, replié par défaut. */
const detail = ref(false)
/** La belote qui compte : celle du preneur (BEL-3), 20 points dans « points faits ». */
const beloteCounts = computed(() => Boolean(result.value?.beloteDeclaredBy && !defenseBelote.value))
const teamOf = (p: PlayerId): 0 | 1 => teamOfPlayer(p, session.seating)
/** Tous les plis sont là (sinon, donne jouée avant le détail : on n'invente rien). */
const fullDetail = computed(() => {
  const d = deal.value
  const r = result.value
  if (!d || !r || d.tricks.length !== 8) return false
  const [a, b] = trickPoints2(d)
  return a === r.cardPoints[0] && b === r.cardPoints[1]
})
const review = ref(false)

function next(): void {
  if (iAmDealer.value) void session.startDeal()
  else session.continueToNextDeal()
}
</script>

<template>
  <div
    class="absolute inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 px-5 py-4 max-lg:items-stretch max-lg:px-3 max-lg:py-3"
  >
    <div
      class="w-full max-w-sm rounded-2xl border border-white/10 bg-felt-dark p-6 text-center max-lg:flex max-lg:flex-col max-lg:justify-center"
      :style="large ? { zoom: L.t * 1.3 } : { zoom: 1.12 }"
    >
      <!-- DEC-8 : l'étoile de la honte prend toute la place -->
      <!-- En tête : sinon la donne précédente, qui a pu finir sur une étoile, s'afficherait -->
      <template v-if="passedOut">
        <h2 class="font-display text-3xl leading-none">Donne blanche</h2>
        <p class="mt-3 text-[15px] text-mist">Tout le monde a passé : personne ne prend.</p>
        <p class="mt-1 text-[13px] text-sage">Même donneur, on redistribue.</p>
      </template>

      <template v-else-if="result?.shameStar">
        <div class="text-6xl leading-none text-gold">★</div>
        <h2 class="mt-4 font-display text-4xl leading-none text-red-card">Shame shame</h2>
        <p class="mt-3.5 text-[17px] font-semibold">
          {{ nameOf(result.shameStar) }} a fait capot sans l'annoncer
        </p>
        <p class="mt-2 text-sm text-sage">
          Huit plis sur huit. Le score ne bouge pas — on ne compte que les enchères — mais l'étoile reste.
        </p>
        <p v-if="stars(result.shameStar) >= SHAME_THRESHOLD" class="mt-3 font-display text-2xl text-red-card">
          {{ SHAME_THRESHOLD }} étoiles : honte complète
        </p>
        <p v-else class="mt-3 text-[13px] text-mist">
          {{ stars(result.shameStar) }}<sup v-if="stars(result.shameStar) === 1">re</sup><sup v-else>e</sup>
          étoile de la partie
        </p>
      </template>

      <template v-else-if="over && final && summarySeen">
        <h2 class="font-display text-3xl leading-none">
          {{ final.winner === session.myTeam ? 'Partie gagnée' : 'Partie perdue' }}
        </h2>
        <p class="mt-3 text-[17px]">
          {{ final.scores[session.myTeam] }} – {{ final.scores[session.myTeam === 0 ? 1 : 0] }}
          <span class="text-sage">en {{ final.deals }} donne{{ final.deals > 1 ? 's' : '' }}</span>
        </p>
        <!-- La donne qui vient de clore la partie : sans elle, on ne savait pas comment elle s'était finie -->
        <p v-if="result && contract" class="mt-4 text-[13px] text-sage">
          {{
            `Dernière donne : ${nameOf(contract.taker)} · ${contractText}${contract.trump ? ' ' + SUIT_GLYPH[contract.trump] : ''} — ${(STATUS[result.status] ?? result.status).toLowerCase()}`
          }}
        </p>
      </template>

      <template v-else-if="result">
        <h2 class="font-display text-3xl leading-none">{{ STATUS[result.status] ?? result.status }}</h2>
        <!-- Ce qui était en jeu : qui a pris, quoi, et à quel multiplicateur -->
        <p v-if="contract" class="mt-3 flex items-center justify-center gap-2 text-[15px]">
          <span class="font-semibold">{{ nameOf(contract.taker) }}</span>
          <span class="text-sage">·</span>
          <span class="font-bold text-gold">{{ contractText }}</span>
          <span
            v-if="contract.trump"
            class="flex size-6 items-center justify-center rounded-full bg-ivory text-base leading-none"
            :class="isRed(contract.trump) ? 'text-red-card' : 'text-felt-dark'"
            >{{ SUIT_GLYPH[contract.trump] }}</span
          >
          <span
            v-if="contract.multiplier > 1"
            class="rounded-full bg-red-card px-2 py-0.5 text-[11px] font-bold tracking-wide text-ivory"
            >{{ contract.multiplier === 4 ? 'SURCOINCHÉ ×4' : 'COINCHÉ ×2' }}</span
          >
        </p>
        <!--
          Points faits (cartes, dix de der, belote du preneur) et points marqués, pour
          nous et pour eux. La flèche déplie le détail : chaque pli, le dix de der, la belote.
        -->
        <table class="mt-5 w-full border-collapse text-[15px] tabular-nums">
          <thead>
            <tr class="text-xs">
              <th class="w-[42%]"></th>
              <th class="pb-1 font-semibold text-gold">Nous</th>
              <th class="pb-1 font-semibold text-them">Eux</th>
              <th class="w-8"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!result.blitz" class="border-t border-white/10">
              <td class="py-1.5 text-left text-[13px] text-sage">Points faits</td>
              <td class="py-1.5">{{ result.compared[us] }}</td>
              <td class="py-1.5">{{ result.compared[them] }}</td>
              <td class="py-1.5 text-right">
                <button
                  v-if="fullDetail"
                  type="button"
                  class="inline-flex size-7 cursor-pointer items-center justify-center rounded-full border border-white/15 text-xs text-mist transition hover:border-white/35"
                  :aria-label="detail ? 'Replier le détail' : 'Voir le détail des points'"
                  :aria-expanded="detail"
                  @click="detail = !detail"
                >
                  <span class="transition" :class="detail ? 'rotate-180' : ''">▼</span>
                </button>
              </td>
            </tr>
            <template v-if="detail && fullDetail && deal">
              <tr v-for="trick in deal.tricks" :key="trick.number" class="text-[13px] text-mist">
                <td class="py-0.5 pl-3 text-left">
                  Pli {{ trick.number }} <span class="text-dusk">· {{ nameOf(trick.winner) }}</span>
                </td>
                <td class="py-0.5">{{ trick.team === us ? trick.points : '' }}</td>
                <td class="py-0.5">{{ trick.team === them ? trick.points : '' }}</td>
                <td></td>
              </tr>
              <tr class="text-[13px] text-mist">
                <td class="py-0.5 pl-3 text-left">Dix de der</td>
                <td class="py-0.5">{{ deal.lastTrickTeam === us ? LAST_TRICK_BONUS : '' }}</td>
                <td class="py-0.5">{{ deal.lastTrickTeam === them ? LAST_TRICK_BONUS : '' }}</td>
                <td></td>
              </tr>
              <tr v-if="result.beloteDeclaredBy" class="text-[13px] text-mist">
                <td class="py-0.5 pl-3 text-left">
                  Belote <span class="text-dusk">· {{ nameOf(result.beloteDeclaredBy) }}</span>
                </td>
                <td class="py-0.5">
                  {{
                    beloteCounts && teamOf(result.beloteDeclaredBy) === us
                      ? 20
                      : teamOf(result.beloteDeclaredBy) === us
                        ? '—'
                        : ''
                  }}
                </td>
                <td class="py-0.5">
                  {{
                    beloteCounts && teamOf(result.beloteDeclaredBy) === them
                      ? 20
                      : teamOf(result.beloteDeclaredBy) === them
                        ? '—'
                        : ''
                  }}
                </td>
                <td></td>
              </tr>
            </template>
            <tr class="border-t border-white/10">
              <td class="pt-2 text-left text-[13px] text-sage">Points marqués</td>
              <td class="pt-2 font-display text-3xl leading-none text-gold">+{{ result.scores[us] }}</td>
              <td class="pt-2 font-display text-3xl leading-none text-them">+{{ result.scores[them] }}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
        <p v-if="result.blitz" class="mt-4 text-[13px] text-mist">
          Blitz : donne non jouée, contrat réputé réussi.
        </p>
        <p v-if="result.beloteDeclaredBy" class="mt-1.5 text-[13px] text-sage">
          {{
            `Belote annoncée par ${nameOf(result.beloteDeclaredBy)}${defenseBelote ? ' — en défense, elle ne compte pas' : ''}`
          }}
        </p>
        <p v-else-if="result.beloteForgottenBy" class="mt-1.5 text-[13px] text-red-card">
          {{ nameOf(result.beloteForgottenBy) }} avait la belote et ne l'a pas annoncée
        </p>
      </template>

      <div class="mt-6 flex gap-2.5">
        <!-- Les mains de départ et les huit plis : de quoi refaire la donne -->
        <button
          v-if="result && !result.blitz && !passedOut && deal?.hands"
          type="button"
          class="h-11 grow cursor-pointer rounded-xl border border-white/15 text-sm font-medium text-mist transition hover:border-white/35"
          @click="review = true"
        >
          Revoir la donne
        </button>
        <button
          type="button"
          class="h-11 grow cursor-pointer rounded-xl border border-white/15 text-sm font-medium text-mist transition hover:border-white/35"
          @click="emit('stats')"
        >
          Statistiques
        </button>
      </div>
      <DealReview v-if="review && deal" :deal="deal" @close="review = false" />

      <button
        v-if="over && !summarySeen"
        type="button"
        class="mt-2.5 h-13 w-full cursor-pointer rounded-xl bg-gold py-3.5 text-base font-bold text-felt transition hover:brightness-110"
        @click="summarySeen = true"
      >
        Voir le résultat de la partie
      </button>
      <p v-else-if="!over && waitingForBot" class="mt-3 text-sm text-mist">
        {{ session.game ? nameOf(session.game.dealer) : '' }} distribue…
      </p>
      <button
        v-else-if="!over && (iAmDealer || session.botDealerHere)"
        type="button"
        :disabled="session.busy"
        class="mt-2.5 h-13 w-full cursor-pointer rounded-xl bg-gold py-3.5 text-base font-bold text-felt transition hover:brightness-110 disabled:opacity-40"
        @click="next"
      >
        Distribuer la donne suivante
      </button>
      <p v-else-if="!over" class="mt-3 text-sm text-mist">
        {{ session.game ? nameOf(session.game.dealer) : '' }} distribue.
      </p>
      <!-- L'organisateur relance une partie : mêmes équipes, donneur suivant ; les autres suivent -->
      <template v-else-if="isOrganizer">
        <button
          type="button"
          :disabled="session.busy"
          class="mt-2.5 h-13 w-full cursor-pointer rounded-xl bg-gold py-3.5 text-base font-bold text-felt transition hover:brightness-110 disabled:opacity-40"
          @click="session.replay()"
        >
          {{ session.busy ? 'Nouvelle partie…' : 'Rejouer' }}
        </button>
        <p class="mt-1.5 text-xs text-sage">
          Mêmes joueurs, même soirée : les équipes se changent au salon avant la première donne.
        </p>
      </template>
      <p v-else class="mt-3 text-sm text-mist">
        {{ nameOf(creatorId) }} peut relancer une partie : vous y serez tous rebasculés.
      </p>
      <button
        v-if="over && summarySeen"
        type="button"
        class="mt-2.5 h-12 w-full rounded-xl border border-white/15 text-sm font-medium text-mist"
        @click="session.leave()"
      >
        Quitter la partie
      </button>
    </div>
  </div>
</template>
