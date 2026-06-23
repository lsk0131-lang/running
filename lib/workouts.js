import db, { initDb } from "./db.js";
import { getWeights } from "./metrics.js";

// Health Auto Export의 필드 형식은 버전에 따라 다릅니다.
// 값이 { qty, units } 객체일 수도, 숫자일 수도 있어 안전하게 추출합니다.
function num(field) {
  if (field == null) return null;
  if (typeof field === "number") return field;
  if (typeof field === "object" && typeof field.qty === "number") return field.qty;
  const n = Number(field);
  return Number.isFinite(n) ? n : null;
}

// 거리를 km로 정규화 (units가 mi인 경우 변환).
function toKm(field) {
  const q = num(field);
  if (q == null) return null;
  const units = (field && field.units ? String(field.units) : "km").toLowerCase();
  if (units.includes("mi")) return q * 1.609344;
  if (units === "m") return q / 1000;
  return q; // km
}

// 에너지를 kcal로 정규화. Apple Health는 활동 에너지를 kJ로 보내기도 합니다.
function toKcal(field) {
  const q = num(field);
  if (q == null) return null;
  const units = (field && field.units ? String(field.units) : "kcal").toLowerCase();
  if (units === "kj") return q / 4.184; // 1 kcal = 4.184 kJ
  return q;
}

// 러닝 계열 운동만 통과시킵니다.
// 애플워치는 운동 이름을 기기 언어(한국어)로 기록하며, 러닝을
// "야외 운동"/"실외 운동"처럼 일반 운동 이름으로 저장하는 경우가 많습니다.
// 다른 종류의 야외 운동까지 들어오면 이 패턴을 좁히세요.
export function isRunning(name = "") {
  return /run|jog|러닝|달리|조깅|야외\s*운동|실외\s*운동|실내\s*운동/i.test(String(name));
}

// 하나의 workout 객체를 DB 행 형태로 정규화합니다.
export function normalizeWorkout(w) {
  const start = w.start ?? w.startDate ?? w.date;
  if (!start) return null;

  const id = w.id ?? w.uuid ?? `${w.name ?? "workout"}-${start}`;

  return {
    id: String(id),
    name: w.name ?? w.workoutActivityType ?? "Workout",
    start_at: new Date(start).toISOString(),
    end_at: w.end ? new Date(w.end).toISOString() : null,
    duration_sec: num(w.duration),
    distance_km: toKm(w.distance),
    energy_kcal: toKcal(w.activeEnergyBurned ?? w.activeEnergy ?? w.totalEnergyBurned),
    avg_hr: num(w.avgHeartRate ?? w.averageHeartRate ?? w.heartRateAverage),
    max_hr: num(w.maxHeartRate ?? w.heartRateMax),
    elevation_m: num(w.elevationUp ?? w.elevationAscended),
    steps: Array.isArray(w.stepCount) ? null : num(w.stepCount ?? w.steps),
    cadence: num(w.stepCadence ?? w.cadence ?? w.averageCadence), // 분당 걸음 수 (spm)
    raw: JSON.stringify(w),
  };
}

const UPSERT_SQL = `
  INSERT INTO workouts
    (id, name, start_at, end_at, duration_sec, distance_km, energy_kcal,
     avg_hr, max_hr, elevation_m, steps, cadence, raw, created_at)
  VALUES
    (:id, :name, :start_at, :end_at, :duration_sec, :distance_km, :energy_kcal,
     :avg_hr, :max_hr, :elevation_m, :steps, :cadence, :raw, :created_at)
  ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, end_at=excluded.end_at, duration_sec=excluded.duration_sec,
    distance_km=excluded.distance_km, energy_kcal=excluded.energy_kcal,
    avg_hr=excluded.avg_hr, max_hr=excluded.max_hr, elevation_m=excluded.elevation_m,
    steps=excluded.steps, cadence=excluded.cadence, raw=excluded.raw
`;

// 여러 운동을 한 트랜잭션(batch)으로 저장. 저장된 러닝 수를 반환합니다.
export async function saveWorkouts(workouts) {
  await initDb();
  const now = new Date().toISOString();
  const stmts = [];
  for (const w of workouts) {
    if (!isRunning(w.name ?? w.workoutActivityType ?? "")) continue;
    const row = normalizeWorkout(w);
    if (!row) continue;
    stmts.push({ sql: UPSERT_SQL, args: { ...row, created_at: now } });
  }
  if (stmts.length) await db.batch(stmts, "write");
  return stmts.length;
}

