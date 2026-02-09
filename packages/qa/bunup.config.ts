import { defineConfig } from 'bunup'

export default defineConfig({
  entry: ['src/oxlint.ts', 'src/prettier.ts', 'src/prettier-tailwind.ts', 'src/tsconfig.ts', 'src/testkit/index.ts'],
  format: ['esm'],
  outDir: 'dist',
  sourcemap: true,
  target: 'node',
})
