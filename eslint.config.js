/**
 * ESLint — l'équivalent de ruff pour le code : il repère les erreurs probables et les
 * mauvaises pratiques (ruff check). La mise en forme est laissée à Prettier (ruff format),
 * d'où `eslint-config-prettier` en dernier : il coupe les règles de style qui se
 * contrediraient.
 *
 * Configuration « à plat » (flat config) : un tableau de blocs appliqués dans l'ordre,
 * chacun pouvant cibler des fichiers précis.
 */
import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import prettier from 'eslint-config-prettier'
import vue from 'eslint-plugin-vue'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig(
  { ignores: ['dist/**', 'coverage/**', 'public/**', 'node_modules/**'] },

  // Les règles recommandées de JavaScript, TypeScript et Vue (templates compris).
  js.configs.recommended,
  tseslint.configs.recommended,
  vue.configs['flat/recommended'],

  // Dans les fichiers .vue, le bloc <script lang="ts"> est lu par le parseur TypeScript.
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },

  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // Convention du projet : types explicites, jamais de `any`.
      '@typescript-eslint/no-explicit-any': 'error',
      // Une variable inutilisée préfixée par _ est volontaire.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Les écrans s'appellent GameTable, DealResult… : un seul mot n'est pas ambigu ici.
      'vue/multi-word-component-names': 'off',
      // Traces de débogage : console.warn, console.error et console.info restent permis.
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },

  // Tests et scripts de semis : les traces console y sont le but (mesures de temps…).
  {
    files: ['tests/**', 'scripts/**', '**/__tests__/**'],
    rules: { 'no-console': 'off' },
  },

  prettier,
)
