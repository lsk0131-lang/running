import { NextResponse } from "next/server";
import { saveWorkouts } from "@/lib/workouts";
import { saveMetrics } from "@/lib/metrics";

// 따옴표로 감싼 필드(내부 쉼표 포함)를 처리하는 최소 CSV 라인 파서.
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

// "0:35:12" / "35:12" / "2112" 형태의 시간 값을 초로 변환.
function durationToSeconds(raw, header) {
  if (raw == null || raw === "") return null;
  const str = String(raw);
  if (str.includes(":")) {
    const parts = str.split(":").map(Number);
    if (parts.some((n) => Number.isNaN(n))) return null;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0];
  }
  const n = Number(str);
  if (!Number.isFinite(n)) return null;
  // 헤더에 'min'이 있으면 분 단위로 간주.
  return /min/i.test(header) ? n * 60 : n;
}

// Health Auto Export 류의 운동 CSV를 workout 객체 배열로 변환합니다.
// 헤더 이름을 퍼지 매칭해 컬럼 위치가 달라도 최대한 인식합니다.
function parseCsvWorkouts(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const lower = headers.map((h) => h.toLowerCase());

  const find = (pred) => lower.findIndex(pred);
  const idx = {
    name: find((h) => h.includes("type") || h.includes("workout") || h.includes("name")),
    start: find((h) => h.includes("start") || h.includes("date")),
    end: find((h) => h.includes("end")),
    duration: find((h) => h.includes("duration")),
    distance: find((h) => h.includes("distance")),
    energy: find((h) => h.includes("energy") || h.includes("calor")),
    avgHr: find((h) => h.includes("heart") && (h.includes("avg") || h.includes("average"))),
    maxHr: find((h) => h.includes("heart") && h.includes("max")),
    elevation: find((h) => h.includes("elevation")),
  };

  const distUnits = idx.distance >= 0 && /mi/i.test(headers[idx.distance]) ? "mi" : "km";
  const at = (cols, i) => (i >= 0 && i < cols.length ? cols[i] : "");
  const numOrNull = (v) => {
    const n = Number(v);
    return v !== "" && Number.isFinite(n) ? n : null;
  };

  const workouts = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const start = at(cols, idx.start);
    if (!start) continue;

    workouts.push({
      name: at(cols, idx.name) || "Workout",
      start,
      end: at(cols, idx.end) || undefined,
      duration: durationToSeconds(at(cols, idx.duration), headers[idx.duration] || ""),
      distance: { qty: numOrNull(at(cols, idx.distance)), units: distUnits },
      activeEnergyBurned: numOrNull(at(cols, idx.energy)),
      avgHeartRate: numOrNull(at(cols, idx.avgHr)),
      maxHeartRate: numOrNull(at(cols, idx.maxHr)),
      elevationUp: numOrNull(at(cols, idx.elevation)),
    });
  }
  return workouts;
}

// 파일 업로드 수신 엔드포인트. multipart/form-data 의 "file" 필드를 받습니다.
// JSON(Health Auto Export 페이로드)과 CSV(운동 CSV)를 지원합니다.
export async function POST(req) {
  let form;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "파일을 읽을 수 없습니다." }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || typeof file.text !== "function") {
    return NextResponse.json({ ok: false, error: "파일이 없습니다." }, { status: 400 });
  }

  const name = (file.name || "").toLowerCase();
  const text = await file.text();

  let workouts;
  let metrics = [];
  if (name.endsWith(".csv")) {
    workouts = parseCsvWorkouts(text);
  } else {
    // 기본은 JSON으로 파싱 (확장자가 .json이 아니어도 시도).
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { ok: false, error: "JSON 또는 CSV 파일만 업로드할 수 있습니다." },
        { status: 400 }
      );
    }
    workouts =
      body?.data?.workouts ?? body?.workouts ?? (Array.isArray(body) ? body : []);
    metrics = body?.data?.metrics ?? body?.metrics ?? [];
  }

  const hasWorkouts = Array.isArray(workouts) && workouts.length > 0;
  const hasMetrics = Array.isArray(metrics) && metrics.length > 0;
  if (!hasWorkouts && !hasMetrics) {
    return NextResponse.json(
      { ok: false, error: "파일에서 운동/체중 데이터를 찾지 못했습니다." },
      { status: 400 }
    );
  }

  const saved = hasWorkouts ? saveWorkouts(workouts) : 0;
  const bm = hasMetrics ? saveMetrics(metrics) : { weights: 0, fat: 0 };

  return NextResponse.json({
    ok: true,
    received: (workouts?.length ?? 0) + (metrics?.length ?? 0),
    saved,
    savedWeights: bm.weights,
    savedFat: bm.fat,
  });
}
