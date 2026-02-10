import os from "node:os";
import path from "node:path";

import { defineCommand } from "clerc";

import {
  MerossDumpParseError,
  getSystemAll,
  loadMerossCloudDumpFile,
  pingSweep,
  resolveIpv4FromMac,
  setToggleX,
  type MerossCloudDump,
} from "@merossity/core/meross";

const defaultDumpPath = () => path.join(os.homedir(), ".config", "merossity", "meross-cloud-dump.json");

const loadDumpMaybe = async (dumpPath?: string): Promise<MerossCloudDump | null> => {
  const candidate = dumpPath ?? process.env.MEROSS_DUMP ?? defaultDumpPath();
  try {
    return await loadMerossCloudDumpFile(candidate);
  } catch (e) {
    if (e instanceof MerossDumpParseError) return null;
    // File missing, perms, etc.
    return null;
  }
};

const pickKey = (explicitKey?: string, dump?: MerossCloudDump | null): string | null =>
  explicitKey ?? process.env.MEROSS_KEY ?? dump?.cloud?.key ?? null;

const printDevicesTable = (dump: MerossCloudDump) => {
  const rows = dump.devices.map((d) => ({
    name: String(d.devName ?? ""),
    type: String(d.deviceType ?? ""),
    online: String(d.onlineStatus ?? ""),
    uuid: String(d.uuid ?? ""),
  }));

  const header = ["NAME", "TYPE", "ONLINE", "UUID"] as const;
  const widths: [number, number, number, number] = [
    Math.min(36, Math.max(header[0].length, ...rows.map((r) => r.name.length))),
    Math.min(12, Math.max(header[1].length, ...rows.map((r) => r.type.length))),
    Math.min(10, Math.max(header[2].length, ...rows.map((r) => r.online.length))),
    Math.max(header[3].length, ...rows.map((r) => r.uuid.length)),
  ];
  const [wName, wType, wOnline, wUuid] = widths;

  const pad = (s: string, w: number) => (s.length >= w ? s.slice(0, w) : s + " ".repeat(w - s.length));
  console.log(
    `${pad(header[0], wName)}  ${pad(header[1], wType)}  ${pad(header[2], wOnline)}  ${pad(header[3], wUuid)}`,
  );
  console.log(`${"-".repeat(wName)}  ${"-".repeat(wType)}  ${"-".repeat(wOnline)}  ${"-".repeat(wUuid)}`);
  for (const r of rows) {
    console.log(`${pad(r.name, wName)}  ${pad(r.type, wType)}  ${pad(r.online, wOnline)}  ${pad(r.uuid, wUuid)}`);
  }
};

const resolveHost = async (args: {
  host?: string;
  mac?: string;
  sweep?: boolean;
  subnet?: string;
  sweepTimeoutMs?: number;
  sweepConcurrency?: number;
}): Promise<string | null> => {
  if (args.host) return args.host;
  if (!args.mac) return null;

  let ip = await resolveIpv4FromMac(args.mac);
  if (ip) return ip;

  if (!args.sweep || !args.subnet) return null;

  await pingSweep(args.subnet, {
    timeoutMs: args.sweepTimeoutMs ?? 200,
    concurrency: args.sweepConcurrency ?? 64,
  });
  ip = await resolveIpv4FromMac(args.mac);
  return ip;
};

