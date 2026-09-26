/**
 * Configuration Vitest des scripts longs, hors des tests habituels :
 *
 * - `npm run seed:stats` : historique fictif, dans l'émulateur, toujours.
 * - `npm run seed:stats:prod` : vraie base, en mode `semis-prod` (le mode `test` forcerait
 *   l'émulateur). Le script exige en plus `SEED_CONFIRME=<identifiant du projet>`.
 * - `npm run tournoi` : bots contre bots, sans Firebase.
 */
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => ({
  test: {
    include: ['scripts/**/*.{seed,bench}.ts'],
    env: mode === 'semis-prod' ? {} : { VITE_USE_EMULATORS: '1' },
  },
}))
