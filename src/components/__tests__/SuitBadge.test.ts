// @vitest-environment happy-dom
/**
 * La pastille ivoire de l'atout : un symbole décalé dans son rond se voit tout de suite.
 * Défaut vu le 20/10/2026 : à 20 px, 3,5 px de marge de chaque côté, et le navigateur
 * arrondissait — tous les symboles penchaient à droite.
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SuitBadge from '../SuitBadge.vue'

const iconWidth = (suit: 's' | 'h' | 'd' | 'c', size: number): number => {
  const svg = mount(SuitBadge, { props: { suit, size } }).find('svg')
  return parseFloat(svg.attributes('style')?.match(/width: ([\d.]+)px/)?.[1] ?? 'NaN')
}

describe('SuitBadge', () => {
  it('laisse la même marge, en pixels entiers, de chaque côté du symbole', () => {
    for (const size of [20, 21, 22, 24, 27, 28, 30, 38]) {
      const margin = (size - iconWidth('h', size)) / 2
      expect(Number.isInteger(margin)).toBe(true)
    }
  })

  it('descend le cœur, dont la masse est en haut, et laisse les autres centrés', () => {
    const style = (suit: 's' | 'h' | 'd' | 'c') =>
      mount(SuitBadge, { props: { suit, size: 28 } })
        .find('svg')
        .attributes('style') ?? ''
    expect(style('h')).toMatch(/translateY\([\d.]+px\)/)
    for (const s of ['s', 'd', 'c'] as const) expect(style(s)).not.toContain('translateY')
  })

  it('agrandit le carreau, plus étroit que les autres', () => {
    const style = mount(SuitBadge, { props: { suit: 'd', size: 28 } })
      .find('svg')
      .attributes('style')
    expect(style).toMatch(/scale\(1\.1\d*\)/)
  })

  it('écrit SA et TA en lettres', () => {
    expect(mount(SuitBadge, { props: { suit: 'sa', size: 24 } }).text()).toBe('SA')
  })
})
