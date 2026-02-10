import os from "node:os";
import path from "node:path";

import { Box, Text, useApp, useInput } from "ink";
import { withFullScreen } from "fullscreen-ink";
import { useCallback, useEffect, useMemo, useState } from "react";

import { loadMerossCloudDumpFile, type MerossCloudDumpDevice } from "@merossity/core/meross";

function App() {
  const app = useApp();
  const dumpPath = useMemo(
    () => process.env.MEROSS_DUMP ?? path.join(os.homedir(), ".config", "merossity", "meross-cloud-dump.json"),
    [],
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MerossCloudDumpDevice[]>([]);
  const [selected, setSelected] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const dump = await loadMerossCloudDumpFile(dumpPath);
      setDevices(dump.devices ?? []);
      setSelected(0);
    } catch (e) {
      setError((e as Error).message);
      setDevices([]);
    } finally {
      setLoading(false);
    }
  }, [dumpPath]);

  useEffect(() => {
    void load();
  }, [load]);

  useInput((input, key) => {
    if (input === "q" || key.escape) {
      app.exit();
      return;
    }
    if (input === "r") {
      void load();
      return;
    }
    if (key.downArrow || input === "j") {
      setSelected((s) => Math.min(devices.length - 1, s + 1));
      return;
    }
    if (key.upArrow || input === "k") {
      setSelected((s) => Math.max(0, s - 1));
      return;
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>merossity</Text>
      <Text dimColor>q/Esc: quit · j/k or arrows: move · r: reload</Text>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Dump: {dumpPath} (set MEROSS_DUMP to override)</Text>
      </Box>

      <Box marginTop={1} flexDirection="column" flexGrow={1}>
        {loading ? (
          <Text>Loading devices…</Text>
        ) : error ? (
          <Box flexDirection="column">
            <Text color="red">Failed to load dump.</Text>
            <Text dimColor>{error}</Text>
            <Text dimColor>
              Create a dump with: <Text bold>.venv/bin/python meross_cloud_dump.py</Text> then set{" "}
              <Text bold>MEROSS_DUMP</Text>.
            </Text>
          </Box>
        ) : devices.length === 0 ? (
          <Text dimColor>No devices found in dump.</Text>
        ) : (
          <Box flexDirection="column">
            {devices.map((d, idx) => {
              const isSel = idx === selected;
              const name = String(d.devName ?? "(unnamed)");
              const online = String(d.onlineStatus ?? "");
              const uuid = String(d.uuid ?? "");
              return (
                <Text key={uuid || String(idx)} color={isSel ? "cyan" : undefined}>
                  {isSel ? ">" : " "} {name}{" "}
                  <Text dimColor>
                    {online ? `(${online})` : ""} {uuid}
                  </Text>
                </Text>
              );
            })}
          </Box>
        )}
      </Box>
    </Box>
  );
}

export const runTui = async () => {
  const ink = withFullScreen(<App />);
  await ink.start();
  await ink.waitUntilExit();
};
