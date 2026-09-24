<script setup lang="ts">
/**
 * Statistiques sur toutes les parties, lues depuis les archives.
 * Les six duos, les joueurs, la réussite par palier et le panache.
 */
import { computed, onMounted, ref } from 'vue'
import { PLAYER_IDS, PLAYER_NAMES, type PlayerId } from '../game/players'
import { PAIRES, clePaire, duoStats, joueurStats, parPalier } from '../game/statsGlobal'
import { useSession } from '../stores/session'

const session = useSession()
// Rechargé à chaque ouverture : une partie finie depuis la dernière visite doit apparaître.
onMounted(() => { void session.loadArchives() })

const BON = '#52a884'
const MAUVAIS = '#cc6b4a'
/* Le panache n'est pas une réussite : il ne porte donc ni le vert ni l'orange du statut */
const TEMPERAMENT = '#a98ada'

/**
 * Les parties où un bot a tenu un siège sont écartées par défaut : un score
 * d'équipe obtenu avec un partenaire artificiel n'a pas sa place dans les
 * classements. Elles restent consultables d'un clic.
 */
const avecBots = ref(false)
const archives = computed(() =>
  avecBots.value ? session.archives : session.archives.filter((a) => (a.bots ?? []).length === 0),
)
const partiesAvecBot = computed(
  () => session.archives.filter((a) => (a.bots ?? []).length > 0).length,
)

const duos = computed(() => duoStats(archives.value))
const joueurs = computed(() => joueurStats(archives.value))
const total = computed(() => archives.value.length)

const taux = (a: number, b: number): number => (b === 0 ? 0 : Math.round((a / b) * 100))
const nom = (p: PlayerId): string => PLAYER_NAMES[p]
const nomPaire = (p: readonly PlayerId[]): string => p.map(nom).join(' & ')

/** Fond d'autant plus soutenu que le taux est élevé. */
const fondTaux = (v: number): string => {
  const a = Math.max(0, Math.min(1, (v - 35) / 40))
  return `rgba(82,168,132,${(0.08 + a * 0.42).toFixed(2)})`
}

const reperes = computed(() => {
  if (duos.value.length === 0 || joueurs.value.length === 0) return []
  const dTri = [...duos.value].sort((a, b) => taux(b.gagnees, b.parties) - taux(a.gagnees, a.parties))
  const jTri = [...joueurs.value].sort((a, b) => taux(b.gagnees, b.parties) - taux(a.gagnees, a.parties))
  const carte = (etiquette: string, qui: string, v: number, detail: string, bon: boolean) => ({
    etiquette, qui, valeur: `${v} %`, detail, couleur: bon ? BON : MAUVAIS,
  })
  const d0 = dTri[0]
  const dn = dTri[dTri.length - 1]
  const j0 = jTri[0]
  const jn = jTri[jTri.length - 1]
  return [
    carte('MEILLEUR DUO', nomPaire(d0.paire), taux(d0.gagnees, d0.parties),
      `${d0.gagnees} sur ${d0.parties}`, true),
    carte('PIRE DUO', nomPaire(dn.paire), taux(dn.gagnees, dn.parties),
      `${dn.gagnees} sur ${dn.parties}`, false),
    carte('MEILLEUR JOUEUR', nom(j0.joueur), taux(j0.gagnees, j0.parties),
      `${j0.gagnees} partie${j0.gagnees > 1 ? 's' : ''} sur ${j0.parties}`, true),
    carte('PIRE JOUEUR', nom(jn.joueur), taux(jn.gagnees, jn.parties),
      // Les étoiles quand il y en a ; sinon le bilan des parties, comme pour le meilleur.
      jn.etoiles > 0
        ? `${jn.etoiles} étoile${jn.etoiles > 1 ? 's' : ''} de la honte`
        : `${jn.gagnees} partie${jn.gagnees > 1 ? 's' : ''} sur ${jn.parties}`,
      false),
  ]
})

/** Filtre du graphe par palier : tous, un duo, ou un joueur. */
const filtre = ref<{ nom: string; joueurs: PlayerId[] }>({ nom: 'Tous', joueurs: [...PLAYER_IDS] })
const filtres = computed(() => [
  { nom: 'Tous', joueurs: [...PLAYER_IDS] },
  ...PAIRES.map((p) => ({ nom: nomPaire(p), joueurs: [...p] })),
  ...PLAYER_IDS.map((p) => ({ nom: nom(p), joueurs: [p] })),
])

