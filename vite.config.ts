import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Déploiement GitHub Pages : https://romainfjgaspard.github.io/coinche/
  base: '/coinche/',
  plugins: [vue(), tailwindcss()],
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Les tests d'émulateur partagent une seule base : `clearFirestore` d'un fichier
    // effacerait les données d'un autre s'ils tournaient en parallèle.
    fileParallelism: false,
    // Jamais la vraie base depuis un test, quelles que soient les clés de `.env.local`.
    env: { VITE_USE_EMULATORS: '1' },
  },
})
