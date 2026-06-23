import { getWorkouts } from "@/lib/workouts";

// 한국 시간(KST) 기준 날짜를 YYYY-MM-DD 로 포맷합니다 (Excel이 날짜로 인식).
function fmtDate(iso) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

// 한국 시간 기준 시각을 HH:MM 으로 포맷합니다.
function fmtTime(iso) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

// CSV 필드 이스케이프 (쉼표·따옴표·줄바꿈 포함 시 따옴표로 감쌈).
function esc(v) {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// 러닝 기록을 엑셀에서 열 수 있는 CSV로 내려줍니다 (GET).
export async function GET() {
  const runs = (await getWorkouts({ limit: 100000 }))
    .slice()
    .sort((a, b) => a.start_at.localeCompare(b.start_at)); // 오래된 순

  const headers = [
    "날짜",
    "시작시각",
    "운동",
    "거리(km)",
    "시간(분)",
    "페이스(min/km)",
    "평균심박(bpm)",
    "최대심박(bpm)",
    "케이던스(spm)",
    "고도(m)",
    "칼로리(kcal)",
  ];

  const rows = runs.map((r) => {
    const pace =
      r.distance_km && r.duration_sec ? r.duration_sec / 60 / r.distance_km : null;
    return [
      fmtDate(r.start_at),
      fmtTime(r.start_at),
      r.name ?? "",
      r.distance_km != null ? r.distance_km.toFixed(2) : "",
      r.duration_sec != null ? (r.duration_sec / 60).toFixed(1) : "",
      pace != null ? pace.toFixed(2) : "",
      r.avg_hr != null ? Math.round(r.avg_hr) : "",
      r.max_hr != null ? Math.round(r.max_hr) : "",
      r.cadence != null ? Math.round(r.cadence) : "",
      r.elevation_m != null ? Math.round(r.elevation_m) : "",
      r.energy_kcal != null ? Math.round(r.energy_kcal) : "",
    ];
  });

  const csv = [headers, ...rows].map((row) => row.map(esc).join(",")).join("\r\n");
  // Excel에서 한글이 깨지지 않도록 UTF-8 BOM을 붙입니다.
  const body = "﻿" + csv;

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" })
    .format(new Date())
    .replace(/-/g, "");

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="running-${today}.csv"`,
    },
  });
}
