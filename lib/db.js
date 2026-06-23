import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

// SQLite 파일은 ./data/running.db 에 저장합니다.
const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "running.db");

// Next.js dev 모드의 핫 리로드에서 커넥션이 중복 생성되지 않도록 전역에 캐싱합니다.
const globalForDb = globalThis;
let db = globalForDb.__runningDb;

if (!db) {
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS workouts (
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
    );
    CREATE INDEX IF NOT EXISTS idx_workouts_start ON workouts(start_at);

    CREATE TABLE IF NOT EXISTS weights (
      date         TEXT PRIMARY KEY,   -- YYYY-MM-DD (KST 기준 하루 한 값)
      kg           REAL,               -- 체중 (kg)
      fat_pct      REAL,               -- 체지방률 (%)
      measured_at  TEXT,               -- 원본 측정 시각 (ISO)
      created_at   TEXT NOT NULL
    );
  `);

  // 기존 DB에 cadence 컬럼이 없으면 추가 (마이그레이션).
  const cols = db.prepare("PRAGMA table_info(workouts)").all().map((c) => c.name);
  if (!cols.includes("cadence")) {
    db.exec("ALTER TABLE workouts ADD COLUMN cadence REAL");
  }

  // weights 테이블 마이그레이션: 체지방 컬럼 추가 + kg NOT NULL 제거 (체지방만 있는 날 허용).
  const winfo = db.prepare("PRAGMA table_info(weights)").all();
  const kgCol = winfo.find((c) => c.name === "kg");
  const hasFat = winfo.some((c) => c.name === "fat_pct");
  if (!hasFat || (kgCol && kgCol.notnull === 1)) {
    db.exec(`
      CREATE TABLE weights_new (
        date TEXT PRIMARY KEY, kg REAL, fat_pct REAL, measured_at TEXT, created_at TEXT NOT NULL
      );
      INSERT OR IGNORE INTO weights_new (date, kg, measured_at, created_at)
        SELECT date, kg, measured_at, created_at FROM weights;
      DROP TABLE weights;
      ALTER TABLE weights_new RENAME TO weights;
    `);
  }

  globalForDb.__runningDb = db;
}

export default db;
