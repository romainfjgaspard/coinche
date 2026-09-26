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
import type { BiddingEntry, Declaration } from './bidding'
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
        type: 'game_created'
        seats: Record<PlayerId, string>
        /** Placement de cette partie : sans lui, on ne saurait plus qui jouait avec qui. */
        seating: Seating | null
        /** Copie intégrale des règles : sans elle, une partie archivée devient
         *  ininterprétable dès qu'un réglage change. */
        rules: Rules
        engineVersion: number
      }
    | { type: 'deal_started'; dealNumber: number; dealer: PlayerId; cut: number }
    | { type: 'bid'; player: PlayerId; round: number; entry: BiddingEntry }
    | { type: 'coinche'; player: PlayerId }
    | { type: 'surcoinche'; player: PlayerId }
    | {
        type: 'contract_set'
        taker: PlayerId
        value: number
        trump: Suit | null
        /**
         * L'annonce complète : sans elle, sans-atout et tout-atout se confondaient
         * (`trump` vaut null dans les deux cas). Absente des donnes d'avant le 24/09/2026.
         */
        declaration?: Declaration
        multiplier: 1 | 2 | 4
        capot: boolean
        generale: boolean
      }
    | {
        type: 'card_played'
        player: PlayerId
        card: Card
        trickNumber: number
        position: number
        /** Temps de réflexion : la main, elle, reste scellée dans `deals/{n}`. */
        thinkMs?: number
      }
    | { type: 'belote_declared'; player: PlayerId; half: 'belote' | 'rebelote' }
    | {
        type: 'trick_done'
        trickNumber: number
        winner: PlayerId
        cards: Card[]
        points: number
        cut: boolean
        overcut: boolean
      }
    | {
        type: 'deal_done'
        dealNumber: number
        status: 'made' | 'down' | 'capot' | 'generale'
        cardPoints: [number, number]
        compared: [number, number]
        scores: [number, number]
        /** BEL-2 — qui a annoncé sa belote, et qui l'avait sans l'annoncer */
        beloteDeclaredBy: PlayerId | null
        beloteForgottenBy: PlayerId | null
        /** DEC-8 — capot réalisé sans l'avoir annoncé : une étoile pour le preneur */
        shameStar: PlayerId | null
        /** Blitz : donne non coinchée, marquée sans être jouée — pas de cartes à compter */
        blitz?: boolean
      }
    | { type: 'deal_cancelled'; dealNumber: number; reason: 'four_passes' }
    /** DEC-9 — trois étoiles dans la même partie : la honte complète. */
    | { type: 'full_shame'; player: PlayerId; stars: number }
    | { type: 'game_over'; scores: [number, number]; winner: 0 | 1; deals: number }
    /** Pause : personne ne joue, et l'attente ne compte dans le temps de réflexion de personne. */
    | { type: 'pause'; player: PlayerId }
    | { type: 'resume'; player: PlayerId }
    /** Un joueur arrête la partie pour tous : elle n'est pas archivée. */
    | { type: 'game_cancelled'; player: PlayerId }
    | { type: 'player_joined'; player: PlayerId }
    /** Les équipes changées au salon, avant la première donne. */
    | { type: 'seating_set'; player: PlayerId; seating: Seating; dealer: PlayerId }
    | { type: 'player_left'; player: PlayerId }
    | { type: 'chat_message'; player: PlayerId; text: string }
  )

/**
 * `Omit` ne se distribue pas sur une union : `Omit<GameEvent, 'seq'>` ne garderait
 * que les champs communs à tous les événements. Ce conditionnel force la distribution.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/** Un événement tel qu'on le soumet : la séquence et l'horodatage sont attribués à l'écriture. */
export type NewEvent = DistributiveOmit<GameEvent, 'seq' | 'at'>
