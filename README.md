# 러닝 대시보드 🏃

애플워치 러닝 데이터를 **Health Auto Export** 앱으로 받아 시각화하는 Next.js 대시보드입니다.

## 빠른 시작

```bash
npm install
npm run seed   # (선택) 샘플 데이터로 화면 미리보기
npm run dev    # http://localhost:3000
```

## AI 러닝 코치 🤖

대시보드의 **AI 러닝 코치** 카드에서 누적/최근 러닝 데이터를 분석해 컨디션 평가·훈련 제안·부상 위험 신호를 코칭받을 수 있습니다. **대화형**이라 이어서 자유롭게 질문할 수 있고(예: "다음 주 거리 얼마나 늘려도 될까?"), 러닝 데이터는 매 응답마다 코치에게 함께 전달됩니다. (Claude `claude-opus-4-8` 사용)

활성화하려면 Anthropic API 키가 필요합니다:

```bash
cp .env.local.example .env.local
# .env.local 의 ANTHROPIC_API_KEY 를 실제 키로 채운 뒤
npm run dev   # 재시작
```

키 발급: https://console.anthropic.com/settings/keys

## 애플워치 데이터 연동 (Health Auto Export)

1. iPhone에 **Health Auto Export – JSON+CSV** 앱 설치 (App Store).
2. 앱에서 **Automations → Add Automation → REST API** 선택.
3. URL을 Mac의 로컬 IP로 지정: `http://<내-Mac-IP>:3000/api/health`
   - Mac IP 확인: `ipconfig getifaddr en0`
   - iPhone과 Mac이 같은 Wi-Fi에 있어야 합니다.
4. Data Type에서 **Workouts** 를 켜고, 포맷은 **JSON** 으로.
5. 주기(예: 매시간/매일)를 설정하면 러닝 기록이 자동으로 쌓입니다.

> 러닝(`Run`/`Jog`) 계열 운동만 필터링해 저장합니다. 다른 운동도 보고 싶으면
> `lib/workouts.js`의 `isRunning()` 을 수정하세요.

### 체중(Body Mass) 연동

체중은 운동이 아니라 **건강 지표(metric)** 라, 별도의 자동화를 하나 더 추가하면 됩니다:

1. Health Auto Export → **새 자동화 추가 → REST API**
2. URL은 동일하게 (`http://<주소>:3000/api/health`)
3. **데이터 유형 → 건강 지표(수량/Quantity)**
4. 측정 항목에서 **체중(Body Mass)** 선택, 포맷 **JSON**
5. 날짜 범위·주기 설정 후 저장

저장되면 대시보드의 **주별 거리 vs 체중** 그래프(막대=거리, 선=체중)와 **현재 체중** 카드에
반영되고, AI 코치도 체중 추세를 함께 봅니다.

> 참고: 애플워치 자체는 체중을 측정하지 않습니다. 체중은 스마트 체중계 연동이나
> 건강 앱 수동 입력으로 Apple Health에 있어야 데이터가 넘어옵니다.

## 수동 업로드 📤

자동 연동 없이도, 대시보드의 **데이터 업로드** 카드에 파일을 끌어다 놓거나 선택해
직접 올릴 수 있습니다. Health Auto Export 등에서 내보낸 **JSON** 또는 **CSV** 운동
파일을 지원하며, 러닝 기록만 추려 저장하고 화면이 바로 갱신됩니다.

- **JSON**: `{ "data": { "workouts": [...] } }` 형식 (REST 연동과 동일)
- **CSV**: 헤더 이름을 퍼지 매칭(거리/시간/심박 등)해 인식 (best-effort)

## 구조

| 경로 | 설명 |
| --- | --- |
| `app/api/health/route.js` | Health Auto Export 수신 엔드포인트 (POST) |
| `app/api/workouts/route.js` | 대시보드용 데이터 조회 (GET) |
| `app/api/coach/route.js` | AI 러닝 코치 (POST, Claude 호출) |
| `app/api/upload/route.js` | 파일 수동 업로드 (JSON/CSV 파싱) |
| `app/Upload.js` | 업로드 UI 카드 (드래그 앤 드롭) |
| `lib/db.js` | SQLite 연결 및 스키마 |
| `lib/workouts.js` | 데이터 정규화·저장·집계 |
| `lib/coach.js` | 코칭 컨텍스트 구성 및 Claude 호출 |
| `app/Dashboard.js` | 대시보드 UI (통계·차트·테이블) |
| `app/Coach.js` | AI 코치 UI 카드 |

데이터는 `data/running.db` (SQLite)에 저장됩니다.
