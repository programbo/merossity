#!/usr/bin/env node

import { createRequire } from "node:module";
import {
  Clerc,
  NoCommandSpecifiedError,
  completionsPlugin,
  friendlyErrorPlugin,
  helpPlugin,
  notFoundPlugin,
  strictFlagsPlugin,
  defineCommand,
  versionPlugin,
} from "clerc";

import { merossCommands } from "./meross";

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

const runTui = async () => {
  // Lazy import so `--help`/`--version` don't require React/Ink to load.
  const mod = await import("./tui");
  await mod.runTui();
};

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

cli.command(merossCommands());

cli.command(
  defineCommand(
    {
      name: "greet",
      description: "Print a greeting",
      parameters: ["[name]"],
    },
    ({ parameters }) => {
      console.log(`Hello, ${parameters.name ?? "world"}!`);
    },
  ),
);

await cli.parse();
