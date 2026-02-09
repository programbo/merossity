import { defineConfig } from 'bunup'

export default defineConfig({
  entry: ['index.ts'],
  outDir: 'dist',
  format: ['esm', 'cjs'],
  target: 'node',
  sourcemap: true,
  dts: true,
})
