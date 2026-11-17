/**
 * Recalcul des archives depuis le journal de chaque partie.
 *
 * Une archive n'est qu'un condensé du journal (`games/{code}/events`), qui garde tout. Quand
 * l'archive apprend à compter quelque chose de nouveau (les plis, le résumé des donnes, les
 * coinches de désespoir…), ce script reconstruit toutes les archives avec le code de l'app,
 * pour que les anciennes parties en profitent aussi. Ce qui ne vient pas du journal est
 * gardé tel quel : placement, bots, objectif, blitz, soirée, date de fin.
 *
 * Par défaut, **rien n'est écrit** : le script affiche ce qui changerait, archive par
 * archive. Une archive dont le score, le vainqueur ou le nombre de donnes ne se retrouvent
 * pas dans le journal est laissée de côté. Avant d'écrire, il enregistre une copie de toutes
 * les archives dans `archives-sauvegarde-<date>.json`.
 *
 * Vraie base, depuis Google Cloud Shell (connecté au compte du projet, aucune clé) :
 *   git clone https://github.com/romainfjgaspard/coinche && cd coinche && npm ci
 *   npm run archives:recalcul                                   # simulation
 *   ECRIRE=coinche-e708b npm run archives:recalcul              # écriture
 * Émulateur : FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 PROJECT=demo-coinche, en plus.
 */
import { writeFileSync } from 'node:fs'
import { describe, it } from 'vitest'
import { initializeApp } from 'firebase-admin/app'
import { type Firestore, getFirestore } from 'firebase-admin/firestore'
import { type Archive, buildArchive } from '../src/game/archive'
import type { Card } from '../src/game/cards'
import type { GameEvent } from '../src/game/events'
import { withoutUndone } from '../src/game/replay'
import { RULES } from '../src/game/rules'

const PROJECT = process.env.PROJECT ?? 'coinche-e708b'
const EMULATOR = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
const WRITE = process.env.ECRIRE === PROJECT

function connect(): Firestore {
  const db = getFirestore(initializeApp({ projectId: PROJECT }))
  // REST plutôt que gRPC : dans Cloud Shell, une requête gRPC peut rester pendue 300 s.
  // L'émulateur, lui, ne parle REST qu'avec des identifiants Google : on y garde gRPC.
  db.settings({ ignoreUndefinedProperties: true, ...(EMULATOR ? {} : { preferRest: true }) })
  return db
}

/**
 * Une lecture qui ne répond pas en une minute est abandonnée et relancée, jusqu'à 4 fois :
 * dans Cloud Shell, une requête peut rester pendue sans jamais échouer.
 */