const paliers = computed(() => {
  const lignes = parPalier(archives.value, filtre.value.joueurs)
  const max = Math.max(1, ...lignes.map((l) => l.reussis + l.chutes))
  return lignes.map((l) => {
    const t = l.reussis + l.chutes
    return {
      palier: l.palier === 'capot' ? 'capot' : String(l.palier),
      total: t,
      pct: t ? Math.round((l.reussis / t) * 100) : null,
      hauteur: t ? `${Math.max(30, Math.round((t / max) * 150))}px` : '10px',
      partReussi: l.reussis,
      partChute: l.chutes,
      // Encre sombre sur la part dorée, claire quand elle est trop courte
      encre: l.reussis / t > 0.28 ? '#0a2a1f' : '#cfe0d8',
    }
  })
})

const panaches = computed(() => {
  const avec = joueurs.value.filter((j) => j.panache !== null)
  const max = Math.max(10, ...avec.map((j) => Math.abs(j.panache!)))
  return avec
    .sort((a, b) => b.panache! - a.panache!)
    .map((j) => {
      const part = (Math.abs(j.panache!) / max) * 50
      const positif = j.panache! > 0
      return {
        nom: nom(j.joueur),
        couleur: TEMPERAMENT,
        left: `${(positif ? 50 : 50 - part).toFixed(1)}%`,
        width: `${part.toFixed(1)}%`,
        // Un panache nul s'écrit 0 : « −0 » laissait croire à une valeur négative.
        valeur: j.panache === 0 ? '0' : `${positif ? '+' : '−'}${Math.abs(j.panache!)}`,
      }
    })
})
</script>

