import { NextResponse } from "next/server";
import { getCoaching } from "@/lib/coach";

// AI 러닝 코치 엔드포인트. { messages: [{role, content}, ...] } 를 받습니다.
export async function POST(req) {
  let body = {};
  try {
    body = await req.json();
  } catch {
    // 본문 파싱 실패 시 아래에서 BAD_MESSAGES로 처리됩니다.
  }

  try {
    const advice = await getCoaching({ messages: body.messages });
    return NextResponse.json({ ok: true, advice });
  } catch (err) {
    if (err.message === "BAD_MESSAGES") {
      return NextResponse.json(
        { ok: false, error: "대화 형식이 올바르지 않습니다." },
        { status: 400 }
      );
    }
    if (err.message === "NO_API_KEY") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "ANTHROPIC_API_KEY가 설정되지 않았습니다. .env.local에 키를 추가한 뒤 dev 서버를 재시작하세요.",
        },
        { status: 503 }
      );
    }
    if (err.message === "NO_DATA") {
      return NextResponse.json(
        { ok: false, error: "분석할 러닝 데이터가 없습니다." },
        { status: 400 }
      );
    }
    console.error("coach error:", err);
    return NextResponse.json(
      { ok: false, error: "코칭 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
