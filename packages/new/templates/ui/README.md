# ui

Tailwind CSS UI library template.

## Usage

```ts
import '@bun-monorepo-template/ui/index.css'
import { Radio, RadioGroup, type RadioProps } from '@bun-monorepo-template/ui/radio'
import { tv, twMerge, twJoin, type VariantProps } from '@bun-monorepo-template/ui/utils'
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