export const merossCommands = () => {
  return [
    defineCommand(
      {
        name: "meross:devices",
        description: "List devices from a Meross cloud dump JSON file",
        flags: {
          dump: { type: String, description: "Path to meross_cloud_dump.py output (or set MEROSS_DUMP)" },
          json: { type: Boolean, description: "Print raw JSON", negatable: false },
        },
      },
      async ({ flags }) => {
        const dumpPath = flags.dump || process.env.MEROSS_DUMP || defaultDumpPath();
        const dump = await loadMerossCloudDumpFile(dumpPath);
        if (flags.json) {
          console.log(JSON.stringify(dump, null, 2));
          return;
        }
        printDevicesTable(dump);
      },
    ),

    defineCommand(
      {
        name: "meross:togglex",
        description: "Toggle a Meross device via LAN HTTP (/config) using Appliance.Control.ToggleX",
        flags: {
          host: { type: String, description: "Device host (IPv4 or IPv4:port)" },
          mac: { type: String, description: "Device MAC (used to resolve IP via neighbor tables)" },
          sweep: { type: Boolean, description: "If MAC isn't found, ping-sweep a subnet to populate neighbor tables" },
          subnet: { type: String, description: "CIDR to sweep (example: 192.168.68.0/24). Required when using --sweep." },
          sweepTimeoutMs: { type: Number, description: "Per-host ping wait time (default: 200ms)", default: 200 },
          sweepConcurrency: { type: Number, description: "Parallelism for sweep (default: 64)", default: 64 },
          channel: { type: Number, description: "Channel number (default: 0)", default: 0 },
          on: { type: Boolean, description: "Turn on", negatable: false },
          off: { type: Boolean, description: "Turn off", negatable: false },
          key: { type: String, description: "Meross key (or set MEROSS_KEY). Falls back to dump cloud key if provided." },
          dump: { type: String, description: "Optional dump path to source the cloud key from" },
          timeoutMs: { type: Number, description: "HTTP timeout ms (default: 5000)", default: 5000 },
          json: { type: Boolean, description: "Print full JSON response", negatable: false },
        },
      },
      async ({ flags }) => {
        if (Boolean(flags.on) === Boolean(flags.off)) {
          throw new Error('Specify exactly one of "--on" or "--off".');
        }

        const dump = await loadDumpMaybe(flags.dump);
        const key = pickKey(flags.key, dump);
        if (!key) {
          throw new Error('Missing Meross key. Pass "--key" or set MEROSS_KEY (or provide --dump with a cloud.key).');
        }

        const host = await resolveHost({
          host: flags.host,
          mac: flags.mac,
          sweep: flags.sweep,
          subnet: flags.subnet,
          sweepTimeoutMs: flags.sweepTimeoutMs,
          sweepConcurrency: flags.sweepConcurrency,
        });
        if (!host) {
          throw new Error('Provide "--host" or "--mac" (and optionally "--sweep --subnet <cidr>").');
        }

        const onoff = flags.on ? 1 : 0;
        const resp = await setToggleX<any>({
          host,
          key,
          channel: flags.channel,
          onoff,
          timeoutMs: flags.timeoutMs,
        });

        if (flags.json) {
          console.log(JSON.stringify(resp, null, 2));
          return;
        }

        const code = resp?.payload?.error?.code;
        console.log(JSON.stringify({ host, channel: flags.channel, onoff, error_code: code }));
      },
    ),

    defineCommand(
      {
        name: "meross:systemall",
        description: "Fetch Appliance.System.All via LAN HTTP (/config)",
        flags: {
          host: { type: String, description: "Device host (IPv4 or IPv4:port)", required: true },
          key: { type: String, description: "Meross key (or set MEROSS_KEY)", required: false },
          dump: { type: String, description: "Optional dump path to source the cloud key from" },
          timeoutMs: { type: Number, description: "HTTP timeout ms (default: 5000)", default: 5000 },
          format: { type: String, description: 'Output format ("json" or "pretty")', default: "pretty" },
        },
      },
      async ({ flags }) => {
        const dump = await loadDumpMaybe(flags.dump);
        const key = pickKey(flags.key, dump);
        if (!key) {
          throw new Error('Missing Meross key. Pass "--key" or set MEROSS_KEY (or provide --dump with a cloud.key).');
        }
        if (flags.format !== "json" && flags.format !== "pretty") {
          throw new Error('Invalid "--format". Expected "json" or "pretty".');
        }
        const resp = await getSystemAll<any>({ host: flags.host, key, timeoutMs: flags.timeoutMs });
        if (flags.format === "json") {
          console.log(JSON.stringify(resp));
          return;
        }
        console.log(JSON.stringify(resp, null, 2));
      },
    ),
  ] as const;
};