async function patiently<T>(label: string, read: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} : pas de réponse en 60 s`)), 60_000)
    })
    try {
      return await Promise.race([read(), timeout])
    } catch (e) {
      if (attempt === 4) throw e
      console.log(`   ${e instanceof Error ? e.message : String(e)}, nouvel essai (${attempt + 1}/4)…`)
    } finally {
      clearTimeout(timer)
    }
  }
}

/** Le journal d'une partie, par paquets : une grosse lecture d'un coup peut expirer. */
async function readEvents(db: Firestore, code: string): Promise<GameEvent[]> {
  const ref = db.collection('games').doc(code).collection('events')
  const events: GameEvent[] = []
  let last: number | null = null
  for (;;) {
    let q = ref.orderBy('seq').limit(300)
    if (last !== null) q = q.startAfter(last)
    const query = q
    const page = (await patiently(`${code}, journal après ${events.length}`, () => query.get())).docs.map(
      (d) => d.data() as GameEvent,
    )
    events.push(...page)
    if (page.length < 300) return events
    last = page[page.length - 1].seq
  }
}

async function readHands(db: Firestore, code: string): Promise<Record<number, Record<string, Card[]>>> {
  const ref = db.collection('games').doc(code).collection('deals')
  const snap = await patiently(`${code}, mains`, () => ref.get())
  return Object.fromEntries(
    snap.docs.map((d) => [Number(d.id), (d.data().hands ?? {}) as Record<string, Card[]>]),
  )
}

/** La nouvelle archive : le journal recalculé, et ce qui ne s'y trouve pas, repris de l'ancienne. */
function rebuild(old: Archive, events: GameEvent[], hands: Record<number, Record<string, Card[]>>): Archive {
  return {
    ...buildArchive(
      old.code,
      withoutUndone(events),
      old.seating,
      hands,
      old.bots ?? [],
      old.target ?? RULES.target,
    ),
    finishedAt: old.finishedAt,
    ...(old.target !== undefined ? { target: old.target } : {}),
    ...(old.blitz !== undefined ? { blitz: old.blitz } : {}),
    ...(old.evening !== undefined ? { evening: old.evening } : {}),
  }
}

/** Ce qui change, en lignes lisibles : un nombre qui bouge, un champ qui apparaît. */
function changes(old: Archive, next: Archive): string[] {
  const out: string[] = []
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  const describe = (v: unknown) =>
    Array.isArray(v) ? `${v.length} élément(s)` : typeof v === 'object' && v !== null ? '{…}' : String(v)
  const compare = (path: string, a: Record<string, unknown>, b: Record<string, unknown>) => {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (same(a[k], b[k])) continue
      if (a[k] === undefined) out.push(`+ ${path}${k} : ${describe(b[k])}`)
      else if (b[k] === undefined) out.push(`- ${path}${k}`)
      else if (typeof a[k] === 'number' || typeof b[k] === 'number')
        out.push(`~ ${path}${k} : ${a[k]} → ${b[k]}`)
      else out.push(`~ ${path}${k}`)
    }
  }
  const { players: op, ...oRest } = old
  const { players: np, ...nRest } = next
  compare('', oRest as Record<string, unknown>, nRest as Record<string, unknown>)
  for (const p of Object.keys(np)) {
    compare(`${p}.`, (op[p] ?? {}) as Record<string, unknown>, np[p] as unknown as Record<string, unknown>)
  }
  return out
}

describe('recalcul des archives', () => {
  it(
    PROJECT + (EMULATOR ? ' (émulateur)' : ''),
    async () => {
      const db = connect()
      console.log(
        `Projet ${PROJECT}${EMULATOR ? ' (émulateur)' : ''} — ${WRITE ? 'ÉCRITURE' : 'SIMULATION, rien ne sera écrit'}\n`,
      )
      const archivesRef = db.collection('archives')
      const archives = (await patiently('archives', () => archivesRef.get())).docs.map(
        (d) => d.data() as Archive,
      )
      const next: Archive[] = []
      let skipped = 0
      for (const old of archives) {
        console.log(`${old.code} : lecture du journal…`)
        const events = await readEvents(db, old.code)
        const doc = rebuild(old, events, await readHands(db, old.code))
        // Garde-fou : le journal doit redonner le même résultat que l'archive.
        const mismatch =
          events.length === 0 ||
          !doc.scores.every((s, i) => s === old.scores[i]) ||
          doc.winner !== old.winner ||
          doc.deals !== old.deals
        const lines = changes(old, doc)
        console.log(
          `${old.code} (${new Date(old.finishedAt).toLocaleDateString('fr-FR')}) : ${mismatch ? '⚠ LAISSÉE DE CÔTÉ' : lines.length ? `${lines.length} changement(s)` : 'inchangée'}`,
        )
        if (mismatch) {
          console.log(
            `   journal : ${events.length} événements, score ${doc.scores.join('-')}, ${doc.deals} donnes ; archive : score ${old.scores.join('-')}, ${old.deals} donnes`,
          )
          skipped += 1
          continue
        }
        for (const l of lines) console.log(`   ${l}`)
        if (lines.length) next.push(doc)
      }
      console.log(
        `\n${archives.length} archives : ${next.length} ${WRITE ? 'à réécrire' : 'changeraient'}, ${skipped} laissée(s) de côté.`,
      )
      if (!WRITE) {
        if (next.length) console.log(`Pour écrire : ECRIRE=${PROJECT} npm run archives:recalcul`)
        return
      }
      const backup = `archives-sauvegarde-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
      writeFileSync(backup, JSON.stringify(archives, null, 1))
      console.log(`Copie des archives d'avant : ${backup}`)
      // Réécrire la même archive deux fois ne change rien : relancer une écriture est sans risque.
      for (const doc of next)
        await patiently(`${doc.code}, écriture`, () => archivesRef.doc(doc.code).set(doc))
      console.log(`${next.length} archive(s) réécrite(s).`)
    },
    30 * 60 * 1000,
  )
})
