// 샘플 러닝 데이터를 /api/health 형식으로 만들어 DB에 직접 넣습니다.
// 실행: npm run seed
import { saveWorkouts } from "../lib/workouts.js";

const now = new Date();
const workouts = [];

// 최근 8주, 주 3회 가량의 러닝을 생성합니다.
let day = 0;
for (let i = 0; i < 26; i++) {
  day += 2 + Math.floor(Math.random() * 2); // 2~3일 간격
  const start = new Date(now.getTime() - day * 86400000);
  start.setHours(7, 10, 0, 0);

  const distance = +(3 + Math.random() * 7).toFixed(2); // 3~10km
  const paceMin = 5.2 + Math.random() * 1.3; // 5'12"~6'30"/km
  const duration = Math.round(distance * paceMin * 60); // 초
  const end = new Date(start.getTime() + duration * 1000);

  workouts.push({
    id: `seed-${i}`,
    name: "Outdoor Run",
    start: start.toISOString(),
    end: end.toISOString(),
    duration,
    distance: { qty: distance, units: "km" },
    activeEnergyBurned: { qty: Math.round(distance * 65), units: "kcal" },
    avgHeartRate: { qty: Math.round(145 + Math.random() * 20), units: "bpm" },
    maxHeartRate: { qty: Math.round(170 + Math.random() * 15), units: "bpm" },
    elevationUp: { qty: Math.round(Math.random() * 60), units: "m" },
    stepCount: { qty: Math.round(distance * 1100), units: "steps" },
  });
}

const saved = await saveWorkouts(workouts);
console.log(`샘플 ${workouts.length}건 중 ${saved}건 저장 완료.`);
