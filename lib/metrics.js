import db, { initDb } from "./db.js";

function num(field) {
  if (field == null) return null;
  if (typeof field === "number") return field;
  if (typeof field === "object" && typeof field.qty === "number") return field.qty;
  const n = Number(field);
  return Number.isFinite(n) ? n : null;
}

// 측정 시각을 한국 시간(KST) 기준 YYYY-MM-DD 로 변환.
function kstDay(s) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(s));
}

// 체중 지표 판별. weight_body_mass / 체중 등을 인식하고 제지방량·BMI는 제외.
export function isWeightMetric(name = "") {
  const n = String(name).toLowerCase();
  if (/lean|index|bmi/.test(n)) return false;
  return /weight|body_mass|체중/.test(n);
}

// 체지방률 지표 판별 (body_fat_percentage 등).
export function isBodyFatMetric(name = "") {
  const n = String(name).toLowerCase();
  return /body_fat|체지방|fat_percentage/.test(n);
}

const UPSERT_WEIGHT = `
  INSERT INTO weights (date, kg, measured_at, created_at)
  VALUES (:date, :kg, :measured_at, :created_at)
  ON CONFLICT(date) DO UPDATE SET kg = excluded.kg, measured_at = excluded.measured_at
`;
const UPSERT_FAT = `
  INSERT INTO weights (date, fat_pct, measured_at, created_at)
  VALUES (:date, :fat_pct, :measured_at, :created_at)
  ON CONFLICT(date) DO UPDATE SET fat_pct = excluded.fat_pct
`;

// Health Auto Export metrics 배열에서 체중·체지방을 추출해 저장합니다.
export async function saveMetrics(metrics) {
  await initDb();
  if (!Array.isArray(metrics)) return { weights: 0, fat: 0 };
  const now = new Date().toISOString();
  const stmts = [];
  let w = 0;
  let f = 0;

  for (const m of metrics) {
    const isWeight = isWeightMetric(m?.name);
    const isFat = !isWeight && isBodyFatMetric(m?.name);
    if (!isWeight && !isFat) continue;

    const units = (m.units ? String(m.units) : "").toLowerCase();
    const points = Array.isArray(m.data) ? m.data : [];
    for (const p of points) {
      const when = p.date ?? p.start ?? p.timestamp;
      let qty = num(p);
      if (!when || qty == null) continue;
      const base = {
        date: kstDay(when),
        measured_at: new Date(when).toISOString(),
        created_at: now,
      };
      if (isWeight) {
        if (units.includes("lb")) qty *= 0.45359237;
        else if (units.includes("st")) qty *= 6.35029318;
        stmts.push({ sql: UPSERT_WEIGHT, args: { ...base, kg: +qty.toFixed(2) } });
        w++;
      } else {
        if (qty > 0 && qty <= 1) qty *= 100; // 0~1 비율이면 퍼센트로
        stmts.push({ sql: UPSERT_FAT, args: { ...base, fat_pct: +qty.toFixed(1) } });
        f++;
      }
    }
  }

  if (stmts.length) await db.batch(stmts, "write");
  return { weights: w, fat: f };
}

// 체중 기록(차트·요약용) — 체중이 있는 날만.
export async function getWeights() {
  await initDb();
  const res = await db.execute(
    "SELECT date, kg FROM weights WHERE kg IS NOT NULL ORDER BY date ASC"
  );
  return res.rows;
}

// 체성분 기록(테이블 매칭용) — 체중 또는 체지방이 있는 날.
export async function getBodyMetrics() {
  await initDb();
  const res = await db.execute(
    "SELECT date, kg, fat_pct FROM weights WHERE kg IS NOT NULL OR fat_pct IS NOT NULL ORDER BY date ASC"
  );
  return res.rows;
}
