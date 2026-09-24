<script setup lang="ts">
/**
 * Les règles de la maison, pour les joueurs : ce qui est dans docs/REGLES.md, sans les
 * identifiants techniques, avec les options de partie. Accessible depuis l'accueil et
 * depuis la table.
 */
import { useLargeScreen } from '../composables/useLargeScreen'
import { useTableLayout } from '../composables/useTableLayout'

const emit = defineEmits<{ fermer: [] }>()
defineProps<{ retour?: string }>()
const grand = useLargeScreen()
const L = useTableLayout()

const SECTIONS: { titre: string; points: string[] }[] = [
  {
    titre: 'La table',
    points: [
      '32 cartes (du 7 à l\'as), 4 joueurs, 2 équipes : les partenaires se font face.',
      'On joue dans le sens des aiguilles d\'une montre ; le donneur change à chaque donne, d\'un joueur vers la gauche.',
      'Distribution en 3-2-3. On ne rebat pas : on ramasse les plis dans l\'ordre où ils ont été gagnés, puis on coupe.',
    ],
  },
  {
    titre: 'Les cartes',
    points: [
      'À l\'atout : Valet (20), 9 (14), As (11), 10 (10), Roi (4), Dame (3), 8, 7.',
      'Hors atout : As (11), 10 (10), Roi (4), Dame (3), Valet (2), 9, 8, 7.',
      '152 points aux cartes, plus 10 pour le dernier pli (« dix de der ») : 162 en tout.',
      'Tout-atout : chaque couleur suit l\'ordre de l\'atout (Valet, 9, As, 10, Roi, Dame, 8, 7), et aucune n\'en coupe une autre.',
    ],
  },
  {
    titre: 'Les enchères',
    points: [
      'Le joueur à gauche du donneur parle en premier.',
      'Une enchère : un contrat de 80 à 170, par paliers de 10, et une couleur d\'atout. Toujours plus haut que la précédente.',
      'Le 170 est un « 150 belotté » : il ne se tient qu\'avec la belote.',
      'Capot (tous les plis) et générale (tous les plis, sans son partenaire) valent 250. En générale, on entame soi-même.',
      'Sans-atout et tout-atout ne s\'annoncent qu\'en capot ou en générale.',
      'Un joueur qui a passé peut reparler au tour suivant. Trois passes après une enchère : elle est retenue. Quatre passes d\'emblée : même donneur, on redistribue.',
    ],
  },
  {
    titre: 'Coinche et surcoinche',
    points: [
      'Un adversaire du preneur peut coincher (×2), à tout moment des enchères, sans attendre son tour.',
      'Une coinche ferme les enchères : seul le camp du preneur peut encore surcoincher (×4).',
    ],
  },
  {
    titre: 'Le jeu de la carte',
    points: [
      'Fournir la couleur demandée ; à l\'atout, monter si on le peut.',
      'Sans la couleur : couper si l\'adversaire est maître, et monter sur une coupe adverse. Si on ne peut pas monter, on sous-coupe quand même.',
      'Si le partenaire est maître, on se défausse librement.',
      'Le pli va au plus fort atout, sinon à la plus forte carte de la couleur demandée.',
    ],
  },
  {
    titre: 'La belote',
    points: [
      'Roi et Dame d\'atout dans la même main : 20 points, à annoncer en posant le Roi puis en posant la Dame. Oubliée, elle est perdue.',
      'Elle ne sert qu\'à atteindre le contrat et à départager : elle n\'est jamais marquée. Elle ne compte pas pour la défense.',
      'Pas de déclarations (tierce, cinquante, cent, carré).',
    ],
  },
  {
    titre: 'Le décompte : on ne compte que les enchères',
    points: [
      'Réussi : le preneur marque la valeur de son enchère, la défense 0. Chuté : la défense marque cette valeur, le preneur 0.',
      'Pour réussir, il faut atteindre son contrat et avoir plus de points que la défense, belote comprise. À égalité, on chute.',
      'Coinché, la valeur est doublée ; surcoinché, quadruplée.',
      'Un capot fait sans l\'avoir annoncé ne rapporte rien de plus, mais vaut une étoile de la honte. Trois étoiles dans une partie : la honte complète.',
    ],
  },
  {
    titre: 'Fin de partie',
    points: [
      "La partie s'arrête dès qu'une équipe dépasse l'objectif fixé au salon (1000 sauf choix contraire) : il faut le dépasser, l'atteindre ne suffit pas.",
      "En blitz, une donne non coinchée n'est pas jouée : le contrat est réputé réussi.",
    ],
  },
]
</script>

<template>
  <div class="h-full w-full overflow-y-auto bg-felt-dark text-ivory">
    <div
      class="mx-auto max-w-2xl px-5 pt-5 pb-10 lg:pt-8"
      :style="grand ? { zoom: L.t * 1.15 } : undefined"
    >
      <div class="flex items-center gap-3">
        <h1 class="grow font-display text-3xl leading-none">Les règles</h1>
        <button
          type="button"
          class="shrink-0 cursor-pointer rounded-lg border border-white/15 px-3 py-1.5 text-sm font-semibold text-mist transition hover:border-white/35 hover:bg-white/5"
          @click="emit('fermer')"
        >{{ retour ?? 'Retour' }}</button>
      </div>
      <p class="mt-2 text-sm text-sage">Les règles de la maison, validées le 23 septembre 2026.</p>

      <section v-for="s in SECTIONS" :key="s.titre" class="mt-7">
        <h2 class="mb-2 font-display text-xl">{{ s.titre }}</h2>
        <ul class="flex flex-col gap-1.5">
          <li v-for="(p, i) in s.points" :key="i" class="flex gap-2.5 text-[15px] leading-relaxed text-mist">
            <span class="mt-2.5 size-1.5 shrink-0 rounded-full bg-gold/70"></span>
            <span>{{ p }}</span>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
