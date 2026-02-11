import os from "node:os";
import path from "node:path";

import { defineCommand } from "clerc";

import {
  MerossDumpParseError,
  defaultMerossConfigPath,
  defaultSuggestedCidr,
  extractLanMac,
  extractLanUuid,
  getSystemAll,
  loadMerossCloudDumpFile,
  loadMerossConfig,
  merossCloudListDevices,
  merossCloudLogin,
  listHostsInCidr,
  pingSweep,
  resolveIpv4FromMac,
  saveMerossConfig,
  setToggleX,
  type MerossCloudDump,
  type MerossCloudCredentials,
  type MerossCloudDevice,
} from "@merossity/core/meross";

const defaultDumpPath = () => path.join(os.homedir(), ".config", "merossity", "meross-cloud-dump.json");
const nowIso = () => new Date().toISOString();

const configPath = () => process.env.MEROSS_CONFIG_PATH || defaultMerossConfigPath();
const readConfig = async () => await loadMerossConfig(configPath());
const writeConfig = async (next: Awaited<ReturnType<typeof readConfig>>) => await saveMerossConfig(next, configPath());

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
        name: "meross:login",
        description: "Login to Meross cloud and persist cloud key/token to ~/.config/merossity/config.json",
        flags: {
          email: { type: String, description: "Meross cloud email", required: true },
          password: { type: String, description: "Meross cloud password", required: true },
          totp: { type: String, description: "TOTP (6 digits)", required: true },
          domain: { type: String, description: "Override cloud domain (rare)" },
          scheme: { type: String, description: 'Override scheme ("https" or "http")', default: "https" },
          timeoutMs: { type: Number, description: "HTTP timeout ms (default: 15000)", default: 15000 },
        },
      },
      async ({ flags }) => {
        const totp = String(flags.totp ?? "").trim();
        if (!/^[0-9]{6}$/.test(totp)) {
          throw new Error('Invalid "--totp". Expected 6 digits.');
        }

        if (flags.scheme !== "https" && flags.scheme !== "http") {
          throw new Error('Invalid "--scheme". Expected "https" or "http".');
        }

        const res = await merossCloudLogin(
          { email: String(flags.email), password: String(flags.password), mfaCode: totp },
          {
            domain: flags.domain ? String(flags.domain) : undefined,
            scheme: flags.scheme,
            timeoutMs: Number.isFinite(flags.timeoutMs) ? Number(flags.timeoutMs) : undefined,
          },
        );

        const cfg = await readConfig();
        await writeConfig({ ...cfg, cloud: { ...res.creds, updatedAt: nowIso() } });

        const keyPreview = res.creds.key ? `${res.creds.key.slice(0, 4)}…${res.creds.key.slice(-4)}` : "";
        console.log(JSON.stringify({ userEmail: res.creds.userEmail, domain: res.creds.domain, key: keyPreview }));
      },
    ),

    defineCommand(
      {
        name: "meross:devices:refresh",
        description: "Fetch cloud device list and persist it to ~/.config/merossity/config.json",
        flags: {
          timeoutMs: { type: Number, description: "HTTP timeout ms (default: 15000)", default: 15000 },
          json: { type: Boolean, description: "Print raw JSON list", negatable: false },
        },
      },
      async ({ flags }) => {
        const cfg = await readConfig();
        if (!cfg.cloud) {
          throw new Error("Not logged in. Run meross:login first.");
        }

        const list = await merossCloudListDevices(cfg.cloud as MerossCloudCredentials, {
          timeoutMs: Number.isFinite(flags.timeoutMs) ? Number(flags.timeoutMs) : undefined,
        });

        await writeConfig({ ...cfg, devices: { updatedAt: nowIso(), list: list as MerossCloudDevice[] } });

        if (flags.json) {
          console.log(JSON.stringify(list, null, 2));
          return;
        }

        console.log(JSON.stringify({ count: list.length }));
      },
    ),

    defineCommand(
      {
        name: "meross:hosts:discover",
        description: "Scan LAN for Meross devices (Appliance.System.All) and persist IP/MACs to config",
        flags: {
          cidr: { type: String, description: "CIDR to scan (default: auto-suggested)" },
          timeoutMs: { type: Number, description: "Per-host HTTP timeout ms (default: 900)", default: 900 },
          concurrency: { type: Number, description: "Parallelism (default: 24)", default: 24 },
          json: { type: Boolean, description: "Print raw hosts map", negatable: false },
        },
      },
      async ({ flags }) => {
        const cfg = await readConfig();
        const key = cfg.cloud?.key || process.env.MEROSS_KEY;
        if (!key) {
          throw new Error('Missing Meross key. Run meross:login (or set MEROSS_KEY).');
        }

        const cidr = String(flags.cidr ?? "").trim() || defaultSuggestedCidr() || "";
        if (!cidr) {
          throw new Error('Missing CIDR and no auto-suggested CIDR found. Pass "--cidr <x.x.x.x/yy>".');
        }

        // Best-effort: populate neighbor tables to improve MAC-based resolution on some systems.
        await pingSweep(cidr, { timeoutMs: 200, concurrency: 64 }).catch(() => {});

        let ips: string[];
        try {
          ips = listHostsInCidr(cidr);
        } catch {
          throw new Error(`Invalid CIDR: ${cidr}`);
        }

        const perHostTimeoutMs = Math.max(200, Number(flags.timeoutMs ?? 900));
        const concurrency = Math.max(1, Math.floor(Number(flags.concurrency ?? 24)));

        let i = 0;
        const found: Record<string, { host: string; updatedAt: string; mac?: string }> = {};

        await Promise.all(
          Array.from({ length: concurrency }, () =>
            (async () => {
              for (;;) {
                const idx = i++;
                if (idx >= ips.length) return;
                const ip = ips[idx]!;

                try {
                  const resp = await getSystemAll<any>({ host: ip, key, timeoutMs: perHostTimeoutMs });
                  const uuid = extractLanUuid(resp);
                  if (!uuid) continue;
                  const mac = extractLanMac(resp) ?? undefined;
                  found[uuid] = { host: ip, updatedAt: nowIso(), ...(mac ? { mac } : {}) };
                } catch {
                  // ignore
                }
              }
            })(),
          ),
        );

        await writeConfig({ ...cfg, hosts: { ...cfg.hosts, ...found } });

        if (flags.json) {
          console.log(JSON.stringify({ cidr, hosts: found }, null, 2));
          return;
        }

        console.log(JSON.stringify({ cidr, count: Object.keys(found).length }));
      },
    ),

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