<template>
  <div>
    <p v-if="session.archives.length === 0" class="mt-8 text-center text-sm text-sage">
      Aucune partie terminée pour l'instant. Les statistiques apparaîtront après la première.
    </p>

    <!--
      Toutes les parties terminées ont un bot : elles sont écartées par défaut, mais le
      bouton pour les revoir doit rester là — sinon elles devenaient introuvables.
    -->
    <div v-else-if="total === 0" class="mt-8 flex flex-col items-center gap-3 text-center">
      <p class="text-sm text-sage">
        {{ partiesAvecBot > 1
          ? `Les ${partiesAvecBot} parties terminées avaient un bot à table : elles sont écartées des classements.`
          : 'La seule partie terminée avait un bot à table : elle est écartée des classements.' }}
      </p>
      <button
        type="button"
        class="cursor-pointer rounded-full border border-gold/60 px-4 py-1.5 text-[13px] font-semibold text-gold transition hover:bg-gold/15"
        @click="avecBots = true"
      >{{ partiesAvecBot > 1 ? 'Les afficher quand même' : 'L\'afficher quand même' }}</button>
    </div>

    <template v-else>
      <div>
      <section>

      <div class="mt-3 flex flex-wrap items-center gap-2">
        <p class="text-xs text-dusk">
          {{ total }} partie{{ total > 1 ? 's' : '' }} terminée{{ total > 1 ? 's' : '' }}
        </p>
        <button
          v-if="partiesAvecBot > 0"
          type="button"
          class="rounded-full border px-2.5 py-0.5 text-[11px]"
          :class="avecBots ? 'border-gold bg-gold/20 text-gold' : 'border-white/15 text-sage'"
          @click="avecBots = !avecBots"
        >
          {{ avecBots ? 'avec' : 'sans' }} les {{ partiesAvecBot }} partie{{ partiesAvecBot > 1 ? 's' : '' }} à bot
        </button>
      </div>

      <div class="mt-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-4">
        <div
          v-for="r in reperes"
          :key="r.etiquette"
          class="rounded-xl border px-3.5 py-3"
          :style="{ borderColor: r.couleur, background: `${r.couleur}22` }"
        >
          <p class="text-[9px] tracking-widest" :style="{ color: r.couleur }">{{ r.etiquette }}</p>
          <p class="mt-1 font-display text-lg leading-tight">{{ r.qui }}</p>
          <p class="font-display text-2xl leading-none" :style="{ color: r.couleur }">{{ r.valeur }}</p>
          <p class="mt-1 text-[11px] text-mist">{{ r.detail }}</p>
        </div>
      </div>
      </section>

      <section>
      <h2 class="mt-6 mb-2 font-display text-lg">Duo par duo</h2>
      <table class="w-full border-collapse text-[12px] [&_td:first-child]:pl-0 [&_th:first-child]:pl-0 [&_td:last-child]:pr-0 [&_th:last-child]:pr-0">
        <thead>
          <tr class="text-[10px] tracking-wider text-sage">
            <th class="pb-1.5 text-left font-semibold px-2">DUO</th>
            <th class="pb-1.5 text-right font-semibold px-2">PARTIES</th>
            <th class="pb-1.5 text-right font-semibold px-2">GAGNÉES</th>
            <th class="pb-1.5 text-right font-semibold px-2">%</th>
            <th class="hidden pb-1.5 text-right font-semibold lg:table-cell px-2">DONNES</th>
            <th class="hidden pb-1.5 text-right font-semibold lg:table-cell px-2">DONNES&nbsp;%</th>
            <th class="hidden pb-1.5 text-right font-semibold lg:table-cell px-2">PRISES</th>
            <th class="hidden pb-1.5 text-right font-semibold lg:table-cell px-2">CONTRATS&nbsp;%</th>
            <th class="hidden pb-1.5 text-right font-semibold lg:table-cell px-2">MARQUÉS</th>
            <th class="hidden pb-1.5 text-right font-semibold lg:table-cell px-2">OFFERTS</th>
            <th class="hidden pb-1.5 text-right font-semibold lg:table-cell px-2">MOYEN</th>
            <th class="pb-1.5 text-right font-semibold px-2">PIRE</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in duos" :key="clePaire(d.paire)" class="border-t border-white/8">
            <td class="py-2 font-semibold whitespace-nowrap">{{ nomPaire(d.paire) }}</td>
            <td class="py-2 text-right tabular-nums text-mist px-2">{{ d.parties }}</td>
            <td class="py-2 text-right tabular-nums text-mist px-2">{{ d.gagnees }}</td>
            <td class="py-2 text-right px-2">
              <span
                class="inline-block rounded px-1.5 py-0.5 font-semibold tabular-nums"
                :style="{ background: fondTaux(taux(d.gagnees, d.parties)) }"
              >{{ taux(d.gagnees, d.parties) }} %</span>
            </td>
            <td class="hidden py-2 text-right tabular-nums text-mist lg:table-cell px-2">{{ d.donnes }}</td>
            <td class="hidden py-2 text-right tabular-nums text-mist lg:table-cell px-2">
              {{ taux(d.donnesGagnees, d.donnes) }} %
            </td>
            <td class="hidden py-2 text-right tabular-nums text-mist lg:table-cell px-2">{{ d.prises }}</td>
            <td class="hidden py-2 text-right lg:table-cell px-2">
              <span
                class="inline-block rounded px-1.5 py-0.5 font-semibold tabular-nums"
                :style="{ background: fondTaux(taux(d.reussies, d.prises)) }"
              >{{ taux(d.reussies, d.prises) }} %</span>
            </td>
            <td class="hidden py-2 text-right tabular-nums lg:table-cell px-2" :style="{ color: BON }">
              {{ d.marques }}
            </td>
            <td class="hidden py-2 text-right tabular-nums lg:table-cell px-2" :style="{ color: MAUVAIS }">
              {{ d.offerts }}
            </td>
            <td class="hidden py-2 text-right tabular-nums text-mist lg:table-cell px-2">{{ d.scoreMoyen }}</td>
            <td class="py-2 text-right tabular-nums text-mist px-2">{{ d.pireScore ?? '—' }}</td>
          </tr>
        </tbody>
      </table>
      </section>

      <section>
      <h2 class="mt-6 mb-2 font-display text-lg">Joueur par joueur</h2>
      <table class="w-full border-collapse text-[12px] [&_td:first-child]:pl-0 [&_th:first-child]:pl-0 [&_td:last-child]:pr-0 [&_th:last-child]:pr-0">
        <thead>
          <tr class="text-[10px] tracking-wider text-sage">
            <th class="pb-1.5 text-left font-semibold px-2">JOUEUR</th>
            <th class="hidden pb-1.5 text-right font-semibold lg:table-cell px-2">PARTIES</th>
            <th class="hidden pb-1.5 text-right font-semibold lg:table-cell px-2">GAGNÉES</th>
            <th class="pb-1.5 text-right font-semibold px-2">PRISES</th>
            <th class="pb-1.5 text-right font-semibold px-2">RÉUSS.</th>
            <th class="pb-1.5 text-right font-semibold px-2">%</th>
            <th class="pb-1.5 text-right font-semibold px-2">★</th>
            <th class="pb-1.5 text-right font-semibold px-2" title="impasses réussies sur tentées">IMPASSES</th>
            <th class="hidden pb-1.5 text-right font-semibold lg:table-cell px-2">COINCHES</th>
            <th class="hidden pb-1.5 text-right font-semibold lg:table-cell px-2" title="annoncées · oubliées">BELOTES</th>
            <th class="hidden pb-1.5 text-right font-semibold lg:table-cell px-2">MARQUÉS</th>
            <th class="hidden pb-1.5 text-right font-semibold lg:table-cell px-2">OFFERTS</th>
            <th class="hidden pb-1.5 text-right font-semibold lg:table-cell px-2">MOYEN</th>
            <th class="hidden pb-1.5 text-right font-semibold lg:table-cell px-2">PIRE</th>
            <th class="hidden pb-1.5 text-right font-semibold lg:table-cell px-2">PANACHE</th>
            <th class="pb-1.5 text-right font-semibold px-2">BILAN</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="j in joueurs" :key="j.joueur" class="border-t border-white/8">
            <td class="py-2 font-semibold">{{ nom(j.joueur) }}</td>
            <td class="hidden py-2 text-right tabular-nums text-mist lg:table-cell px-2">{{ j.parties }}</td>
            <td class="hidden py-2 text-right tabular-nums text-mist lg:table-cell px-2">
              {{ j.gagnees }} · {{ taux(j.gagnees, j.parties) }} %
            </td>
            <td class="py-2 text-right tabular-nums text-mist px-2">{{ j.prises }}</td>
            <td class="py-2 text-right tabular-nums text-mist px-2">{{ j.reussies }}</td>
            <td class="py-2 text-right px-2">
              <span
                class="inline-block rounded px-1.5 py-0.5 font-semibold tabular-nums"
                :style="{ background: fondTaux(taux(j.reussies, j.prises)) }"
              >{{ taux(j.reussies, j.prises) }} %</span>
            </td>
            <td class="py-2 text-right tabular-nums text-gold px-2">{{ j.etoiles }}</td>
            <td class="py-2 text-right tabular-nums px-2">
              <template v-if="j.impasses">
                <span class="text-good">{{ j.impassesReussies }}</span>
                <span class="text-dusk">/</span>
                <span class="text-bad">{{ j.impassesRatees }}</span>
                <span class="text-sage"> sur {{ j.impasses }}</span>
              </template>
              <span v-else class="text-dusk">—</span>
            </td>
            <td class="hidden py-2 text-right tabular-nums text-mist lg:table-cell px-2">{{ j.coinches }}</td>
            <td class="hidden py-2 text-right tabular-nums lg:table-cell px-2">
              <span class="text-mist">{{ j.belotesAnnoncees }}</span>
              <span class="text-dusk"> · </span>
              <span :style="{ color: j.belotesOubliees ? MAUVAIS : undefined }" class="text-dusk">
                {{ j.belotesOubliees }}
              </span>
            </td>
            <td class="hidden py-2 text-right tabular-nums lg:table-cell px-2" :style="{ color: BON }">
              {{ j.marques }}
            </td>
            <td class="hidden py-2 text-right tabular-nums lg:table-cell px-2" :style="{ color: MAUVAIS }">
              {{ j.offerts }}
            </td>
            <td class="hidden py-2 text-right tabular-nums text-mist lg:table-cell px-2">{{ j.scoreMoyen }}</td>
            <td class="hidden py-2 text-right tabular-nums text-mist lg:table-cell px-2">{{ j.pireScore ?? '—' }}</td>
            <td class="hidden py-2 text-right tabular-nums lg:table-cell px-2">
              <span v-if="j.panache === null" class="text-dusk">—</span>
              <span v-else :style="{ color: j.panache >= 0 ? BON : MAUVAIS }">
                {{ j.panache > 0 ? '+' : '' }}{{ j.panache }}
              </span>
            </td>
            <td
              class="py-2 text-right font-bold tabular-nums px-2"
              :style="{ color: j.marques - j.offerts >= 0 ? BON : MAUVAIS }"
            >{{ j.marques - j.offerts > 0 ? '+' : '' }}{{ j.marques - j.offerts }}</td>
          </tr>
        </tbody>
      </table>
      </section>

      <section>
      <h2 class="mt-6 mb-1 font-display text-lg">Jusqu'où chacun peut monter</h2>
      <p class="mb-2 text-[11px] text-sage">
        Hauteur de la barre = contrats pris à ce palier · part dorée = contrats passés
      </p>
      <div class="flex flex-wrap gap-1.5 rounded-xl border border-white/8 bg-white/5 p-2">
        <button
          v-for="f in filtres"
          :key="f.nom"
          type="button"
          class="rounded-full border px-2.5 py-1 text-[11px]"
          :class="filtre.nom === f.nom
            ? 'border-gold bg-gold/20 font-semibold text-gold'
            : 'border-white/15 text-mist'"
          @click="filtre = f"
        >{{ f.nom }}</button>
      </div>
      <div v-if="paliers.length" class="mt-3 flex items-end gap-1.5">
        <div v-for="p in paliers" :key="p.palier" class="flex grow flex-col items-center">
          <div class="flex items-end" style="height: 150px">
            <div
              v-if="p.total"
              class="relative flex w-6 flex-col gap-0.5"
              :style="{ height: p.hauteur }"
              :title="`${p.partReussi} réussis sur ${p.total}`"
            >
              <div class="rounded-t bg-[#5d7a70]" :style="{ flexGrow: p.partChute }"></div>
              <div class="rounded-b bg-gold" :style="{ flexGrow: p.partReussi }"></div>
              <span
                class="absolute inset-x-0 bottom-0.5 text-center text-[9px] font-bold"
                :style="{ color: p.encre }"
              >{{ p.pct }}</span>
            </div>
            <div
              v-else
              class="w-6 rounded border border-dashed border-white/20"
              style="height: 10px"
              title="jamais pris"
            ></div>
          </div>
          <span class="mt-1 text-[9px] font-semibold">{{ p.palier }}</span>
          <span class="text-[9px] text-dusk">{{ p.total }}</span>
        </div>
      </div>
      <p v-else class="text-sm text-sage">Aucune prise pour cette sélection.</p>
      </section>

      <section>
      <h2 class="mt-6 mb-1 font-display text-lg">Le panache</h2>
      <p class="mb-3 text-[11px] leading-relaxed text-sage">
        Écart moyen entre ce qu'un joueur annonce et ce que <em>les autres</em> annoncent
        avec une main de force comparable.
      </p>
      <div v-if="panaches.length" class="flex flex-col gap-2">
        <div v-for="p in panaches" :key="p.nom" class="flex items-center gap-2.5">
          <span class="w-14 text-right text-[13px] font-semibold">{{ p.nom }}</span>
          <div class="relative h-6 grow">
            <div class="absolute top-0 bottom-0 left-1/2 w-px bg-white/20"></div>
            <div
              class="absolute top-0 h-6 rounded"
              :style="{ left: p.left, width: p.width, background: p.couleur }"
            ></div>
          </div>
          <span class="w-10 text-[13px] font-bold tabular-nums" :style="{ color: p.couleur }">
            {{ p.valeur }}
          </span>
        </div>
        <div class="mt-1 ml-16 flex justify-between text-[10px] text-dusk">
          <span>plus prudent</span><span>plus audacieux</span>
        </div>
      </div>
      <p v-else class="text-sm text-sage">
        Pas encore assez de prises pour comparer les tempéraments.
      </p>
      </section>
      </div>
    </template>
  </div>
</template>
