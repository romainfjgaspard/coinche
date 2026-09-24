/**
 * Configuration du semis de données de démonstration.
 *
 * - `npm run seed:stats` : émulateur, toujours.
 * - `npm run seed:stats:prod` : vraie base, en mode `semis-prod` (le mode `test` forcerait
 *   l'émulateur). Le script exige en plus `SEED_CONFIRME=<identifiant du projet>`.
 */
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => ({
  test: {
    include: ['scripts/**/*.seed.ts'],
    env: mode === 'semis-prod' ? {} : { VITE_USE_EMULATORS: '1' },
  },
}))
