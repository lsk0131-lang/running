import { NextResponse } from "next/server";
import { getWorkouts, getSummary } from "@/lib/workouts";
import { getBodyMetrics } from "@/lib/metrics";

// 대시보드 프론트엔드가 호출하는 데이터 조회 엔드포인트입니다.
export async function GET() {
  const [summary, workouts, bodyMetrics] = await Promise.all([
    getSummary(),
    getWorkouts({ limit: 500 }),
    getBodyMetrics(),
  ]);
  return NextResponse.json({ summary, workouts, bodyMetrics });
}