export async function getWorkouts({ limit = 500 } = {}) {
  await initDb();
  const res = await db.execute({
    sql: `SELECT * FROM workouts ORDER BY start_at DESC LIMIT :limit`,
    args: { limit },
  });
  return res.rows;
}

// 해당 날짜가 그 달의 몇 번째 주인지로 키를 만듭니다. 예) 2026-05-2W
function monthWeekKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const w = Math.ceil(d.getDate() / 7);
  return `${y}-${m}-${w}W`;
}

// 대시보드 요약 통계를 계산합니다.
export async function getSummary() {
  await initDb();
  const res = await db.execute(`SELECT * FROM workouts ORDER BY start_at ASC`);
  const rows = res.rows;

  const totalRuns = rows.length;
  const totalKm = rows.reduce((s, r) => s + (r.distance_km ?? 0), 0);
  const totalSec = rows.reduce((s, r) => s + (r.duration_sec ?? 0), 0);
  const totalKcal = rows.reduce((s, r) => s + (r.energy_kcal ?? 0), 0);

  const avgPace = totalKm > 0 ? totalSec / 60 / totalKm : 0;

  // 주별 거리 + 평균 페이스 + 평균 체중 집계 (그달의 N주차: 예 2026-05-2W)
  const weekMap = new Map(); // key -> { km, sec, wSum, wCount }
  const bucket = (k) => {
    if (!weekMap.has(k)) weekMap.set(k, { km: 0, sec: 0, wSum: 0, wCount: 0 });
    return weekMap.get(k);
  };
  for (const r of rows) {
    const b = bucket(monthWeekKey(new Date(r.start_at)));
    b.km += r.distance_km ?? 0;
    b.sec += r.duration_sec ?? 0;
  }

  const weights = await getWeights();
  for (const w of weights) {
    const b = bucket(monthWeekKey(new Date(w.date)));
    b.wSum += w.kg;
    b.wCount += 1;
  }

  const weekly = Array.from(weekMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, v]) => ({
      week,
      km: +v.km.toFixed(1),
      avgPace: v.km > 0 ? +(v.sec / 60 / v.km).toFixed(2) : null,
      weightKg: v.wCount ? +(v.wSum / v.wCount).toFixed(1) : null,
    }));

  // 체중 요약
  const weightStats = weights.length
    ? {
        current: weights[weights.length - 1].kg,
        start: weights[0].kg,
        change: +(weights[weights.length - 1].kg - weights[0].kg).toFixed(1),
        count: weights.length,
      }
    : null;

  // 평균 심박 / 케이던스
  const hrRuns = rows.filter((r) => r.avg_hr != null);
  const avgHr = hrRuns.length
    ? Math.round(hrRuns.reduce((s, r) => s + r.avg_hr, 0) / hrRuns.length)
    : null;
  const cadRuns = rows.filter((r) => r.cadence != null);
  const avgCadence = cadRuns.length
    ? Math.round(cadRuns.reduce((s, r) => s + r.cadence, 0) / cadRuns.length)
    : null;

  // 월별 집계 (거리/평균 페이스/평균 체중) + 기간 라벨
  const monthMap = new Map();
  const mbucket = (k) => {
    if (!monthMap.has(k)) monthMap.set(k, { km: 0, sec: 0, wSum: 0, wCount: 0 });
    return monthMap.get(k);
  };
  for (const r of rows) {
    const d = new Date(r.start_at);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const b = mbucket(ym);
    b.km += r.distance_km ?? 0;
    b.sec += r.duration_sec ?? 0;
  }
  for (const w of weights) {
    const b = mbucket(w.date.slice(0, 7));
    b.wSum += w.kg;
    b.wCount += 1;
  }
  const monthly = Array.from(monthMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ym, v]) => ({
      ym,
      month: `${parseInt(ym.slice(5), 10)}월`,
      km: +v.km.toFixed(1),
      avgPace: v.km > 0 ? +(v.sec / 60 / v.km).toFixed(2) : null,
      weightKg: v.wCount ? +(v.wSum / v.wCount).toFixed(1) : null,
    }));
  const monthRange =
    monthly.length === 0
      ? ""
      : monthly.length === 1
        ? monthly[0].month
        : `${monthly[0].month}~${monthly[monthly.length - 1].month}`;

  return {
    totalRuns,
    totalKm,
    totalSec,
    totalKcal,
    avgPace,
    avgHr,
    avgCadence,
    weekly,
    monthly,
    monthRange,
    weightStats,
  };
}
