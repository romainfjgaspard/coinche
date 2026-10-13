/**
 * Les symboles de couleur, en tracés vectoriels.
 *
 * Le cœur et le pique sont ceux des figures (svg-cards, David Bellot, LGPL 2.1+ — voir
 * public/cards/LICENCE.md) ; le carreau et le trèfle sont redessinés dans le même
 * esprit : carreau aux flancs creusés, trèfle à trois feuilles rondes et pied évasé.
 * Les caractères ♠♥♦♣ de la police ne ressemblaient pas aux figures et ne se
 * centraient jamais exactement dans une pastille.
 */
import type { Suit } from './cards'

export interface SuitPath {
  /** Cadre du tracé, serré au plus près du dessin : il se centre sans retouche. */
  viewBox: string
  d: string
}

export const SUIT_PATH: Record<Suit, SuitPath> = {
  // Le grand cœur du Roi de cœur.
  h: {
    viewBox: '14.28 10.08 39.0 40.43',
    d: 'M14.28 20.33c0 12 15 20.7 19.42 30.18 4.44-9.46 19.49-18.1 19.57-30.08a10 10 0 0 0-9.72-10.25 10 10 0 0 0-9.78 10.2 10 10 0 0 0-9.72-10.25 10 10 0 0 0-9.77 10.2z',
  },
  // Le pique de l'index du Roi de pique : le fer, puis le pied.
  s: {
    viewBox: '11.89 29.02 8.85 10.41',
    d:
      'M20.743 34.756c-.01-2.28-3.423-3.934-4.426-5.739-1.002 1.805-4.416 3.459-4.426 5.739-.004 1.077.991 1.949 2.213 1.949s2.213-.872 2.213-1.949c0 1.077.99 1.949 2.213 1.949s2.213-.872 2.213-1.949z' +
      'M18.889 39.429c-1.095.001-1.671-1.167-1.974-2.335a11.738 11.738 0 0 1-.33-2.337l-.56-.006s-.105 4.675-2.295 4.677z',
  },
  // Carreau aux flancs légèrement creusés, comme sur les figures.
  d: {
    viewBox: '12 0 76 100',
    d: 'M50 0C57 20 70 37 88 50 70 63 57 80 50 100 43 80 30 63 12 50 30 37 43 20 50 0z',
  },
  // Trèfle : trois feuilles rondes, un cœur plein, un pied qui s'évase.
  c: {
    viewBox: '3 2 94 96',
    d:
      'M50 2a21 21 0 1 1 0 42 21 21 0 1 1 0-42z' +
      'M24 32a21 21 0 1 1 0 42 21 21 0 1 1 0-42z' +
      'M76 32a21 21 0 1 1 0 42 21 21 0 1 1 0-42z' +
      'M36 40h28l-14 18z' +
      'M47 50h6c0 22 8 36 22 48H25c14-12 22-26 22-48z',
  },
}
