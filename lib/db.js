import { createClient } from "@libsql/client";
import path from "node:path";
import fs from "node:fs";

// 로컬은 SQLite 파일(file:), 배포는 Turso(libsql://...) 를 사용합니다.
const TURSO_URL = process.env.TURSO_DATABASE_URL;
const url = TURSO_URL || `file:${path.join(process.cwd(), "data", "running.db")}`;

// 로컬 파일 모드일 때 data 디렉토리 보장.
if (!TURSO_URL) {
  const dir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Next.js 핫 리로드/서버리스 재사용을 위해 전역 캐싱.
const globalForDb = globalThis;
const db =
  globalForDb.__runningDb ??
  createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
globalForDb.__runningDb = db;

// 스키마 초기화 (한 번만). 모든 데이터 함수는 시작 시 await initDb() 호출.
export async function initDb() {
  if (globalForDb.__runningDbInit) return;
  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS workouts (
        id            TEXT PRIMARY KEY,
        name          TEXT,
        start_at      TEXT NOT NULL,
        end_at        TEXT,
        duration_sec  REAL,
        distance_km   REAL,
        energy_kcal   REAL,
        avg_hr        REAL,
        max_hr        REAL,
        elevation_m   REAL,
        steps         REAL,
        cadence       REAL,
        raw           TEXT,
        created_at    TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_workouts_start ON workouts(start_at)`,
      `CREATE TABLE IF NOT EXISTS weights (
        date         TEXT PRIMARY KEY,
        kg           REAL,
        fat_pct      REAL,
        measured_at  TEXT,
        created_at   TEXT NOT NULL
      )`,
    ],
    "write"
  );
  globalForDb.__runningDbInit = true;
}

export default db;
