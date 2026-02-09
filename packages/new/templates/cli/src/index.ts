#!/usr/bin/env node

import { createRequire } from "node:module";
import {
  Cli,
  completionsPlugin,
  friendlyErrorPlugin,
  notFoundPlugin,
  strictFlagsPlugin,
  updateNotifierPlugin,
  defineCommand,
} from "clerc";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as {
  name?: string;
  version?: string;
  description?: string;
};

const cli = Cli({
  // scriptName is what shows up in help output.
  scriptName: "cli",
  name: pkg.name ?? "cli",
  version: pkg.version ?? "0.0.0",
  description: pkg.description ?? "A CLI built with Clerc.",
})
  .use(completionsPlugin())
  .use(strictFlagsPlugin())
  .use(notFoundPlugin())
  .use(friendlyErrorPlugin());

// Opt-in update checks (avoid surprising background network/process behavior by default).
if (process.env.CLI_UPDATE_NOTIFIER === "1") {
  cli.use(updateNotifierPlugin({ pkg: { name: pkg.name ?? "cli", version: pkg.version ?? "0.0.0" } }));
}

cli.command(
  defineCommand(
    {
      name: "greet",
      description: "Print a greeting",
      parameters: ["[name]"],
      flags: {
        shout: {
          type: Boolean,
          default: false,
          description: "Uppercase the output",
        },
      },
    },
    ({ parameters, flags }) => {
      const name = parameters.name ?? "world";
      const message = `Hello, ${name}!`;
      console.log(flags.shout ? message.toUpperCase() : message);
    },
  ),
);

await cli.parse();
