"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import Coach from "./Coach.js";
import Upload from "./Upload.js";

// 차트 색상
const C = {
  bar: "#2f80ed",
  pace: "#e2553b",
  area: "#1faa7a",
  hrAvg: "#2f80ed",
  hrMax: "#ef4444",
  scatter: "#7c6cf0",
  grid: "#eceef1",
  axis: "#9aa0a8",
  weight: "#f5a524",
};

function fmtDuration(sec) {
  if (!sec) return "-";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
}

function fmtPace(minPerKm) {
  if (!minPerKm || !Number.isFinite(minPerKm)) return "-";
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return `${m}'${String(s).padStart(2, "0")}"`;
}

function paceOf(run) {
  if (!run.distance_km || !run.duration_sec) return null;
  return run.duration_sec / 60 / run.distance_km;
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tableOpen, setTableOpen] = useState(true); // 전체 기록 테이블: 기본 열림

  const load = useCallback(() => {
    fetch("/api/workouts")
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <div className="container">불러오기 오류: {error}</div>;
  if (!data) return <div className="container">불러오는 중…</div>;

  const { summary, workouts } = data;
  const bodyMetrics = data.bodyMetrics ?? [];
  const hasData = workouts.length > 0;

  // 각 러닝 날짜(KST)에 해당하는 체성분을 매칭합니다.
  // 같은 날 측정이 없으면 그 이전의 가장 최근 측정값을 사용(carry-forward).
  const kstDay = (iso) => new Date(iso).toLocaleDateString("en-CA"); // 브라우저 로컬(KST)
  function bodyAt(runIso) {
    const day = kstDay(runIso);
    let match = null;
    for (const b of bodyMetrics) {
      if (b.date <= day) match = b;
      else break;
    }
    return match || {};
  }

  // 회차별 시계열 (오래된 순으로 1,2,3…)
  const runSeries = [...workouts]
    .sort((a, b) => a.start_at.localeCompare(b.start_at))
    .map((w, i) => ({
      idx: i + 1,
      pace: paceOf(w),
      avgHr: w.avg_hr ? Math.round(w.avg_hr) : null,
      maxHr: w.max_hr ? Math.round(w.max_hr) : null,
      cadence: w.cadence ? Math.round(w.cadence) : null,
      km: w.distance_km != null ? +w.distance_km.toFixed(2) : null,
    }));

  return (
    <div className="container">
      <div className="header">
        <div className="header-title">
          <h1>🏃 러닝 대시보드</h1>
          <span className="sub">애플워치 · Health Auto Export 연동</span>
        </div>
        <div className="header-actions">
          {hasData && (
            <a className="btn-ghost upload-btn" href="/api/export" title="러닝 기록을 엑셀(CSV)로 다운로드">
              ⬇️ 엑셀
            </a>
          )}
          <Upload onUploaded={load} />
        </div>
      </div>

      <Coach hasData={hasData} />

      {!hasData ? (
        <div className="card empty">
          <p>아직 러닝 데이터가 없습니다.</p>
          <p>
            Health Auto Export 앱의 REST API URL을{" "}
            <code>http://&lt;내-Mac-IP&gt;:3000/api/health</code> 로 설정하거나,
            <br />
            터미널에서 <code>npm run seed</code> 로 샘플 데이터를 넣어보세요.
          </p>
        </div>
      ) : (
        <>
          <div className="stats">
            <Stat label="총 러닝 횟수" value={summary.totalRuns} unit="회" sub={summary.monthRange} />
            <Stat label="총 거리" value={summary.totalKm.toFixed(1)} unit="km" sub="누적" />
            <Stat label="평균 페이스" value={fmtPace(summary.avgPace)} sub="min/km" />
            {summary.avgHr != null && (
              <Stat label="평균 심박수" value={summary.avgHr} unit="bpm" sub="운동 평균" />
            )}
            {summary.avgCadence != null && (
              <Stat label="평균 케이던스" value={summary.avgCadence} unit="spm" sub="운동 평균" />
            )}
            <Stat label="총 칼로리" value={Math.round(summary.totalKcal).toLocaleString()} sub="kcal" />
          </div>

          {/* 월별 누적 거리 및 평균 페이스 */}
          <div className="card">
            <h2>주별 누적 거리 · 평균 페이스{summary.weightStats ? " · 체중" : ""}</h2>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={summary.weekly} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                <XAxis dataKey="week" stroke={C.axis} fontSize={11} tickLine={false} angle={-30} textAnchor="end" height={50} interval={0} />
                <YAxis
                  yAxisId="km"
                  stroke={C.axis}
                  fontSize={12}
                  tickLine={false}
                  label={{ value: "km", angle: -90, position: "insideLeft", fill: C.axis, fontSize: 11 }}
                />
                <YAxis
                  yAxisId="pace"
                  orientation="right"
                  stroke={C.axis}
                  fontSize={12}
                  tickLine={false}
                  domain={["dataMin - 0.3", "dataMax + 0.3"]}
                  tickFormatter={(v) => v.toFixed(1)}
                  label={{ value: "min/km", angle: 90, position: "insideRight", fill: C.axis, fontSize: 11 }}
                />
                {/* 체중은 스케일이 달라 숨김 축으로 얹습니다 (값은 툴팁/범례로 확인) */}
                {summary.weightStats && (
                  <YAxis yAxisId="weight" hide domain={["dataMin - 1", "dataMax + 1"]} />
                )}
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v, n) => {
                    if (n === "평균 페이스") return [fmtPace(v), "평균 페이스"];
                    if (n === "체중") return [`${v} kg`, "체중"];
                    return [`${(+v).toFixed(1)} km`, "누적 거리"];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="km" name="누적 거리 (km)" dataKey="km" fill={C.bar} radius={[4, 4, 0, 0]} maxBarSize={64} />
                <Line
                  yAxisId="pace"
                  name="평균 페이스"
                  type="monotone"
                  dataKey="avgPace"
                  stroke={C.pace}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={{ r: 4, fill: C.pace }}
                  connectNulls
                />
                {summary.weightStats && (
                  <Line
                    yAxisId="weight"
                    name="체중"
                    type="monotone"
                    dataKey="weightKg"
                    stroke={C.weight}
                    strokeWidth={2}
                    dot={{ r: 3, fill: C.weight }}
                    connectNulls
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* 회차별 주요 데이터: 거리 · 심박 · 케이던스 · 페이스 (통합) */}
          <div className="card">
            <h2>회차별 주요 데이터</h2>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={runSeries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                <XAxis dataKey="idx" stroke={C.axis} fontSize={12} tickLine={false}
                  label={{ value: "회차", position: "insideBottom", offset: -2, fill: C.axis, fontSize: 11 }} />
                <YAxis
                  yAxisId="km"
                  stroke={C.axis}
                  fontSize={12}
                  tickLine={false}
                  domain={[0, "dataMax + 1"]}
                  label={{ value: "거리(km)", angle: -90, position: "insideLeft", fill: C.axis, fontSize: 11 }}
                />
                <YAxis
                  yAxisId="rate"
                  orientation="right"
                  stroke={C.axis}
                  fontSize={12}
                  tickLine={false}
                  domain={["dataMin - 8", "dataMax + 8"]}
                  label={{ value: "bpm / spm", angle: 90, position: "insideRight", fill: C.axis, fontSize: 11 }}
                />
                {/* 페이스는 스케일이 달라 숨김 축으로 얹습니다 (값은 툴팁/범례로 확인) */}
                <YAxis yAxisId="pace" hide domain={["dataMin - 0.4", "dataMax + 0.4"]} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(l) => `${l}회차`}
                  formatter={(v, n) => {
                    if (n === "거리") return [`${v} km`, "거리"];
                    if (n === "평균 심박") return [`${v} bpm`, "평균 심박"];
                    if (n === "케이던스") return [`${v} spm`, "케이던스"];
                    return [fmtPace(v), "페이스"];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="km" name="거리" dataKey="km" fill={C.bar} fillOpacity={0.5} radius={[3, 3, 0, 0]} maxBarSize={26} />
                <Line yAxisId="rate" name="평균 심박" type="monotone" dataKey="avgHr" stroke={C.hrMax}
                  strokeWidth={2} dot={{ r: 2.5, fill: C.hrMax }} connectNulls />
                <Line yAxisId="rate" name="케이던스" type="monotone" dataKey="cadence" stroke={C.scatter}
                  strokeWidth={2} dot={{ r: 2.5, fill: C.scatter }} connectNulls />
                <Line yAxisId="pace" name="페이스" type="monotone" dataKey="pace" stroke={C.area}
                  strokeWidth={2} strokeDasharray="5 4" dot={{ r: 2.5, fill: C.area }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* 전체 기록 테이블 (열기/닫기, 기본 열림) */}
          <div className="card">
            <div className="card-head">
              <h2>전체 기록 ({workouts.length}건)</h2>
              <button
                className="btn-ghost upload-btn"
                onClick={() => setTableOpen((v) => !v)}
                aria-expanded={tableOpen}
              >
                {tableOpen ? "닫기 ▲" : "열기 ▼"}
              </button>
            </div>
            {tableOpen && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>날짜</th>
                      <th className="num">거리</th>
                      <th className="num">시간</th>
                      <th className="num">페이스</th>
                      <th className="num">평균 심박</th>
                      <th className="num">최대 심박</th>
                      <th className="num">케이던스</th>
                      <th className="num">칼로리</th>
                      <th className="num">체중</th>
                      <th className="num">체지방률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workouts.map((w) => {
                      const b = bodyAt(w.start_at);
                      return (
                        <tr key={w.id}>
                          <td>{fmtDate(w.start_at)}</td>
                          <td className="num">{w.distance_km ? w.distance_km.toFixed(2) : "-"} km</td>
                          <td className="num">{fmtDuration(w.duration_sec)}</td>
                          <td className="num">{fmtPace(paceOf(w))}</td>
                          <td className="num">{w.avg_hr ? Math.round(w.avg_hr) : "-"}</td>
                          <td className="num">{w.max_hr ? Math.round(w.max_hr) : "-"}</td>
                          <td className="num">{w.cadence ? Math.round(w.cadence) : "-"}</td>
                          <td className="num">{w.energy_kcal ? Math.round(w.energy_kcal) : "-"}</td>
                          <td className="num">{b.kg != null ? `${b.kg.toFixed(1)} kg` : "-"}</td>
                          <td className="num">{b.fat_pct != null ? `${b.fat_pct.toFixed(1)}%` : "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, unit, sub }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">
        {value}
        {unit && <small>{unit}</small>}
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

const tooltipStyle = {
  background: "#ffffff",
  border: "1px solid #e7e9ed",
  borderRadius: 8,
  color: "#1a1d21",
  fontSize: 13,
  boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
};
