import { defineConfig } from 'bunup'

export default defineConfig({
  entry: ['src/index.ts', 'src/radio.tsx', 'src/utils.ts'],
  outDir: 'dist',
  format: ['esm', 'cjs'],
  target: 'node',
  sourcemap: true,
  external: ['react', 'react-dom'],
  dts: true,
})
