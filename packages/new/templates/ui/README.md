# ui

Tailwind CSS UI library template (used by `@merossity/new`).

## Usage

```ts
// Replace "@acme/ui" with your UI package name.
import '@acme/ui/index.css'
import { Radio, RadioGroup, type RadioProps } from '@acme/ui/radio'
import { tv, twMerge, twJoin, type VariantProps } from '@acme/ui/utils'
```

## Dev

```bash
bun run dev
```

## Build

```bash
bun run build
```

After creation, run:

```bash
bun run --cwd packages/qa qa:init --dir . --kind lib --tailwind
```
