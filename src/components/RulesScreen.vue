<script setup lang="ts">
/**
 * Les règles de la maison, pour les joueurs : seulement ce qui distingue notre coinche
 * (docs/REGLES.md fait foi) — ce qui vaut dans toute coinche n'y est pas répété.
 * Accessible depuis l'accueil et depuis la table.
 */
import { useLargeScreen } from '../composables/useLargeScreen'
import { useTableLayout } from '../composables/useTableLayout'

const emit = defineEmits<{ close: [] }>()
defineProps<{ backLabel?: string }>()
const large = useLargeScreen()
const L = useTableLayout()

const SECTIONS: { title: string; points: string[]; examples?: boolean }[] = [
  {
    title: 'La distribution',
    points: [
      "On ne rebat pas : on ramasse les plis dans l'ordre où ils ont été gagnés, on coupe, et on distribue en 3-2-3.",
    ],
  },
  {
    title: 'Capot et générale',
    points: [
      'Capot (tous les plis) et générale (tous les plis, sans son partenaire) valent 250. En générale, on entame soi-même.',
      "Sans-atout et tout-atout ne s'annoncent qu'en capot ou en générale.",
    ],
  },
  {
    title: 'Coinche et surcoinche',
    points: [
      'Un adversaire du preneur peut coincher (×2), à tout moment des enchères, sans attendre son tour.',
      'Une coinche ferme les enchères : seul le camp du preneur peut encore surcoincher (×4).',
    ],
  },
  {
    title: 'Jeu de la carte',
    points: [
      'Il faut fournir la couleur demandée ; à défaut, couper si un adversaire est maître, en montant sur sa coupe si on le peut. Si le partenaire est maître, on se défausse librement.',
      "Quand on demande atout, tout le monde monte s'il le peut, même sur son partenaire.",
    ],
  },
  {
    title: 'Belote-Rebelote',
    points: [
      'Belote-Rebelote doit être annoncée avec la pastille « Belote », aux deux cartes : la première tête posée dit « belote », la seconde « rebelote ».',
      'Ses 20 points ne sont jamais marqués : ils aident seulement le preneur à réussir son contrat (voir ci-dessous). Ils ne comptent pas pour la défense.',
      'Pas de déclarations (tierce, cinquante, cent, carré).',
    ],
  },
  {
    title: 'Réussir son contrat',
    points: [
      'On ne compte que les enchères : contrat réussi, le preneur marque sa valeur et la défense 0 ; contrat chuté, la défense marque cette valeur.',
      'Pour réussir, il faut deux choses : atteindre la valeur annoncée, et faire plus de points que la défense (sur les 162 de la donne). Quand le preneur a la belote, ses 20 points comptent dans les deux.',
      'À égalité (81 partout), le preneur chute.',
      'Coinché, la valeur est doublée ; surcoinché, quadruplée.',
    ],
    examples: true,
  },
  {
    title: 'Les étoiles de la honte',
    points: [
      "Un capot fait sans l'avoir annoncé ne rapporte rien de plus, mais vaut une étoile de la honte. Trois étoiles dans une partie : la honte complète.",
    ],
  },
  {
    title: 'Fin de partie',
    points: [
      "La partie s'arrête dès qu'une équipe dépasse l'objectif fixé au salon (1000 sauf choix contraire) : il faut le dépasser, l'atteindre ne suffit pas.",
      "En blitz, une donne non coinchée n'est pas jouée : le contrat est réputé réussi.",
    ],
  },
]

/**
 * Points de cartes qu'il faut au preneur (sur 162). Sans belote : la valeur annoncée,
 * et au moins 82 pour être devant. Avec la belote : 20 de moins, et au moins 72
 * (72 + 20 = 92, contre 90 pour la défense).
 */
const EXAMPLES = [80, 90, 100].map((contract) => ({
  contract,
  without: Math.max(contract, 82),
  withBelote: Math.max(contract - 20, 72),
}))
</script>

<template>
  <div class="h-full w-full overflow-y-auto bg-felt-dark text-ivory">
    <div class="mx-auto max-w-2xl px-5 pt-5 pb-10 lg:pt-8" :style="large ? { zoom: L.t * 1.15 } : undefined">
      <div class="flex items-center gap-3">
        <h1 class="grow font-display text-3xl leading-none">Les règles</h1>
        <button
          type="button"
          class="shrink-0 cursor-pointer rounded-lg border border-white/15 px-3 py-1.5 text-sm font-semibold text-mist transition hover:border-white/35 hover:bg-white/5"
          @click="emit('close')"
        >
          {{ backLabel ?? 'Retour' }}
        </button>
      </div>
      <p class="mt-2 text-sm text-sage">Ce qui distingue notre coinche. Le reste se joue comme partout.</p>

      <section v-for="s in SECTIONS" :key="s.title" class="mt-7">
        <h2 class="mb-2 font-display text-xl">{{ s.title }}</h2>
        <ul class="flex flex-col gap-1.5">
          <li v-for="(p, i) in s.points" :key="i" class="flex gap-2.5 text-[15px] leading-relaxed text-mist">
            <span class="mt-2.5 size-1.5 shrink-0 rounded-full bg-gold/70"></span>
            <span>{{ p }}</span>
          </li>
        </ul>

        <!-- Les points de cartes qu'il faut au preneur, sans et avec la belote -->
        <div v-if="s.examples" class="mt-4 rounded-xl border border-white/10 bg-white/4 px-4 py-3">
          <p class="mb-2 text-sm font-semibold">Combien de points de cartes faut-il au preneur ?</p>
          <table class="w-full border-collapse text-sm">
            <thead>
              <tr class="text-xs tracking-wider text-sage">
                <th class="pb-1.5 text-left font-semibold">CONTRAT</th>
                <th class="pb-1.5 text-right font-semibold">SANS LA BELOTE</th>
                <th class="pb-1.5 text-right font-semibold">AVEC LA BELOTE</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="e in EXAMPLES" :key="e.contract" class="border-t border-white/8">
                <td class="py-1.5 font-display text-lg text-gold">{{ e.contract }}</td>
                <td class="py-1.5 text-right tabular-nums text-mist">{{ e.without }}</td>
                <td class="py-1.5 text-right tabular-nums text-mist">{{ e.withBelote }}</td>
              </tr>
            </tbody>
          </table>
          <p class="mt-2 text-xs leading-relaxed text-sage">
            À 80 sans belote, il faut 82 : 80 ne suffit pas, il faut aussi être devant la défense (82 contre
            80). Avec la belote, 72 suffisent : 72 + 20 = 92, et la défense n'a que 90. À 90, il faut 90 sans
            belote, 72 avec. À 100, il faut 100 sans belote, 80 avec (80 + 20 = 100).
          </p>
        </div>
      </section>
    </div>
  </div>
</template>
