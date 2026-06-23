import Anthropic from "@anthropic-ai/sdk";
import { getWorkouts, getSummary } from "./workouts.js";

// 분 단위 페이스를 m'ss" 형태로 표기.
function fmtPace(minPerKm) {
  if (!minPerKm || !Number.isFinite(minPerKm)) return "-";
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return `${m}'${String(s).padStart(2, "0")}"`;
}

// 코치에게 넘길 러닝 데이터 요약을 사람이 읽기 좋은 텍스트로 만듭니다.
// 최근 12회 러닝의 날짜·거리·페이스·심박수를 표 형태로 제공합니다.
export function buildRunningContext() {
  const summary = getSummary();
  const runs = getWorkouts({ limit: 12 });

  if (runs.length === 0) return null;

  const lines = runs
    .slice()
    .reverse()
    .map((r) => {
      const date = new Date(r.start_at).toISOString().slice(0, 10);
      const km = r.distance_km ? r.distance_km.toFixed(2) : "?";
      const pace =
        r.distance_km && r.duration_sec
          ? fmtPace(r.duration_sec / 60 / r.distance_km)
          : "-";
      const hr = r.avg_hr ? `${Math.round(r.avg_hr)}bpm` : "-";
      return `- ${date}: ${km}km, 페이스 ${pace}/km, 평균심박 ${hr}`;
    })
    .join("\n");

  const parts = [
    `누적 통계: 총 ${summary.totalRuns}회, ${summary.totalKm.toFixed(
      1
    )}km, 평균 페이스 ${fmtPace(summary.avgPace)}/km`,
  ];

  // 체중 데이터가 있으면 함께 제공해 러닝과 비교할 수 있게 합니다.
  if (summary.weightStats) {
    const s = summary.weightStats;
    parts.push(
      `체중: 시작 ${s.start}kg → 최근 ${s.current}kg (변화 ${
        s.change > 0 ? "+" : ""
      }${s.change}kg, ${s.count}회 측정)`
    );
  }

  parts.push(`최근 ${runs.length}회 러닝 기록:`, lines);
  return parts.join("\n");
}

const SYSTEM_PROMPT = `당신은 친근하고 전문적인 러닝 코치입니다. 애플워치에서 수집된 러너의 실제 데이터를 보고 코칭합니다.

원칙:
- 데이터에 근거해 구체적으로 말합니다. 추측이 필요하면 그렇다고 밝힙니다.
- 페이스 추이, 거리 변화, 심박수 패턴을 함께 살펴 과훈련/부상 위험 신호가 있으면 짚어줍니다.
- 주간 거리 증가는 10% 규칙 등 안전한 범위를 권합니다.
- 체중 데이터가 함께 주어지면 러닝량/페이스와의 관계(추세)를 짚어주되, 단정하지 말고 참고로만 말합니다.
- 답변은 한국어로, 마크다운으로 깔끔하게. 핵심을 먼저 말하고 근거를 덧붙입니다.
- 의학적 조언이 필요한 통증/부상은 전문가 상담을 권합니다.
- 과하게 길게 쓰지 말고, 실천 가능한 제안 위주로 간결하게.`;

// 멀티턴 대화를 받아 코치의 다음 답변을 반환합니다.
// messages: [{ role: "user" | "assistant", content: string }, ...]
// 러닝 데이터는 매 요청 시 시스템 프롬프트에 주입되어 대화 내내 일관되게 참고됩니다.
export async function getCoaching({ messages } = {}) {
  // 1) 입력 형식 검증 (클라이언트 오류): user/assistant 텍스트 메시지만 허용.
  const history = Array.isArray(messages)
    ? messages
        .filter(
          (m) =>
            m &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string" &&
            m.content.trim()
        )
        .map((m) => ({ role: m.role, content: m.content }))
    : [];

  if (history.length === 0 || history[history.length - 1].role !== "user") {
    throw new Error("BAD_MESSAGES");
  }

  // 2) 환경 설정 검증: API 키와 데이터.
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("NO_API_KEY");
  }

  const context = buildRunningContext();
  if (!context) {
    throw new Error("NO_DATA");
  }

  const client = new Anthropic();

  // 데이터 컨텍스트를 시스템 프롬프트 뒤에 붙여 캐시 친화적으로 유지합니다.
  const system = `${SYSTEM_PROMPT}\n\n[이 러너의 데이터]\n${context}`;

  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 2048,
    thinking: { type: "adaptive" },
    system,
    messages: history,
  });

  // thinking 블록은 건너뛰고 text 블록만 모읍니다.
  return response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

// "이번 주 코칭 받기" 버튼이 사용하는 기본 분석 요청 문구입니다.
export const DEFAULT_COACHING_PROMPT =
  "이번 주 코칭을 해줘. 최근 컨디션 평가, 잘하고 있는 점, 개선할 점, 다음 주 훈련 제안을 알려줘.";
