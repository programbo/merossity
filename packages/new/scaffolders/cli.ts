import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import {
  ensureTargetDir,
  ensureTemplates,
  run,
  runQaInit,
  runWorkspaceInstall,
  ROOT_DIR,
  updatePackageName,
} from './utils'

export const metadata = {
  defaultRoot: 'packages',
} as const

type CliTuiOption = 'ink' | 'fullscreen'

const readJson = async <TData>(filePath: string): Promise<TData> => {
  const contents = await readFile(filePath, 'utf8')
  return JSON.parse(contents) as TData
}

const writeJson = async (filePath: string, data: unknown) => {
  const contents = `${JSON.stringify(data, undefined, 2)}\n`
  await writeFile(filePath, contents, 'utf8')
}

const ensureTsconfigForInk = async (targetDir: string) => {
  const tsconfigPath = path.join(targetDir, 'tsconfig.json')
  if (!existsSync(tsconfigPath)) return
  const tsconfig = await readJson<Record<string, unknown>>(tsconfigPath)
  const compilerOptions = (tsconfig.compilerOptions ?? {}) as Record<string, unknown>
  if (!compilerOptions.jsx) {
    compilerOptions.jsx = 'react-jsx'
  }
  tsconfig.compilerOptions = compilerOptions
  await writeJson(tsconfigPath, tsconfig)
}

const ensureInkDeps = async (targetDir: string, tui: CliTuiOption) => {
  const pkgPath = path.join(targetDir, 'package.json')
  if (!existsSync(pkgPath)) return

  const pkg = await readJson<Record<string, unknown>>(pkgPath)
  const deps = (pkg.dependencies ?? {}) as Record<string, string>
  const devDeps = (pkg.devDependencies ?? {}) as Record<string, string>

  // Ink 6.x requires React 19+. Pin to Ink 5.x for a more conservative default.
  deps.ink = deps.ink ?? '5.2.1'
  deps.react = deps.react ?? '^18.2.0'
  if (tui === 'fullscreen') {
    deps['fullscreen-ink'] = deps['fullscreen-ink'] ?? '0.1.0'
  }

  devDeps['@types/react'] = devDeps['@types/react'] ?? '^18.2.0'

  pkg.dependencies = deps
  pkg.devDependencies = devDeps
  await writeJson(pkgPath, pkg)
}

const writeInkFiles = async (targetDir: string, tui: CliTuiOption) => {
  const tuiPath = path.join(targetDir, 'src', 'tui.tsx')
  const isFullscreen = tui === 'fullscreen'

  const contents = `${isFullscreen ? 'import { Box, Text, useApp, useInput } from "ink";\nimport { withFullScreen } from "fullscreen-ink";\n' : 'import { Box, Text, render, useApp, useInput } from "ink";\n'}

function App() {
  const app = useApp();
  useInput((input, key) => {
    if (input === "q" || key.escape) {
      app.exit();
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text>Ink TUI is running.</Text>
      <Text dimColor>Press "q" (or Esc) to exit.</Text>
    </Box>
  );
}

export const runTui = async () => {
  ${isFullscreen ? 'const ink = withFullScreen(<App />);\n  await ink.start();\n  await ink.waitUntilExit();' : 'const { waitUntilExit } = render(<App />);\n  await waitUntilExit();'}
};
`

  await writeFile(tuiPath, contents, 'utf8')
}

const writeInkEntrypoint = async (targetDir: string) => {
  const entryPath = path.join(targetDir, 'src', 'index.ts')
  if (!existsSync(entryPath)) return

  const contents = `#!/usr/bin/env node

import { createRequire } from "node:module";
import {
  Clerc,
  NoCommandSpecifiedError,
  completionsPlugin,
  friendlyErrorPlugin,
  helpPlugin,
  notFoundPlugin,
  strictFlagsPlugin,
  updateNotifierPlugin,
  defineCommand,
  versionPlugin,
} from "clerc";

import { runTui } from "./tui";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as {
  name?: string;
  version?: string;
  description?: string;
};

const cli = Clerc.create({
  scriptName: "cli",
  name: pkg.name ?? "cli",
  version: pkg.version ?? "0.0.0",
  description: pkg.description ?? "A TUI CLI built with Ink + Clerc.",
})
  .use(versionPlugin())
  .use(helpPlugin({ showHelpWhenNoCommandSpecified: false }))
  .use(completionsPlugin())
  .use(strictFlagsPlugin())
  .use(notFoundPlugin())
  .use(friendlyErrorPlugin());

if (process.env.CLI_UPDATE_NOTIFIER === "1") {
  cli.use(updateNotifierPlugin({ pkg: { name: pkg.name ?? "cli", version: pkg.version ?? "0.0.0" } }));
}

// Default to the TUI when no command is provided (but keep '--help' / '--version' working).
cli.interceptor(async (_ctx, next) => {
  try {
    await next();
  } catch (error) {
    if (error instanceof NoCommandSpecifiedError) {
      await runTui();
      return;
    }
    throw error;
  }
});

cli.command(
  defineCommand(
    {
      name: "tui",
      description: "Start the TUI",
    },
    async () => {
      await runTui();
    },
  ),
);

cli.command(
  defineCommand(
    {
      name: "greet",
      description: "Print a greeting",
      parameters: ["[name]"],
    },
    ({ parameters }) => {
      console.log(\`Hello, \${parameters.name ?? "world"}!\`);
    },
  ),
);

await cli.parse();
`

  await writeFile(entryPath, contents, 'utf8')
}

const writeInkTests = async (targetDir: string) => {
  const testPath = path.join(targetDir, 'tests', 'cli.test.ts')
  if (!existsSync(testPath)) return

  const contents = `import path from "node:path";
import { describe, expect, it } from "bun:test";

const CLI_PATH = path.join(import.meta.dir, "..", "src", "index.ts");

const runCli = async (args: string[]) => {
  const proc = Bun.spawn(["bun", CLI_PATH, ...args], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;
  const stdout = proc.stdout ? await new Response(proc.stdout).text() : "";
  const stderr = proc.stderr ? await new Response(proc.stderr).text() : "";

  return { exitCode, stdout, stderr };
};

describe("cli (ink)", () => {
  it("prints help with --help (does not start the TUI)", async () => {
    const { exitCode, stdout, stderr } = await runCli(["--help"]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("Usage");
    expect(stdout).toContain("cli");
  });

  it("runs greet", async () => {
    const { exitCode, stdout, stderr } = await runCli(["greet", "bun"]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("Hello, bun!");
  });
});
`

  await writeFile(testPath, contents, 'utf8')
}

const applyInkTui = async (targetDir: string, tui: CliTuiOption) => {
  await ensureInkDeps(targetDir, tui)
  await ensureTsconfigForInk(targetDir)
  await writeInkFiles(targetDir, tui)
  await writeInkEntrypoint(targetDir)
  await writeInkTests(targetDir)
}

export const scaffoldCli = async (targetDir: string, options: { install: boolean; tui?: CliTuiOption }) => {
  await ensureTargetDir(targetDir)
  ensureTemplates()
  await run('bun', ['create', 'cli', path.relative(ROOT_DIR, targetDir), '--no-install', '--no-git'], ROOT_DIR)
  await runQaInit(targetDir, 'cli', false)
  await updatePackageName(targetDir)
  if (options.tui) {
    await applyInkTui(targetDir, options.tui)
  }
  if (options.install) {
    await runWorkspaceInstall()
  }
}
