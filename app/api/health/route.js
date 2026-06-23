import { NextResponse } from "next/server";
import { saveWorkouts } from "@/lib/workouts";
import { saveMetrics } from "@/lib/metrics";

// INGEST_TOKEN 이 설정돼 있으면 요청에 일치하는 토큰을 요구합니다 (공개 배포 보호용).
// Health Auto Export의 "헤더 추가"에서 x-ingest-token 헤더로 넣거나 ?token= 로 전달.
function tokenOk(req) {
  const need = process.env.INGEST_TOKEN;
  if (!need) return true;
  const got =
    req.headers.get("x-ingest-token") ||
    new URL(req.url).searchParams.get("token");
  return got === need;
}

// Health Auto Export 앱이 운동 데이터를 POST로 보내는 수신 엔드포인트입니다.
// 앱 설정 > Automations > REST API 의 URL 을 https://<도메인>/api/health 로 지정하세요.
export async function POST(req) {
  if (!tokenOk(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  // Health Auto Export 페이로드: { data: { workouts: [...], metrics: [...] } }
  // 다른 형태(루트에 workouts 배열)도 허용합니다.
  const workouts =
    body?.data?.workouts ??
    body?.workouts ??
    (Array.isArray(body) ? body : []);

  if (!Array.isArray(workouts)) {
    return NextResponse.json(
      { ok: false, error: "No workouts array found" },
      { status: 400 }
    );
  }

  const saved = await saveWorkouts(workouts);

  // 체중·체지방 등 건강 지표도 함께 저장합니다.
  const metrics = body?.data?.metrics ?? body?.metrics ?? [];
  const bm = await saveMetrics(metrics);

  return NextResponse.json({
    ok: true,
    received: workouts.length,
    saved,
    savedWeights: bm.weights,
    savedFat: bm.fat,
  });
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: "POST Health Auto Export payload here" });
}
