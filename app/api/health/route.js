import { NextResponse } from "next/server";
import { saveWorkouts } from "@/lib/workouts";
import { saveMetrics } from "@/lib/metrics";

// Health Auto Export 앱이 운동 데이터를 POST로 보내는 수신 엔드포인트입니다.
// 앱 설정 > Automations > REST API 의 URL 을 http://<내-IP>:3000/api/health 로 지정하세요.
export async function POST(req) {
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

  const saved = saveWorkouts(workouts);

  // 체중·체지방 등 건강 지표도 함께 저장합니다.
  const metrics = body?.data?.metrics ?? body?.metrics ?? [];
  const bm = saveMetrics(metrics);

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
