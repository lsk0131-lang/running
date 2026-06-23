import db from "./db.js";

// { qty, units } 또는 숫자에서 값을 안전하게 추출.
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

// 체중/체지방을 날짜별로 합쳐 저장. COALESCE로 한쪽만 와도 다른 값은 유지.
const upsertWeight = db.prepare(`
  INSERT INTO weights (date, kg, measured_at, created_at)
  VALUES (@date, @kg, @measured_at, @created_at)
  ON CONFLICT(date) DO UPDATE SET kg = excluded.kg, measured_at = excluded.measured_at
`);
const upsertFat = db.prepare(`
  INSERT INTO weights (date, fat_pct, measured_at, created_at)
  VALUES (@date, @fat_pct, @measured_at, @created_at)
  ON CONFLICT(date) DO UPDATE SET fat_pct = excluded.fat_pct
`);

// Health Auto Export metrics 배열에서 체중·체지방을 추출해 저장합니다.
export const saveMetrics = db.transaction((metrics) => {
  if (!Array.isArray(metrics)) return { weights: 0, fat: 0 };
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
      const row = {
        date: kstDay(when),
        measured_at: new Date(when).toISOString(),
        created_at: new Date().toISOString(),
      };
      if (isWeight) {
        if (units.includes("lb")) qty *= 0.45359237;
        else if (units.includes("st")) qty *= 6.35029318;
        upsertWeight.run({ ...row, kg: +qty.toFixed(2) });
        w++;
      } else {
        // % 단위가 0~1 비율로 오면 100을 곱해 퍼센트로 정규화.
        if (qty > 0 && qty <= 1) qty *= 100;
        upsertFat.run({ ...row, fat_pct: +qty.toFixed(1) });
        f++;
      }
    }
  }
  return { weights: w, fat: f };
});

// 체중 기록(차트·요약용) — 체중이 있는 날만.
export function getWeights() {
  return db
    .prepare("SELECT date, kg FROM weights WHERE kg IS NOT NULL ORDER BY date ASC")
    .all();
}

// 체성분 기록(테이블 매칭용) — 체중 또는 체지방이 있는 날.
export function getBodyMetrics() {
  return db
    .prepare(
      "SELECT date, kg, fat_pct FROM weights WHERE kg IS NOT NULL OR fat_pct IS NOT NULL ORDER BY date ASC"
    )
    .all();
}
