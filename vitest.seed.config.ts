/** Configuration du semis de données de démonstration : `npm run seed:stats`. */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['scripts/**/*.seed.ts'],
    // Émulateur obligatoire : le script le vérifie aussi avant d'écrire quoi que ce soit.
    env: { VITE_USE_EMULATORS: '1' },
  },
})
