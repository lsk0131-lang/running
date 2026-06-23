# CLAUDE.md

이 파일은 이 저장소에서 작업하는 Claude(및 개발자)를 위한 안내서입니다.

## 프로젝트 개요

애플워치 러닝/체성분 데이터를 **Health Auto Export** 앱으로 받아 시각화하고,
Claude 기반 AI 러닝 코치를 제공하는 **Next.js(App Router)** 대시보드입니다.

- 데이터 출처: iPhone Apple Health → Health Auto Export(REST API / 파일) → 이 앱
- 저장: SQLite (libSQL 클라이언트, 로컬은 파일 / 배포는 Turso)
- AI 코치: Anthropic Claude `claude-opus-4-8`

## 개발 명령

```bash
npm install
npm run seed   # (선택) 샘플 러닝 데이터 주입
npm run dev    # http://localhost:3000
npm run build && npm run start  # 프로덕션 빌드
```

## 아키텍처

```
app/
  api/health/route.js    Health Auto Export 수신 (운동 + 체중/체지방 metric 저장)
  api/upload/route.js     파일 수동 업로드 (JSON metrics / 운동 CSV)
  api/workouts/route.js   대시보드 데이터 조회 (summary + workouts + bodyMetrics)
  api/coach/route.js      AI 코치 (대화형, Claude 호출)
  api/export/route.js     러닝 기록 CSV(엑셀) 다운로드
  Dashboard.js            대시보드 UI (통계 카드 + 차트 + 전체 기록 표)
  Coach.js                AI 코치 채팅 UI
  Upload.js               헤더의 업로드 버튼 + 토스트
lib/
  db.js                   libSQL 클라이언트 + 스키마 초기화 (initDb)
  workouts.js             운동 정규화·저장·집계 (getSummary 등)
  metrics.js              체중/체지방 metric 저장·조회
  coach.js                코치 컨텍스트 구성 + Claude 호출
scripts/seed.mjs          샘플 데이터 생성
```

### 데이터 모델 (SQLite/libSQL)

- `workouts`: 러닝 1건 = 1행. 거리(km)·시간·페이스·심박·케이던스·칼로리·`raw`(원본 JSON).
- `weights`: 날짜(KST) 1일 = 1행. `kg`(체중), `fat_pct`(체지방률).

### 핵심 규칙

- **러닝 필터**: `lib/workouts.js`의 `isRunning()`. 애플워치가 한국어로 "야외 운동"으로
  기록하므로 영문(run/jog) + 한국어(러닝/달리기/야외·실외·실내 운동)를 인식.
- **단위 정규화**: 거리 mi→km, 에너지 kJ→kcal, 체중 lb/st→kg. (Apple Health가 kJ로 보냄)
- **시각/날짜**: 측정 시각은 KST(Asia/Seoul) 기준 `YYYY-MM-DD`로 집계.
- **주차 키**: `monthWeekKey()` → 그달의 N주차 (`2026-05-2W`).
- **체성분 매칭**: 체중/체지방은 날짜별 값이라, 표에서는 각 러닝 날짜에 직전 측정값을
  carry-forward로 매칭해 표시.

## DB 접근 (중요)

libSQL 클라이언트는 **비동기**입니다. 모든 쿼리는 `await client.execute(...)`,
데이터 함수(`getSummary`, `saveWorkouts`, `saveMetrics` 등)는 `async`이며 호출부에서
`await` 해야 합니다. 새 데이터 함수를 추가할 때 시작 부분에서 `await initDb()`를 호출해
스키마가 준비됐는지 보장하세요.

로컬은 `file:` URL(`data/running.db`), 배포는 `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`
환경변수를 사용합니다.

## 환경 변수

| 변수 | 용도 |
| --- | --- |
| `ANTHROPIC_API_KEY` | AI 코치 (Claude) |
| `TURSO_DATABASE_URL` | 배포 시 Turso DB URL (없으면 로컬 파일 사용) |
| `TURSO_AUTH_TOKEN` | Turso 인증 토큰 |
| `INGEST_TOKEN` | (선택) `/api/health`·`/api/upload` 보호용 토큰 |

로컬은 `.env.local`에 설정. `.env.local`·`data/`는 `.gitignore`로 커밋 제외.

## Claude API 사용 규칙

- 모델은 **`claude-opus-4-8`** 사용. adaptive thinking(`thinking: {type:"adaptive"}`).
- `budget_tokens`·`temperature`·`top_p`·assistant prefill 사용 금지(4.7+에서 400).
- 응답에서 `thinking` 블록은 건너뛰고 `text` 블록만 사용.

## 코드 컨벤션

- 주석·UI 텍스트는 한국어.
- 외부 의존성 최소화(마크다운 렌더러 등 가벼운 자체 구현 선호).
- 차트는 `recharts`. 스케일이 다른 지표는 보조 축 또는 숨김 축으로 한 차트에 통합.

## 배포 (Vercel + Turso)

1. Turso DB 생성 → `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` 확보.
2. Vercel 프로젝트 연결 → 위 env + `ANTHROPIC_API_KEY` 설정.
3. Health Auto Export의 URL을 배포된 `https://<도메인>/api/health` 로 변경(고정 주소).
   - 로컬 IP·`.local`이 네트워크에 따라 끊기던 문제를 영구 해결.
