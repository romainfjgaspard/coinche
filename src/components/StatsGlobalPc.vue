<script setup lang="ts">
import { onMounted } from 'vue'
import { annoncesGlobales, ecartsGlobaux, rolesGlobaux, tempsGlobaux } from '../game/statsGlobal'
import { couleursDe } from '../composables/couleursJoueurs'
import { useFiltreArchives } from '../composables/useFiltreArchives'
import StatsEncheres from './StatsEncheres.vue'
import StatsEcarts from './StatsEcarts.vue'
import StatsTemps from './StatsTemps.vue'
import StatsParties from './StatsParties.vue'
/**
 * Statistiques de toutes les parties, sur grand écran — la maquette validée
 * « Stats — toutes les parties — ordinateur ». Dessinée pour 1920 px ; le parent la
 * met à l'échelle de l'écran.
 */
import { duree } from '../game/display'
import { computed, ref } from 'vue'
import type { PlayerId } from '../game/players'
import { nomDe } from '../stores/roster'
import {
  PALIERS,
  clePaire,
  duoStats,
  joueursDe,
  joueurStats,
  pairesJouees,
  parPalier,
  prisesAvecForce,
  prisesDe,
} from '../game/statsGlobal'
import { BAREME, habitudeDuGroupe, LARGEUR_BANDE } from '../game/force'
import type { Archive } from '../game/archive'

const props = defineProps<{ archives: Archive[]; vue: string }>()

// --- Enchères, temps et parties : les mêmes sections que sur téléphone, sur deux colonnes.
const lesJoueurs = computed(() => joueursDe(props.archives))
const couleursJ = computed(() => couleursDe(lesJoueurs.value))
const annonces = computed(() => annoncesGlobales(props.archives))
const roles = computed(() => rolesGlobaux(props.archives))
const ecarts = computed(() => ecartsGlobaux(props.archives))
const temps = computed(() => tempsGlobaux(props.archives))
const { nonFinies, chargerNonFinies } = useFiltreArchives()
onMounted(() => {
  void chargerNonFinies()
})

const OR = '#d9a441'
const BON = '#52a884'
const MAUVAIS = '#cc6b4a'
const CLAIR = '#cfe0d8'
const ARDOISE = '#5d7a70'
const SEP = '1px solid rgba(255,255,255,.14)'

