/* 분석 엔진 검사:  node tests\test_engine.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const L = require('../engine.js');

const payload = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data.json'), 'utf8'));
const draws = L.parse(payload);

// 데이터: 1회부터 빠짐없이, 번호는 1~45 서로 다른 6개 + 보너스
draws.forEach((d, i) => {
  assert.strictEqual(d.n, i + 1, `${i + 1}회차가 빠졌습니다`);
  const all = d.nums.concat([d.b]);
  assert.strictEqual(new Set(all).size, 7, `${d.n}회 번호 중복`);
  all.forEach(x => assert.ok(x >= 1 && x <= 45, `${d.n}회 범위 밖 번호`));
});
assert.deepStrictEqual(draws[0].nums, [10, 23, 29, 33, 37, 40]);

// 누적 통계: 전체 횟수 합 = 회차 × 6
const s = L.buildState(draws);
let total = 0;
for (let k = 1; k <= 45; k++) total += s.count[k];
assert.strictEqual(total, draws.length * 6);
const last = draws[draws.length - 1];
last.nums.forEach(x => assert.strictEqual(L.gapOf(s, x), 0));

// 당첨 판정
const d = { nums: [1, 2, 3, 4, 5, 6], b: 7, a1: 100, a2: 50, a3: 10 };
assert.strictEqual(L.rankOf([1, 2, 3, 4, 5, 6], d), 1);
assert.strictEqual(L.rankOf([1, 2, 3, 4, 5, 7], d), 2);
assert.strictEqual(L.rankOf([1, 2, 3, 4, 5, 8], d), 3);
assert.strictEqual(L.rankOf([1, 2, 3, 4, 8, 9], d), 4);
assert.strictEqual(L.rankOf([1, 2, 3, 8, 9, 10], d), 5);
assert.strictEqual(L.rankOf([1, 2, 8, 9, 10, 11], d), 0);
assert.strictEqual(L.prizeOf(4, d), 50000);

// 조합 생성: 5개, 서로 다른 6개 번호, 같은 시드면 같은 결과
for (const key of Object.keys(L.STRATEGIES)) {
  for (const avoid of [false, true]) {
    const a = L.generate(s, key, { count: 5, rand: L.rng(1), avoidPopular: avoid });
    const b = L.generate(s, key, { count: 5, rand: L.rng(1), avoidPopular: avoid });
    assert.strictEqual(a.length, 5, `${key} 조합 수`);
    assert.deepStrictEqual(a.map(x => x.nums), b.map(x => x.nums));
    a.forEach(p => {
      assert.strictEqual(new Set(p.nums).size, 6);
      assert.ok(L.shapeOk(p.nums, avoid));
    });
  }
}

// 백테스트: 미래 데이터를 보지 않는지 — 뒤 회차를 바꿔도 앞 회차 결과가 같아야 한다
function runUpTo(list, n) {
  const bt = L.createBacktest(list, { start: 100 });
  bt.step(n);
  return JSON.stringify(bt.result());
}
const tampered = draws.map((x, i) => i >= 200 ? Object.assign({}, x, { nums: [1, 2, 3, 4, 5, 6], b: 7 }) : x);
assert.strictEqual(runUpTo(draws, 100), runUpTo(tampered, 100));

// 백테스트 전체 실행 + 요약 출력
const bt = L.createBacktest(draws, { start: 100 });
while (!bt.step(200)) { /* 계속 */ }
const res = bt.result();
const se = Math.sqrt(0.6146 / res.random.tickets);
console.log(`회차 ${draws.length}개, 방법별 조합 ${res.random.tickets}개, 우연 범위 ±${(2 * se).toFixed(3)}`);
for (const k of ['hot', 'cold', 'mixed', 'random']) {
  const r = res[k];
  assert.strictEqual(r.tickets, (draws.length - 100) * 5);
  console.log(k.padEnd(7), '평균 적중', (r.matches / r.tickets).toFixed(3),
    '| 5등~1등', r.ranks.slice(1).reverse().join('/'),
    '| 회수율', (r.won / r.cost * 100).toFixed(0) + '%');
}
console.log('모든 검사 통과');
