/**
 * Le tournoi entre bots (`npm run tournoi`) : long, donc hors des tests habituels.
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['scripts/**/*.bench.ts'] },
})