const nom = (p: PlayerId): string => nomDe(p)
const nomPaire = (p: readonly PlayerId[]): string => p.map(nom).join(' & ')
const taux = (a: number, b: number): number => (b === 0 ? 0 : Math.round((a / b) * 100))
/** Un nombre à une décimale, virgule française, signe toujours écrit. */
const signe = (v: number): string =>
  v === 0 ? '0' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1).replace('.', ',')}`

const duos = computed(() => duoStats(props.archives))
const joueurs = computed(() => joueurStats(props.archives))

// --- Cellules des tableaux : valeur, couleur, fond dégradé, séparateur de groupe
interface Cell {
  v: string
  c: string
  w: string
  fond: string
  sep: string
}
const cel = (v: string | number, opt: Partial<Cell> = {}): Cell => ({
  v: String(v),
  c: opt.c ?? CLAIR,
  w: opt.w ?? '400',
  fond: opt.fond ?? 'transparent',
  sep: opt.sep ?? 'none',
})
/** Dégradé séquentiel : plus le taux est élevé, plus le fond est soutenu. */
const tauxCel = (v: number, sep?: string): Cell => {
  const a = Math.max(0, Math.min(1, (v - 35) / 40))
  return cel(`${v} %`, {
    c: '#faf9f5',
    w: '600',
    fond: `rgba(82,168,132,${(0.08 + a * 0.42).toFixed(2)})`,
    sep,
  })
}
const signeCel = (v: number, sep?: string): Cell =>
  cel(signe(v), { c: v >= 0 ? BON : MAUVAIS, w: '700', sep })

const colonnes = (noms: string[], gauche: number, separateurs: number[]) =>
  noms.map((t, i) => ({
    t,
    align: i < gauche ? 'left' : 'right',
    sep: separateurs.includes(i) ? SEP : 'none',
  }))

// --- Repères : le meilleur et le pire, en duo et en individuel
const reperes = computed(() => {
  if (!duos.value.length || !joueurs.value.length) return []
  const parTaux = <T extends { gagnees: number; parties: number }>(l: T[]) =>
    [...l].sort((a, b) => taux(b.gagnees, b.parties) - taux(a.gagnees, a.parties))
  const d = parTaux(duos.value)
  const j = parTaux(joueurs.value)
  const d0 = d[0]
  const dn = d[d.length - 1]
  const j0 = j[0]
  const jn = j[j.length - 1]
  const parDonne = (x: { marques: number; offerts: number; donnes: number }) =>
    x.donnes ? (x.marques - x.offerts) / x.donnes : 0
  const victoires = (g: number, p: number) => `${g} victoire${g > 1 ? 's' : ''} sur ${p}`
  const bon = { fond: 'rgba(82,168,132,.14)', bord: BON, couleur: BON }
  const mauvais = { fond: 'rgba(204,107,74,.12)', bord: 'rgba(204,107,74,.5)', couleur: MAUVAIS }
  return [
    {
      etiquette: 'MEILLEUR DUO',
      qui: nomPaire(d0.paire),
      valeur: `${taux(d0.gagnees, d0.parties)} %`,
      detail: `${victoires(d0.gagnees, d0.parties)} · ${signe(parDonne(d0))} point par donne`,
      ...bon,
    },
    {
      etiquette: 'PIRE DUO',
      qui: nomPaire(dn.paire),
      valeur: `${taux(dn.gagnees, dn.parties)} %`,
      detail: `${victoires(dn.gagnees, dn.parties)} · ${signe(parDonne(dn))} point par donne`,
      ...mauvais,
    },
    {
      etiquette: 'MEILLEUR JOUEUR',
      qui: nom(j0.joueur),
      valeur: `${taux(j0.gagnees, j0.parties)} %`,
      detail: `${j0.gagnees} partie${j0.gagnees > 1 ? 's' : ''} gagnée${j0.gagnees > 1 ? 's' : ''} sur ${j0.parties} · ${taux(j0.reussies, j0.prises)} % de contrats tenus`,
      ...bon,
    },
    {
      etiquette: 'PIRE JOUEUR',
      qui: nom(jn.joueur),
      valeur: `${taux(jn.gagnees, jn.parties)} %`,
      detail: `${jn.gagnees} partie${jn.gagnees > 1 ? 's' : ''} gagnée${jn.gagnees > 1 ? 's' : ''} sur ${jn.parties} · ${jn.etoiles} étoile${jn.etoiles > 1 ? 's' : ''} de la honte`,
      ...mauvais,
    },
  ]
})

// --- Duo par duo
const colDuos = colonnes(
  [
    'DUO',
    'CONTRE',
    'JOUÉES',
    'GAGNÉES',
    '%',
    'SCORE MOY',
    'PIRE SCORE',
    'JOUÉES',
    'GAGNÉES',
    '%',
    'PRISES',
    'RÉUSSIES',
    '%',
    'BILAN',
  ],
  2,
  [2, 7],
)
const lignesDuos = computed(() =>
  duos.value.map((d) => ({
    cle: clePaire(d.paire),
    paire: nomPaire(d.paire),
    contre: d.contre.map(nomPaire).join(' · '),
    cells: [
      cel(d.parties, { sep: SEP }),
      cel(d.gagnees),
      tauxCel(taux(d.gagnees, d.parties)),
      cel(d.scoreMoyen),
      cel(d.pireScore ?? '—'),
      cel(d.donnes, { sep: SEP }),
      cel(d.donnesGagnees),
      tauxCel(taux(d.donnesGagnees, d.donnes)),
      cel(d.prises),
      cel(d.reussies),
      tauxCel(taux(d.reussies, d.prises)),
      signeCel(d.donnes ? (d.marques - d.offerts) / d.donnes : 0),
    ],
  })),
)

// --- Joueur par joueur, triable d'un clic
const colJoueurs = colonnes(
  [
    'JOUEUR',
    'JOUÉES',
    'GAGNÉES',
    '%',
    'SCORE MOY',
    'PIRE SCORE',
    'JOUÉES',
    'PRISES',
    'RÉUSSIES',
    '%',
    'ENCH. MOY',
    'CHUTES',
    'COINCHES',
    'BILAN',
  ],
  1,
  [1, 6],
)
/** Valeur de tri de chaque colonne, dans l'ordre des en-têtes (hors nom). */
const tri = ref<{ col: number; desc: boolean }>({ col: 3, desc: true })
const lignesJoueurs = computed(() => {
  const lignes = joueurs.value.map((j) => {
    const bilanDonne = j.donnes ? (j.marques - j.offerts) / j.donnes : 0
    const valeurs = [
      j.parties,
      j.gagnees,
      taux(j.gagnees, j.parties),
      j.scoreMoyen,
      j.pireScore ?? 0,
      j.donnes,
      j.prises,
      j.reussies,
      taux(j.reussies, j.prises),
      j.enchereMoyenne ?? 0,
      j.chutes,
      j.coinches,
      bilanDonne,
    ]
    return {
      id: j.joueur,
      nom: nom(j.joueur),
      valeurs,
      cells: [
        cel(j.parties, { sep: SEP }),
        cel(j.gagnees),
        tauxCel(taux(j.gagnees, j.parties)),
        cel(j.scoreMoyen),
        cel(j.pireScore ?? '—'),
        cel(j.donnes, { sep: SEP }),
        cel(j.prises),
        cel(j.reussies),
        tauxCel(taux(j.reussies, j.prises)),
        cel(j.enchereMoyenne ?? '—'),
        cel(j.chutes),
        cel(`${j.coinches} / ${j.coinchesGagnees}`),
        signeCel(bilanDonne),
      ],
    }
  })
  const { col, desc } = tri.value
  return lignes.sort((a, b) => (desc ? -1 : 1) * (a.valeurs[col - 1] - b.valeurs[col - 1]))
})
function trier(col: number): void {
  if (col === 0) return
  tri.value = { col, desc: tri.value.col === col ? !tri.value.desc : true }
}

// --- Belotes, impasses et étoiles
const details = computed(() =>
  joueurs.value.map((j) => {
    const reussite = j.impasses ? taux(j.impassesReussies, j.impasses) : null
    return {
      nom: nom(j.joueur),
      lignes: [
        { quoi: 'Belotes annoncées', valeur: String(j.belotesAnnoncees), couleur: CLAIR },
        {
          quoi: 'Belotes oubliées',
          valeur: String(j.belotesOubliees),
          couleur: j.belotesOubliees ? MAUVAIS : CLAIR,
        },
        { quoi: 'Impasses tentées', valeur: String(j.impasses), couleur: CLAIR },
        {
          quoi: 'Impasses réussies',
          valeur: reussite === null ? '—' : `${reussite} %`,
          couleur: reussite === null ? CLAIR : reussite >= 55 ? BON : reussite < 45 ? MAUVAIS : CLAIR,
        },
        { quoi: 'Étoiles de la honte', valeur: String(j.etoiles), couleur: OR },
        // Temps mesurés depuis le 24/09/2026 : les parties d'avant n'en ont pas.
        {
          quoi: "Temps d'annonce",
          valeur: j.tempsEnchere === null ? '—' : duree(j.tempsEnchere),
          couleur: CLAIR,
        },
        { quoi: 'Temps de jeu', valeur: j.tempsCarte === null ? '—' : duree(j.tempsCarte), couleur: CLAIR },
      ],
    }
  }),
)

// --- Jusqu'où chacun peut monter
/** Le choix est retenu par son nom : la liste des joueurs dépend des archives chargées. */
const choix = ref('Tous')
const filtres = computed(() => {
  const qui = joueursDe(props.archives)
  return [
    { nom: 'Tous', joueurs: qui },
    ...pairesJouees(props.archives).map((p) => ({ nom: nomPaire(p), joueurs: [...p] })),
    ...qui.map((p) => ({ nom: nom(p), joueurs: [p] })),
  ]
})
const filtre = computed(() => filtres.value.find((f) => f.nom === choix.value) ?? filtres.value[0])
const libellePalier = (p: (typeof PALIERS)[number]) => (p === 'capot' ? 'CAPOT' : String(p))
function barres(qui: PlayerId[], hauteur: number, maxRef?: number) {
  const lignes = parPalier(props.archives, qui)
  const max = maxRef ?? Math.max(1, ...lignes.map((l) => l.reussis + l.chutes))
  return lignes.map((l) => {
    const total = l.reussis + l.chutes
    const pct = total ? Math.round((l.reussis / total) * 100) : 0
    return {
      palier: libellePalier(l.palier),
      total,
      detail: `${l.reussis} / ${total}`,
      pct: total ? `${pct} %` : '',
      pctCourt: total ? String(pct) : '',
      // Le pourcentage s'écrit dans la barre : encre sombre sur la part dorée, claire sinon.
      pctCouleur: total && l.reussis / total > 0.28 ? '#0a2a1f' : CLAIR,
      hTotal: total ? `${Math.max(30, Math.round((total / max) * hauteur))}px` : '0px',
      partReussi: l.reussis,
      partChute: l.chutes,
    }
  })
}
const grand = computed(() => barres(filtre.value.joueurs, 300))
const tauxGroupe = computed(() => {
  const t = joueurs.value.reduce((s, j) => ({ r: s.r + j.reussies, p: s.p + j.prises }), { r: 0, p: 0 })
  return taux(t.r, t.p)
})
const resumeFiltre = computed(() => {
  const qui = joueurs.value.filter((j) => filtre.value.joueurs.includes(j.joueur))
  const prises = qui.reduce((s, j) => s + j.prises, 0)
  const reussies = qui.reduce((s, j) => s + j.reussies, 0)
  const encheres = qui.filter((j) => j.enchereMoyenne !== null)
  const moy = encheres.length
    ? Math.round(
        encheres.reduce((s, j) => s + j.enchereMoyenne! * j.prises, 0) /
          Math.max(
            1,
            encheres.reduce((s, j) => s + j.prises, 0),
          ),
      )
    : null
  return `${prises} prise${prises > 1 ? 's' : ''} · ${taux(reussies, prises)} % de réussite · moyenne du groupe ${tauxGroupe.value} %${moy === null ? '' : ` · enchère moyenne ${moy}`}`
})
const petits = computed(() => {
  const maxGlobal = Math.max(
    1,
    ...joueursDe(props.archives).flatMap((p) =>
      parPalier(props.archives, [p]).map((l) => l.reussis + l.chutes),
    ),
  )
  return joueursDe(props.archives).map((p) => {
    const j = joueurs.value.find((x) => x.joueur === p)
    const choisi = filtre.value.joueurs.length === 1 && filtre.value.joueurs[0] === p
    return {
      id: p,
      nom: nom(p),
      global: j ? `${taux(j.reussies, j.prises)} %` : '—',
      // Au-dessus ou au-dessous du groupe : une valeur, donc vert ou orange.
      couleur: j && taux(j.reussies, j.prises) >= tauxGroupe.value ? BON : MAUVAIS,
      fond: choisi ? 'rgba(217,164,65,.1)' : 'rgba(255,255,255,.04)',
      bord: choisi ? 'rgba(217,164,65,.45)' : 'rgba(255,255,255,.08)',
      barres: barres([p], 92, maxGlobal),
    }
  })
})

// --- Le panache
const panache = computed(() => {
  const avec = joueurs.value.filter((j) => j.panache !== null)
  const max = Math.max(10, ...avec.map((j) => Math.abs(j.panache!)))
  return [...avec]
    .sort((a, b) => b.panache! - a.panache!)
    .map((j) => {
      const part = (Math.abs(j.panache!) / max) * 50
      const positif = j.panache! > 0
      return {
        nom: nom(j.joueur),
        fill: positif ? MAUVAIS : BON,
        left: `${(positif ? 50 : 50 - part).toFixed(1)}%`,
        width: `${part.toFixed(1)}%`,
        valeur: signe(j.panache!),
      }
    })
})

/** Les titres : qui ose, qui ose trop, qui compte, et le plus beau coup. */
const titres = computed(() => {
  const avec = joueurs.value.filter((j) => j.panache !== null && j.prises > 0)
  if (!avec.length) return []
  const reussite = (j: (typeof avec)[number]) => taux(j.reussies, j.prises)
  const audacieux = [...avec].sort((a, b) => b.panache! - a.panache!)
  const out: { titre: string; qui: string; couleur: string; detail: string }[] = []
  const panacheur = audacieux.find((j) => j.panache! > 0 && reussite(j) >= tauxGroupe.value)
  if (panacheur) {
    out.push({
      titre: 'LE PANACHE',
      qui: nom(panacheur.joueur),
      couleur: BON,
      detail: `${signe(panacheur.panache!)} au-dessus du groupe, et ${reussite(panacheur)} % de réussite quand même`,
    })
  }
  const kamikaze = audacieux.find((j) => j.panache! > 0 && reussite(j) < tauxGroupe.value)
  if (kamikaze) {
    out.push({
      titre: 'LE KAMIKAZE',
      qui: nom(kamikaze.joueur),
      couleur: MAUVAIS,
      detail: `${signe(kamikaze.panache!)} au-dessus du groupe, ${reussite(kamikaze)} % seulement`,
    })
  }
  const comptable = [...avec].reverse().find((j) => j.panache! < 0)
  if (comptable) {
    out.push({
      titre: 'LE COMPTABLE',
      qui: nom(comptable.joueur),
      couleur: CLAIR,
      detail: `${signe(comptable.panache!)} sous le groupe, mais ${reussite(comptable)} % de réussite`,
    })
  }
  // La prise du siècle : le contrat tenu le plus haut au regard de la main.
  let siecle: { joueur: PlayerId; value: number; force: number; date: number } | null = null
  for (const a of props.archives) {
    for (const [p, j] of Object.entries(a.players)) {
      for (const d of j.detail) {
        if (!d.reussi || d.force === null || d.capot) continue
        const audace = d.value - 8 * d.force
        if (!siecle || audace > siecle.value - 8 * siecle.force) {
          siecle = { joueur: p, value: d.value, force: d.force, date: a.finishedAt }
        }
      }
    }
  }
  if (siecle) {
    const jour = new Date(siecle.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
    out.push({
      titre: 'LA PRISE DU SIÈCLE',
      qui: nom(siecle.joueur),
      couleur: BON,
      detail: `${siecle.value} avec une main de force ${siecle.force}, réussi le ${jour}`,
    })
  }
  return out
})

// Nuages : force de la main (4 → 20) en abscisse, annonce (80 → 160) en ordonnée
const posX = (force: number) => ((Math.max(4, Math.min(20, force)) - 4) / 16) * 286 + 2
const posY = (annonce: number) => 138 - ((Math.max(80, Math.min(160, annonce)) - 80) / 80) * 132
const nuages = computed(() => {
  const toutes = prisesAvecForce(props.archives)
  const habitude = habitudeDuGroupe(toutes)
  const bandes = [...habitude.keys()].sort((a, b) => a - b)
  const reference = bandes
    .map(
      (b) => `${posX(b * LARGEUR_BANDE + LARGEUR_BANDE / 2).toFixed(1)},${posY(habitude.get(b)!).toFixed(1)}`,
    )
    .join(' ')
  return joueursDe(props.archives).map((p) => {
    const prises = prisesDe(props.archives, p).filter((d) => !d.capot)
    const forces = prises.map((d) => d.force!).sort((a, b) => a - b)
    const mediane = forces.length ? forces[Math.floor(forces.length / 2)] : null
    return {
      id: p,
      nom: nom(p),
      resume:
        mediane === null ? 'pas encore de prise' : `force médiane ${mediane} · bande de ${LARGEUR_BANDE}`,
      reference,
      points: prises.map((d, i) => ({
        cle: i,
        left: `${((posX(d.force!) / 290) * 100).toFixed(1)}%`,
        top: `${((posY(d.value) / 150) * 100).toFixed(1)}%`,
        fill: d.reussi ? OR : ARDOISE,
      })),
    }
  })
})
</script>

<template>
  <div>
    <template v-if="vue === 'duos'">
      <!-- Quatre repères : le meilleur et le pire, en duo et en individuel -->
      <div class="mt-4 grid grid-cols-4 gap-3.5">
        <div
          v-for="r in reperes"
          :key="r.etiquette"
          class="rounded-xl px-[18px] py-3.5"
          :style="{ background: r.fond, border: `1px solid ${r.bord}` }"
        >
          <p class="text-[10px] tracking-[.1em]" :style="{ color: r.couleur }">{{ r.etiquette }}</p>
          <div class="mt-1 flex items-baseline gap-2.5">
            <span class="grow font-display text-2xl leading-none">{{ r.qui }}</span>
            <span class="font-display text-[28px] leading-none" :style="{ color: r.couleur }">{{
              r.valeur
            }}</span>
          </div>
          <p class="mt-2 text-xs leading-snug text-mist">{{ r.detail }}</p>
        </div>
      </div>

      <h2 class="mt-[26px] mb-[3px] font-display text-xl font-normal">Duo par duo</h2>
      <p class="mb-2.5 text-xs text-sage">
        {{
          joueursDe(archives).length <= 4
            ? "Les six paires possibles. Chaque paire n'a qu'un adversaire possible : les deux autres joueurs."
            : "Les paires qui ont joué ensemble, et les paires qu'elles ont affrontées."
        }}
      </p>
      <table class="w-full border-collapse text-[13px]">
        <thead>
          <tr class="text-[10px] tracking-[.1em] text-dusk">
            <th colspan="2" class="pb-[5px]"></th>
            <th colspan="5" class="border-b border-l border-white/14 pb-[5px] text-center font-semibold">
              PARTIES
            </th>
            <th colspan="7" class="border-b border-l border-white/14 pb-[5px] text-center font-semibold">
              DONNES
            </th>
          </tr>
          <tr class="text-[10px] tracking-[.05em] text-sage">
            <th
              v-for="(c, i) in colDuos"
              :key="i"
              class="pt-[7px] pr-4 pb-2 font-semibold"
              :style="{ textAlign: c.align as 'left' | 'right', borderLeft: c.sep }"
            >
              {{ c.t }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in lignesDuos" :key="d.cle" class="border-t border-white/7">
            <td class="py-2.5 pr-4 font-semibold whitespace-nowrap">{{ d.paire }}</td>
            <td class="py-2.5 pr-4 whitespace-nowrap text-sage">{{ d.contre }}</td>
            <td
              v-for="(v, i) in d.cells"
              :key="i"
              class="py-2.5 pr-4 text-right"
              :style="{ borderLeft: v.sep }"
            >
              <span
                class="inline-block rounded-[5px] px-[7px] py-0.5 tabular-nums"
                :style="{ background: v.fond, color: v.c, fontWeight: v.w }"
                >{{ v.v }}</span
              >
            </td>
          </tr>
        </tbody>
      </table>
    </template>
    <template v-else-if="vue === 'joueurs'">
      <h2 class="mt-7 mb-[3px] font-display text-xl font-normal">Joueur par joueur</h2>
      <p class="mb-2.5 text-xs text-sage">
        {{
          joueursDe(archives).length <= 4
            ? "Les quatre jouent toutes les parties : c'est le camp qui change."
            : 'Chacun compte ses propres parties.'
        }}
        Les colonnes se trient d'un clic.
      </p>
      <table class="w-full border-collapse text-[13px]">
        <thead>
          <tr class="text-[10px] tracking-[.1em] text-dusk">
            <th class="pb-[5px]"></th>
            <th colspan="5" class="border-b border-l border-white/14 pb-[5px] text-center font-semibold">
              PARTIES
            </th>
            <th colspan="8" class="border-b border-l border-white/14 pb-[5px] text-center font-semibold">
              DONNES
            </th>
          </tr>
          <tr class="text-[10px] tracking-[.05em] text-sage">
            <th
              v-for="(c, i) in colJoueurs"
              :key="i"
              class="pt-[7px] pr-4 pb-2 font-semibold"
              :class="i > 0 ? 'cursor-pointer select-none hover:text-ivory' : ''"
              :style="{ textAlign: c.align as 'left' | 'right', borderLeft: c.sep }"
              :aria-sort="tri.col === i ? (tri.desc ? 'descending' : 'ascending') : undefined"
              @click="trier(i)"
            >
              {{ c.t }}<span v-if="tri.col === i" class="text-gold">{{ tri.desc ? ' ▾' : ' ▴' }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="j in lignesJoueurs" :key="j.id" class="border-t border-white/7">
            <td class="py-2.5 pr-4 font-semibold whitespace-nowrap">{{ j.nom }}</td>
            <td
              v-for="(v, i) in j.cells"
              :key="i"
              class="py-2.5 pr-4 text-right"
              :style="{ borderLeft: v.sep }"
            >
              <span
                class="inline-block rounded-[5px] px-[7px] py-0.5 tabular-nums"
                :style="{ background: v.fond, color: v.c, fontWeight: v.w }"
                >{{ v.v }}</span
              >
            </td>
          </tr>
        </tbody>
      </table>

      <h2 class="mt-7 mb-2.5 font-display text-xl font-normal">Belotes, impasses, étoiles et réflexion</h2>
      <div class="grid grid-cols-4 gap-4">
        <div
          v-for="d in details"
          :key="d.nom"
          class="rounded-xl border border-white/8 bg-white/4 px-[18px] py-3.5"
        >
          <p class="mb-2.5 text-[15px] font-semibold">{{ d.nom }}</p>
          <div v-for="l in d.lignes" :key="l.quoi" class="flex items-baseline gap-2.5 py-[5px]">
            <span class="grow text-xs text-sage">{{ l.quoi }}</span>
            <span
              class="text-sm font-semibold whitespace-nowrap tabular-nums"
              :style="{ color: l.couleur }"
              >{{ l.valeur }}</span
            >
          </div>
        </div>
      </div>

      <h2 class="mt-[34px] mb-1 font-display text-xl font-normal">Jusqu'où chacun peut monter</h2>
      <p class="mb-3 text-[13px] text-sage">
        Hauteur de la barre = contrats pris à ce palier · part dorée = contrats passés
      </p>
      <div
        class="flex flex-wrap items-center gap-2 rounded-xl border border-white/8 bg-white/4 px-3.5 py-2.5"
      >
        <span class="mr-1 text-[11px] tracking-[.06em] text-dusk">AFFICHER</span>
        <button
          v-for="f in filtres"
          :key="f.nom"
          type="button"
          class="cursor-pointer rounded-full border px-3.5 py-1.5 text-[12.5px] transition"
          :class="
            filtre.nom === f.nom
              ? 'border-gold bg-gold/20 font-semibold text-gold'
              : 'border-white/14 font-medium text-mist hover:border-white/35'
          "
          @click="choix = f.nom"
        >
          {{ f.nom }}
        </button>
      </div>
      <div class="mt-[18px] grid grid-cols-[1.5fr_1fr] gap-9">
        <section>
          <div class="flex items-baseline gap-3">
            <h3 class="text-base font-semibold">{{ filtre.nom }}</h3>
            <p class="text-[12.5px] text-sage">{{ resumeFiltre }}</p>
            <span class="ml-auto flex gap-3.5 text-xs text-mist">
              <span class="flex items-center gap-1.5"
                ><span class="size-[11px] rounded-[3px] bg-gold"></span>réussis</span
              >
              <span class="flex items-center gap-1.5"
                ><span class="size-[11px] rounded-[3px] bg-[#5d7a70]"></span>chutés</span
              >
            </span>
          </div>
          <div class="mt-3 flex items-end gap-2.5">
            <div v-for="p in grand" :key="p.palier" class="flex grow flex-col items-center">
              <div class="flex h-[300px] items-end">
                <div
                  v-if="p.total"
                  class="relative flex w-[78px] flex-col gap-0.5"
                  :style="{ height: p.hTotal }"
                  :title="`${p.detail} contrats tenus`"
                >
                  <div class="rounded-t bg-[#5d7a70]" :style="{ flexGrow: p.partChute }"></div>
                  <div class="rounded-b bg-gold" :style="{ flexGrow: p.partReussi }"></div>
                  <span
                    class="absolute inset-x-0 bottom-[7px] text-center text-sm font-bold"
                    :style="{ color: p.pctCouleur }"
                    >{{ p.pct }}</span
                  >
                </div>
                <div
                  v-else
                  class="h-2.5 w-[78px] rounded border border-dashed border-white/20"
                  title="jamais pris"
                ></div>
              </div>
              <span class="mt-2 text-[13px] font-semibold">{{ p.palier }}</span>
              <span class="mt-0.5 text-[11px] text-dusk">{{ p.detail }}</span>
            </div>
          </div>
        </section>
        <section>
          <h3 class="mb-0.5 text-base font-semibold">
            {{ joueursDe(archives).length === 4 ? 'Les quatre' : 'Chacun' }}, à la même échelle
          </h3>
          <p class="mb-2.5 text-xs text-sage">
            Le nombre inscrit dans chaque barre est le taux de réussite, en pourcentage.
          </p>
          <div class="grid grid-cols-2 gap-3">
            <div
              v-for="j in petits"
              :key="j.id"
              class="rounded-[11px] px-3 py-2.5"
              :style="{ background: j.fond, border: `1px solid ${j.bord}` }"
            >
              <div class="flex items-baseline gap-1.5">
                <span class="grow text-[13px] font-semibold">{{ j.nom }}</span>
                <span class="text-xs font-bold" :style="{ color: j.couleur }">{{ j.global }}</span>
              </div>
              <div class="mt-2 flex items-end gap-1">
                <div v-for="b in j.barres" :key="b.palier" class="flex grow flex-col items-center">
                  <div class="flex h-[100px] items-end">
                    <div
                      v-if="b.total"
                      class="relative flex w-[22px] flex-col gap-0.5"
                      :style="{ height: b.hTotal }"
                    >
                      <div class="rounded-t-[3px] bg-[#5d7a70]" :style="{ flexGrow: b.partChute }"></div>
                      <div class="rounded-b-[3px] bg-gold" :style="{ flexGrow: b.partReussi }"></div>
                      <span
                        class="absolute inset-x-0 bottom-[3px] text-center text-[9px] font-bold"
                        :style="{ color: b.pctCouleur }"
                        >{{ b.pctCourt }}</span
                      >
                    </div>
                  </div>
                  <span class="mt-1 text-[8px] text-dusk">{{ b.palier }}</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <h2 class="mt-9 mb-1 font-display text-xl font-normal">Le panache</h2>
      <p class="mb-3.5 text-[13px] text-sage">
        Force de main : +{{ BAREME.atout }} par atout, +{{ BAREME.valetAtout }} pour le valet, +{{
          BAREME.neufAtout
        }}
        pour le 9, +{{ BAREME.asExterieur }} par as extérieur, +{{ BAREME.atoutSupplementaire }} par atout
        au-delà du quatrième, +{{ BAREME.chicane }} par chicane. Le panache est l'écart moyen entre ce qu'un
        joueur annonce et ce que le groupe annonce habituellement avec la même main.
      </p>
      <div class="grid grid-cols-[1fr_1.6fr] gap-9">
        <section>
          <h3 class="mb-3 text-[15px] font-semibold">Audacieux ou prudent</h3>
          <p v-if="!panache.length" class="text-sm text-sage">
            Pas encore assez de prises pour comparer les tempéraments.
          </p>
          <div class="flex flex-col gap-2.5">
            <div v-for="p in panache" :key="p.nom" class="flex items-center gap-3.5">
              <span class="w-[74px] text-right text-sm font-semibold">{{ p.nom }}</span>
              <div class="relative h-[30px] grow">
                <div class="absolute -top-[3px] -bottom-[3px] left-1/2 w-px bg-white/22"></div>
                <div
                  class="absolute top-0 h-[30px] rounded"
                  :style="{ background: p.fill, left: p.left, width: p.width }"
                ></div>
              </div>
              <span class="w-11 text-sm font-bold tabular-nums" :style="{ color: p.fill }">{{
                p.valeur
              }}</span>
            </div>
          </div>
          <div v-if="panache.length" class="mt-2 ml-[88px] flex justify-between text-[11px] text-dusk">
            <span>plus prudent que le groupe</span>
            <span>plus audacieux</span>
          </div>
          <div class="mt-4 flex flex-col gap-2">
            <div
              v-for="t in titres"
              :key="t.titre"
              class="flex items-baseline gap-3 rounded-[10px] border border-white/8 bg-white/4 px-[15px] py-[11px]"
            >
              <span class="w-[140px] text-[12.5px] font-semibold" :style="{ color: t.couleur }">{{
                t.titre
              }}</span>
              <span class="text-sm font-semibold">{{ t.qui }}</span>
              <span class="grow text-right text-xs text-sage">{{ t.detail }}</span>
            </div>
          </div>
        </section>
        <section>
          <div class="flex items-baseline gap-3.5">
            <h3 class="text-[15px] font-semibold">Ce qu'il lui faut en main pour partir</h3>
            <span class="ml-auto flex gap-3.5 text-xs text-mist">
              <span class="flex items-center gap-1.5"
                ><span class="size-2.5 rounded-full bg-gold"></span>contrat réussi</span
              >
              <span class="flex items-center gap-1.5"
                ><span class="size-2.5 rounded-full bg-[#5d7a70]"></span>contrat chuté</span
              >
              <span class="flex items-center gap-1.5">
                <span class="w-3.5 border-t-2 border-dashed border-mist/60"></span>habitude du groupe
              </span>
            </span>
          </div>
          <div class="mt-2.5 grid grid-cols-2 gap-3.5">
            <div
              v-for="n in nuages"
              :key="n.id"
              class="rounded-[11px] border border-white/8 bg-white/4 px-[13px] pt-[11px] pb-[9px]"
            >
              <div class="flex items-baseline gap-2">
                <span class="grow text-[13px] font-semibold">{{ n.nom }}</span>
                <span class="text-[11.5px] text-sage">{{ n.resume }}</span>
              </div>
              <div class="mt-2 flex gap-1.5">
                <div class="flex flex-col justify-between pt-0.5 pb-[18px] text-[9px] text-dusk">
                  <span>160</span><span>120</span><span>80</span>
                </div>
                <div class="grow">
                  <div class="relative h-[140px]">
                    <svg
                      viewBox="0 0 290 150"
                      width="100%"
                      height="140"
                      preserveAspectRatio="none"
                      class="absolute inset-0"
                      role="img"
                      :aria-label="`${n.nom} : force de main et hauteur d'annonce`"
                    >
                      <g stroke="rgba(255,255,255,.07)" stroke-width="1">
                        <line x1="0" y1="6" x2="290" y2="6" />
                        <line x1="0" y1="72" x2="290" y2="72" />
                        <line x1="0" y1="138" x2="290" y2="138" />
                      </g>
                      <polyline
                        :points="n.reference"
                        fill="none"
                        stroke="rgba(207,224,216,.5)"
                        stroke-width="2"
                        stroke-dasharray="5 4"
                        vector-effect="non-scaling-stroke"
                      />
                    </svg>
                    <!-- Les points en HTML : ils restent ronds quelle que soit la largeur -->
                    <span
                      v-for="pt in n.points"
                      :key="pt.cle"
                      class="absolute size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#0a2a1f]"
                      :style="{ left: pt.left, top: pt.top, background: pt.fill }"
                    ></span>
                  </div>
                  <div class="flex justify-between text-[9px] text-dusk">
                    <span>main faible</span><span>main forte</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </template>
    <div v-else-if="vue === 'encheres'" class="mt-4 grid grid-cols-2 items-start gap-x-10">
      <StatsEncheres :joueurs="lesJoueurs" :couleurs="couleursJ" :annonces="annonces" :roles="roles" />
      <StatsEcarts :joueurs="lesJoueurs" :couleurs="couleursJ" :ecarts="ecarts" />
    </div>
    <div v-else-if="vue === 'temps'" class="mt-4 grid grid-cols-2 items-start gap-x-10">
      <StatsTemps :joueurs="lesJoueurs" :couleurs="couleursJ" :temps="temps" />
    </div>
    <div v-else class="mt-4 grid grid-cols-2 items-start gap-x-10">
      <StatsParties :archives="archives" :non-finies="nonFinies" />
    </div>

    <p v-if="vue === 'duos' || vue === 'joueurs'" class="mt-6 text-xs leading-relaxed text-dusk">
      <b class="text-mist">Lecture.</b>
      L'or et le bleu désignent les équipes, jamais la qualité d'un résultat ; le vert et le rouge sont
      réservés aux valeurs, et le signe est toujours écrit. Les pourcentages portent un fond dégradé, d'autant
      plus soutenu que le taux est élevé. « Pire score » remplace le maximum, qui tourne toujours autour de
      1000 puisque la partie s'y arrête. « Bilan » est le net par donne : points marqués en prenant, moins
      points offerts en chutant.
    </p>
  </div>
</template>
