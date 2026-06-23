"use client";

import { useRef, useState } from "react";

// 헤더 우측에 놓이는 작은 업로드 버튼. 클릭하면 파일 선택창을 열고,
// 결과는 화면 우상단 토스트로 잠깐 보여줍니다.
export default function Upload({ onUploaded }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null); // { type: "ok"|"err", msg }

  async function upload(file) {
    if (!file) return;
    setBusy(true);
    setToast(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (data.ok) {
        const w = data.savedWeights ? `, 체중 ${data.savedWeights}건` : "";
        setToast({ type: "ok", msg: `러닝 ${data.saved}건${w} 저장됨` });
        onUploaded?.();
      } else {
        setToast({ type: "err", msg: data.error || "업로드 실패" });
      }
    } catch (e) {
      setToast({ type: "err", msg: String(e) });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
      setTimeout(() => setToast(null), 5000);
    }
  }

  return (
    <>
      <button
        className="btn-ghost upload-btn"
        onClick={() => !busy && inputRef.current?.click()}
        disabled={busy}
        title="JSON/CSV 운동 파일 업로드"
      >
        {busy ? "업로드 중…" : "📤 업로드"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".json,.csv,application/json,text/csv"
        style={{ display: "none" }}
        onChange={(e) => upload(e.target.files?.[0])}
      />
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </>
  );
}
