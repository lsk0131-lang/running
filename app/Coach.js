"use client";

import { useState, useRef, useEffect } from "react";

// 마크다운 일부(굵게/제목/리스트)를 가볍게 HTML로 변환합니다.
// 외부 의존성 없이 코칭 답변을 읽기 좋게 보여주기 위한 최소 렌더러입니다.
function renderMarkdown(text) {
  const html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^###?\s+(.+)$/gm, "<strong>$1</strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^[-*]\s+(.+)$/gm, "• $1")
    .replace(/\n/g, "<br/>");
  return { __html: html };
}

const DEFAULT_PROMPT =
  "이번 주 코칭을 해줘. 최근 컨디션 평가, 잘하고 있는 점, 개선할 점, 다음 주 훈련 제안을 알려줘.";

export default function Coach({ hasData }) {
  // messages: [{ role: "user" | "assistant", content: string }]
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);

  // 새 메시지가 오면 대화 영역을 맨 아래로 스크롤합니다.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // 사용자 메시지를 추가하고 전체 대화를 보내 코치 답변을 받습니다.
  async function send(text) {
    const content = text.trim();
    if (!content || loading) return;

    const next = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessages((m) => [...m, { role: "assistant", content: data.advice }]);
      } else {
        setError(data.error || "오류가 발생했습니다.");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <h2 style={{ margin: 0 }}>🤖 AI 러닝 코치</h2>
        {messages.length > 0 && (
          <button
            className="btn-ghost"
            style={{ padding: "4px 10px", fontSize: 12, borderRadius: 8, cursor: "pointer" }}
            onClick={() => {
              setMessages([]);
              setError("");
            }}
            disabled={loading}
          >
            대화 초기화
          </button>
        )}
      </div>

      {!hasData ? (
        <p style={{ color: "var(--muted)", margin: 0 }}>
          러닝 데이터가 쌓이면 AI 코치가 분석해 드립니다.
        </p>
      ) : (
        <>
          {messages.length === 0 ? (
            <div style={{ marginBottom: 14 }}>
              <p style={{ color: "var(--muted)", marginTop: 0 }}>
                데이터를 분석해 코칭해 드릴게요. 버튼을 누르거나 직접 물어보세요.
              </p>
              <button className="btn" onClick={() => send(DEFAULT_PROMPT)} disabled={loading}>
                이번 주 코칭 받기
              </button>
            </div>
          ) : (
            <div className="chat" ref={scrollRef}>
              {messages.map((m, i) => (
                <div key={i} className={`bubble ${m.role}`}>
                  {m.role === "assistant" ? (
                    <span dangerouslySetInnerHTML={renderMarkdown(m.content)} />
                  ) : (
                    m.content
                  )}
                </div>
              ))}
              {loading && <div className="bubble assistant typing">분석 중…</div>}
            </div>
          )}

          {error && <p style={{ color: "#f87171", margin: "8px 0 0" }}>{error}</p>}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            style={{ display: "flex", gap: 8, marginTop: 14 }}
          >
            <input
              className="input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="예: 다음 주에 거리를 얼마나 늘려도 될까?"
              disabled={loading}
            />
            <button className="btn" type="submit" disabled={loading || !input.trim()}>
              보내기
            </button>
          </form>
        </>
      )}
    </div>
  );
}
