// @vitest-environment happy-dom
/**
 * La carte : ce qui a été corrigé à l'œil doit le rester.
 * Chaque test fige un défaut réellement vu à l'écran (24/09/2026).
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PlayingCard from '../PlayingCard.vue'
import { courtCrop } from '../../game/display'
import type { Card } from '../../game/cards'

describe('PlayingCard', () => {
  it("une figure n'ajoute pas d'index : l'illustration porte déjà les siens", () => {
    const w = mount(PlayingCard, { props: { card: 'Kh', width: 120 } })
    expect(w.find('img').exists()).toBe(true)
    // Les index dessinés en CSS contiennent la lettre du rang : aucun ici.
    expect(w.text()).not.toContain('R')
  })

  it("l'illustration déborde du cadre pour cacher son propre contour de carte", () => {
    const img = mount(PlayingCard, { props: { card: 'Qs', width: 120 } }).find('img')
    // Recadrée figure par figure (courtCrop) : plus large que la carte, pour que le
    // contour dessiné dans l'image tombe hors du cadre.
    const crop = courtCrop('Qs')!
    expect(img.attributes('style')).toContain(`width: ${crop.width}`)
    expect(parseFloat(crop.width)).toBeGreaterThan(100)
    expect(img.attributes('decoding')).toBe('sync')
  })

  it('une carte à points porte ses quatre index et le bon nombre de pointes', () => {
    const w = mount(PlayingCard, { props: { card: '9d', width: 120 } })
    expect(w.find('img').exists()).toBe(false)
    // Les symboles sont des tracés vectoriels, ceux des figures : 4 index + 9 pointes.
    expect(w.findAll('svg')).toHaveLength(13)
  })

  it('les pointes du centre dominent nettement celles des index', () => {
    const w = mount(PlayingCard, { props: { card: '7s', width: 100 } })
    const sizes = w
      .findAll('svg')
      .map((s) => parseInt(s.attributes('style')?.match(/width: (\d+)px/)?.[1] ?? '0', 10))
    const index = Math.min(...sizes)
    const tip = Math.max(...sizes)
    expect(index).toBeGreaterThan(0)
    expect(tip).toBeGreaterThanOrEqual(index * 1.8)
  })

  it("les pointes ont la même taille du 7 au 10 ; seul l'as porte un grand symbole", () => {
    const tip = (card: Card) => {
      const sizes = mount(PlayingCard, { props: { card, width: 120 } })
        .findAll('svg')
        .map((x) => parseInt(x.attributes('style')?.match(/width: (\d+)px/)?.[1] ?? '0', 10))
      return Math.max(...sizes)
    }
    const sizes = (['7s', '8h', '9d', '10c'] as Card[]).map(tip)
    expect(new Set(sizes).size).toBe(1)
    expect(tip('As')).toBeGreaterThan(sizes[0] * 1.5)
  })

  it('le symbole des cartes à points est celui des figures, pas un caractère de police', () => {
    const w = mount(PlayingCard, { props: { card: '8h', width: 100 } })
    expect(w.text()).not.toContain('♥')
  })

  it('une carte injouable reçoit un voile opaque, pas de la transparence', () => {
    const w = mount(PlayingCard, { props: { card: '8c', width: 100, dimmed: true } })
    expect(w.attributes('class')).not.toContain('opacity-')
    expect(w.find('[class*="bg-[#0c2a20]"]').exists()).toBe(true)
  })

  it("l'atout est encadré tout autour, pas seulement en tête", () => {
    const w = mount(PlayingCard, { props: { card: 'Jh', width: 100, trump: true } })
    const frame = w.findAll('span').find((s) => s.attributes('style')?.includes('inset 0 0 0'))
    expect(frame).toBeDefined()
    expect(frame!.classes()).toContain('inset-0')
  })

  it('seule une carte jouable est un bouton, avec un libellé explicite', () => {
    const playable = mount(PlayingCard, { props: { card: 'Ah', clickable: true } })
    expect(playable.element.tagName).toBe('BUTTON')
    expect(playable.attributes('aria-label')).toBe('Jouer le as de cœur')
    const placedCard = mount(PlayingCard, { props: { card: 'Ah' } })
    expect(placedCard.element.tagName).toBe('DIV')
  })

  it('un clic sur une carte jouable la joue, pas sur une carte posée', async () => {
    const playable = mount(PlayingCard, { props: { card: '10c', clickable: true } })
    await playable.trigger('click')
    expect(playable.emitted('select')).toEqual([['10c']])
    const placedCard = mount(PlayingCard, { props: { card: '10c' } })
    await placedCard.trigger('click')
    expect(placedCard.emitted('select')).toBeUndefined()
  })
})
