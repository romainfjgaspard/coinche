<script setup lang="ts">
/**
 * Reprendre une enchère faite par erreur (« 120 ♥ » au lieu de « 120 ♦ ») : tant que le
 * suivant n'a pas parlé, on demande ; les trois autres votent ; l'enchère tombe si tous
 * acceptent. Pendant le vote, la parole est suspendue. Les bots acceptent d'office.
 */
import { computed } from 'vue'
import type { GameEvent } from '../game/events'
import { useSession } from '../stores/session'
import { nameOf } from '../stores/roster'
import SuitBadge from './SuitBadge.vue'

const session = useSession()

/** L'enchère visée par la demande en cours, pour la montrer telle qu'elle a été dite. */
const target = computed(() => {
  const p = session.undoPending
  if (!p) return null
  const e = session.events.find(
    (x): x is Extract<GameEvent, { type: 'bid' }> => x.type === 'bid' && x.seq === p.bidSeq,
  )
  if (!e) return null
  const b = e.entry
  if (b.kind === 'pass') return { text: 'Passe', suit: null }
  if (b.kind === 'contract') return { text: String(b.value), suit: b.suit }
  if (b.kind === 'capot' || b.kind === 'generale')
    return { text: b.kind === 'capot' ? 'Capot' : 'Générale', suit: b.declaration }
  return null
})
const mine = computed(() => session.undoPending?.player === session.playerId)
const answered = computed(() =>
  Boolean(session.playerId && session.undoPending?.answers.has(session.playerId)),
)
const yes = computed(() => [...(session.undoPending?.answers.values() ?? [])].filter(Boolean).length)
</script>

<template>
  <div
    v-if="session.undoPending || session.myUndoableBid !== null || session.undoRefusedBy"
    class="absolute inset-x-3 top-16 z-[45] mx-auto max-w-sm lg:inset-x-auto lg:top-20 lg:right-6 lg:mx-0"
  >
    <!-- Une demande en cours -->
    <div
      v-if="session.undoPending"
      role="alert"
      class="rounded-2xl border border-gold/40 bg-felt-dark/95 px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,.5)]"
    >
      <p class="flex flex-wrap items-center gap-1.5 text-[14px] text-mist">
        <span class="font-semibold text-ivory">{{
          mine ? 'Tu demandes' : nameOf(session.undoPending.player)
        }}</span>
        <span>{{ mine ? "d'annuler ton enchère" : 'veut annuler son enchère' }}</span>
        <template v-if="target">
          <span class="font-bold text-gold">{{ target.text }}</span>
          <SuitBadge v-if="target.suit" :suit="target.suit" :size="20" />
        </template>
      </p>
      <div v-if="!mine && !answered" class="mt-2.5 flex gap-2">
        <button
          type="button"
          class="h-10 grow cursor-pointer rounded-xl border border-white/20 text-sm font-semibold text-mist transition hover:bg-white/5"
          :disabled="session.busy"
          @click="session.answerUndo(false)"
        >
          Refuser
        </button>
        <button
          type="button"
          class="h-10 grow cursor-pointer rounded-xl bg-gold text-sm font-bold text-felt transition hover:brightness-110"
          :disabled="session.busy"
          @click="session.answerUndo(true)"
        >
          Accepter
        </button>
      </div>
      <div v-else class="mt-1.5 flex items-center gap-2 text-[13px] text-sage">
        <span class="grow">En attente des autres : {{ yes }}/3</span>
        <button
          v-if="mine"
          type="button"
          class="cursor-pointer text-[13px] text-sage underline underline-offset-4 hover:text-mist"
          @click="session.answerUndo(false)"
        >
          Retirer ma demande
        </button>
      </div>
    </div>

    <!-- Refusée : on le dit, le temps que la parole reprenne -->
    <p
      v-else-if="session.undoRefusedBy"
      class="rounded-2xl bg-felt-dark/95 px-4 py-2.5 text-center text-[13px] text-mist shadow-lg"
    >
      {{ nameOf(session.undoRefusedBy) }} a refusé l'annulation.
    </p>

    <!-- Je viens d'enchérir, le suivant n'a pas encore parlé -->
    <div v-else class="flex justify-center lg:justify-end">
      <button
        type="button"
        class="flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-white/20 bg-felt-dark/90 px-3.5 text-[13px] font-semibold text-mist shadow-lg transition hover:border-white/40 hover:text-ivory"
        :disabled="session.busy"
        @click="session.requestUndo()"
      >
        <span aria-hidden="true">↶</span> Annuler mon enchère
      </button>
    </div>
  </div>
</template>
