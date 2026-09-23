/**
 * Journal d'événements — la source de vérité (docs/MODELE-DONNEES.md).
 *
 * Append-only : un événement écrit n'est jamais modifié ni supprimé, les règles
 * Firestore l'interdisent. L'état de la partie n'est qu'une vue matérialisée
 * reconstructible à partir de ce journal.
 *
 * Les noms de types sont en français : ce sont des données, lisibles telles quelles
 * dans la console Firestore et dans les exports.
 */
import type { Card, Suit } from './cards'
import type { BiddingEntry } from './bidding'
import type { PlayerId, Seating } from './players'
import type { Rules } from './rules'

/** Champs communs à tout événement. */
interface Base {
  seq: number
  at: number
  /** Temps de réflexion avant l'action — précieux pour les statistiques */
  thinkMs?: number
}

export type GameEvent = Base &
  (
    | {
        type: 'partie_creee'
        seats: Record<PlayerId, string>
        /** Placement de cette partie : sans lui, on ne saurait plus qui jouait avec qui. */
        seating: Seating
        /** Copie intégrale des règles : sans elle, une partie archivée devient
         *  ininterprétable dès qu'un réglage change. */
        rules: Rules
        engineVersion: number
      }
    | { type: 'donne_commencee'; dealNumber: number; dealer: PlayerId; cut: number }
    | { type: 'enchere'; player: PlayerId; round: number; entry: BiddingEntry }
    | { type: 'coinche'; player: PlayerId }
    | { type: 'surcoinche'; player: PlayerId }
    | {
        type: 'contrat_fixe'
        taker: PlayerId
        value: number
        trump: Suit | null
        multiplier: 1 | 2 | 4
        capot: boolean
        generale: boolean
      }
    | {
        type: 'carte_jouee'
        player: PlayerId
        card: Card
        trickNumber: number
        position: number
        /** Temps de réflexion : la main, elle, reste scellée dans `donne/{n}`. */
        thinkMs?: number
      }
    | { type: 'belote_annoncee'; player: PlayerId; half: 'belote' | 'rebelote' }
    | {
        type: 'pli_termine'
        trickNumber: number
        winner: PlayerId
        cards: Card[]
        points: number
        cut: boolean
        overcut: boolean
      }
    | {
        type: 'donne_terminee'
        dealNumber: number
        status: 'reussi' | 'chute' | 'capot' | 'generale'
        cardPoints: [number, number]
        compared: [number, number]
        scores: [number, number]
        /** BEL-2 — qui a annoncé sa belote, et qui l'avait sans l'annoncer */
        beloteDeclaredBy: PlayerId | null
        beloteForgottenBy: PlayerId | null
        /** DEC-8 — capot réalisé sans l'avoir annoncé : une étoile pour le preneur */
        etoile: PlayerId | null
      }
    | { type: 'donne_annulee'; dealNumber: number; reason: 'quatre_passes' }
    /** DEC-9 — trois étoiles dans la même partie : la honte complète. */
    | { type: 'honte_complete'; player: PlayerId; stars: number }
    | { type: 'partie_terminee'; scores: [number, number]; winner: 0 | 1; deals: number }
    | { type: 'joueur_connecte'; player: PlayerId }
    | { type: 'joueur_deconnecte'; player: PlayerId }
    | { type: 'message_chat'; player: PlayerId; text: string }
  )

export type GameEventType = GameEvent['type']

/**
 * `Omit` ne se distribue pas sur une union : `Omit<GameEvent, 'seq'>` ne garderait
 * que les champs communs à tous les événements. Ce conditionnel force la distribution.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/** Un événement tel qu'on le soumet : la séquence et l'horodatage sont attribués à l'écriture. */
export type NewEvent = DistributiveOmit<GameEvent, 'seq' | 'at'>
