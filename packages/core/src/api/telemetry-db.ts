import os from 'node:os'
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { Database } from 'bun:sqlite'

export type TelemetrySampleRow = {
  uuid: string
  channel: number
  atMs: number
  voltageV: number | null
  currentA: number | null
  powerW: number | null
  rawVoltageDv: number | null
  rawCurrentMa: number | null
  rawPowerMw: number | null
  source: string
}

let dbSingleton: Database | null = null

export const defaultTelemetryDbPath = (): string => {
  const dir = path.join(os.homedir(), '.config', 'merossity')
  return path.join(dir, 'telemetry.sqlite')
}

export const telemetryDbPath = (): string => process.env.MEROSS_TELEMETRY_DB_PATH || defaultTelemetryDbPath()

const ensureDb = (): Database => {
  if (dbSingleton) return dbSingleton

  const p = telemetryDbPath()
  mkdirSync(path.dirname(p), { recursive: true })

  const db = new Database(p)
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS telemetry_sample (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL,
      channel INTEGER NOT NULL,
      at_ms INTEGER NOT NULL,
      voltage_v REAL,
      current_a REAL,
      power_w REAL,
      raw_voltage_dv INTEGER,
      raw_current_ma INTEGER,
      raw_power_mw INTEGER,
      source TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_telemetry_sample_uuid_channel_at
      ON telemetry_sample(uuid, channel, at_ms);

    CREATE TABLE IF NOT EXISTS telemetry_consumption_day (
      uuid TEXT NOT NULL,
      channel INTEGER NOT NULL,
      date TEXT NOT NULL,
      at_s INTEGER,
      wh INTEGER NOT NULL,
      PRIMARY KEY(uuid, channel, date)
    );
  `)

  dbSingleton = db
  return db
}

export const insertTelemetrySample = (row: TelemetrySampleRow): void => {
  const db = ensureDb()
  const stmt = db.prepare(`
    INSERT INTO telemetry_sample (
      uuid, channel, at_ms,
      voltage_v, current_a, power_w,
      raw_voltage_dv, raw_current_ma, raw_power_mw,
      source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  stmt.run(
    row.uuid,
    row.channel,
    row.atMs,
    row.voltageV,
    row.currentA,
    row.powerW,
    row.rawVoltageDv,
    row.rawCurrentMa,
    row.rawPowerMw,
    row.source,
  )
}

export const upsertConsumptionDay = (row: { uuid: string; channel: number; date: string; atS: number; wh: number }) => {
  const db = ensureDb()
  const stmt = db.prepare(`
    INSERT INTO telemetry_consumption_day (uuid, channel, date, at_s, wh)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(uuid, channel, date) DO UPDATE SET
      at_s = excluded.at_s,
      wh = excluded.wh
  `)
  stmt.run(row.uuid, row.channel, row.date, row.atS, row.wh)
}

export const getLatestTelemetrySample = (uuid: string, channel: number): (TelemetrySampleRow & { id: number }) | null => {
  const db = ensureDb()
  const stmt = db.prepare(`
    SELECT
      id,
      uuid,
      channel,
      at_ms as atMs,
      voltage_v as voltageV,
      current_a as currentA,
      power_w as powerW,
      raw_voltage_dv as rawVoltageDv,
      raw_current_ma as rawCurrentMa,
      raw_power_mw as rawPowerMw,
      source
    FROM telemetry_sample
    WHERE uuid = ? AND channel = ?
    ORDER BY at_ms DESC
    LIMIT 1
  `)
  return (stmt.get(uuid, channel) as any) ?? null
}

export type TelemetryBucketPoint = {
  t: number
  powerWAvg: number | null
  powerWMax: number | null
  voltageVAvg: number | null
  currentAAvg: number | null
}

export const getTelemetryHistoryBuckets = (params: {
  uuid: string
  channel: number
  fromMs: number
  toMs: number
  bucketMs: number
}): TelemetryBucketPoint[] => {
  const db = ensureDb()
  const stmt = db.prepare(`
    SELECT
      (CAST(at_ms / ? AS INTEGER) * ?) AS t,
      AVG(power_w) AS powerWAvg,
      MAX(power_w) AS powerWMax,
      AVG(voltage_v) AS voltageVAvg,
      AVG(current_a) AS currentAAvg
    FROM telemetry_sample
    WHERE uuid = ? AND channel = ? AND at_ms >= ? AND at_ms <= ?
    GROUP BY t
    ORDER BY t ASC
  `)
  return (stmt.all(params.bucketMs, params.bucketMs, params.uuid, params.channel, params.fromMs, params.toMs) as any) ?? []
}

