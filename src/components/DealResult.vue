<script setup lang="ts">
/** Fin de donne : le décompte, l'étoile éventuelle, et la donne suivante. */
import { computed } from 'vue'
import { PLAYER_NAMES, type PlayerId } from '../game/players'
import { SHAME_THRESHOLD } from '../game/replay'
import { useSession } from '../stores/session'

const session = useSession()
const emit = defineEmits<{ stats: [] }>()

const result = computed(() => {
  const e = [...session.events].reverse().find((x) => x.type === 'donne_terminee')
  return e && e.type === 'donne_terminee' ? e : null
})

const over = computed(() => session.game?.phase === 'terminee')
const final = computed(() => {
  const e = [...session.events].reverse().find((x) => x.type === 'partie_terminee')
  return e && e.type === 'partie_terminee' ? e : null
})

const STATUS: Record<string, string> = {
  reussi: 'Contrat réussi', chute: 'Contrat chuté', capot: 'Capot !', generale: 'Générale !',
}

const iAmDealer = computed(() => session.playerId === session.game?.dealer)
const stars = (p: PlayerId): number => session.stars.get(p) ?? 0
</script>

<template>
  <div class="absolute inset-0 flex items-center justify-center bg-black/70 px-5">
    <div class="w-full max-w-sm rounded-2xl border border-white/10 bg-felt-dark p-6 text-center">

      <!-- DEC-8 : l'étoile de la honte prend toute la place -->
      <template v-if="result?.etoile">
        <div class="text-6xl leading-none text-gold">★</div>
        <h2 class="mt-4 font-display text-4xl leading-none text-red-card">Shame shame</h2>
        <p class="mt-3.5 text-[17px] font-semibold">
          {{ PLAYER_NAMES[result.etoile] }} a fait capot sans l'annoncer
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

      <template v-else-if="over && final">
        <h2 class="font-display text-3xl leading-none">
          {{ final.winner === session.myTeam ? 'Partie gagnée' : 'Partie perdue' }}
        </h2>
        <p class="mt-3 text-[17px]">
          {{ final.scores[session.myTeam] }} – {{ final.scores[session.myTeam === 0 ? 1 : 0] }}
          <span class="text-sage">en {{ final.deals }} donnes</span>
        </p>
      </template>

      <template v-else-if="result">
        <h2 class="font-display text-3xl leading-none">{{ STATUS[result.status] ?? result.status }}</h2>
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
        <p class="mt-4 text-[13px] text-mist">
          Aux cartes : {{ result.compared[session.myTeam] }} contre
          {{ result.compared[session.myTeam === 0 ? 1 : 0] }}
        </p>
        <p v-if="result.beloteDeclaredBy" class="mt-1.5 text-[13px] text-sage">
          Belote annoncée par {{ PLAYER_NAMES[result.beloteDeclaredBy] }}
        </p>
        <p v-else-if="result.beloteForgottenBy" class="mt-1.5 text-[13px] text-red-card">
          {{ PLAYER_NAMES[result.beloteForgottenBy] }} avait la belote et ne l'a pas annoncée
        </p>
      </template>

      <button
        type="button"
        class="mt-6 h-11 w-full rounded-xl border border-white/15 text-sm font-medium text-mist"
        @click="emit('stats')"
      >Voir les statistiques</button>

      <button
        v-if="!over && iAmDealer"
        type="button"
        :disabled="session.busy"
        class="mt-2.5 h-13 w-full rounded-xl bg-gold py-3.5 text-base font-bold text-felt disabled:opacity-40"
        @click="session.startDeal()"
      >Distribuer la donne suivante</button>
      <p v-else-if="!over" class="mt-3 text-sm text-mist">
        {{ session.game ? PLAYER_NAMES[session.game.dealer] : '' }} distribue.
      </p>
      <button
        v-else
        type="button"
        class="mt-6 h-12 w-full rounded-xl border border-white/15 text-sm font-medium text-mist"
        @click="session.leave()"
      >Quitter la partie</button>
    </div>
  </div>
</template>
