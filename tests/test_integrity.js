/* 조작 검증 검사:  node tests\test_integrity.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const L = require('../engine.js');

const draws = L.parse(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data.json'), 'utf8')));

// 실제 데이터
const real = L.integrity(draws, { sims: 300 });
console.log('실제 추첨 ' + draws.length + '회');
real.tests.forEach(t => {
  assert.ok(t.p > 0 && t.p <= 1, t.id + ' p 범위');
  console.log(' ', t.name.padEnd(14), 'p', (t.p * 100).toFixed(1).padStart(5) + '%', '|', t.stat, t.note ? '| ' + t.note : '');
});
const w = real.winners;
console.log('1등 당첨자 수 분산지수', w.dispersion.toFixed(2), '| 0명 회차', w.zero, '(기대', w.zeroExpected.toFixed(1) + ')');
w.top.forEach(x => console.log('   ', x.n + '회', x.nums.join(','), '실제', x.w1 + '명', '기대', x.mu.toFixed(1) + '명'));

// 검정이 실제로 조작을 잡아내는지: 일부러 조작한 가짜 추첨을 넣어 본다
function fake(make) {
  const rand = L.rng(7);
  return draws.map((d, i) => Object.assign({}, d, { nums: make(rand, i, d) }));
}
function pOf(list, id) { return L.integrity(list, { sims: 60 }).tests.find(t => t.id === id).p; }

// (1) 7번이 10% 더 자주 나오게 조작 → 출현 횟수 검정에 걸려야 한다
const biased = fake(rand => {
  let c = L.randomCombo(rand);
  if (c.indexOf(7) < 0 && rand() < 0.13) { c[Math.floor(rand() * 6)] = 7; c = Array.from(new Set(c)); while (c.length < 6) { const x = 1 + Math.floor(rand() * 45); if (c.indexOf(x) < 0) c.push(x); } c.sort((a, b) => a - b); }
  return c;
});
const p1 = pOf(biased, 'freq');
console.log('조작 시험 1 (7번 편중): 출현 횟수 p', (p1 * 100).toFixed(3) + '%');
assert.ok(p1 < 0.01);

// (2) 직전 회차 번호를 일부러 피하게 조작 → 직전 회차 검정에 걸려야 한다
let prev = [1, 2, 3, 4, 5, 6];
const avoid = fake(rand => {
  let c;
  do { c = L.randomCombo(rand); } while (c.filter(x => prev.indexOf(x) >= 0).length > 0 && rand() < 0.5);
  prev = c;
  return c;
});
const p2 = pOf(avoid, 'lag1');
console.log('조작 시험 2 (직전 번호 회피): 직전 회차 p', (p2 * 100).toFixed(3) + '%');
assert.ok(p2 < 0.01);

// (3) 과거 조합을 5%의 회차에서 거의 그대로 재사용 → 재등장 검정에 걸려야 한다
const hist = [];
const reuse = fake(rand => {
  let c = L.randomCombo(rand);
  if (hist.length > 20 && rand() < 0.05) { c = hist[Math.floor(rand() * hist.length)].slice(); }
  hist.push(c);
  return c;
});
const p3 = pOf(reuse, 'reuse');
console.log('조작 시험 3 (조합 재사용): 재등장 p', (p3 * 100).toFixed(3) + '%');
assert.ok(p3 < 0.01);

// (4) 완전히 공정한 가짜 추첨 → 대부분의 검정을 통과해야 한다
const fair = L.integrity(fake(rand => L.randomCombo(rand)), { sims: 60 });
const flagged = fair.tests.filter(t => t.id !== 'popfreq' && t.p < 0.005).map(t => t.id);
console.log('공정한 가짜 추첨에서 걸린 검정:', flagged.length ? flagged.join(', ') : '없음');
assert.strictEqual(flagged.length, 0);
console.log('모든 검사 통과');
