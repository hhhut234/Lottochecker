/* 로또 6/45 분석 엔진 — 브라우저(window.Lotto)와 node(require) 양쪽에서 쓴다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Lotto = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var N = 45;          // 번호 범위
  var PICK = 6;        // 한 조합의 번호 수
  var RECENT = 30;     // "최근" 창 크기(회차)
  var PRICE = 1000;    // 한 게임 가격
  var FIXED = { 4: 50000, 5: 5000 };

  var STRATEGIES = {
    hot:   { name: '자주 나온 번호', desc: '전체·최근 출현이 많은 번호 위주' },
    cold:  { name: '오래 안 나온 번호', desc: '미출현 기간이 긴 번호 위주' },
    mixed: { name: '종합 점수', desc: '전체 빈도 + 최근 추세 + 미출현 기간 혼합' }
  };

  /* ---------- 데이터 ---------- */
  function parse(payload) {
    return payload.draws.map(function (r) {
      return {
        n: r[0], d: String(r[1]),
        nums: [r[2], r[3], r[4], r[5], r[6], r[7]].sort(function (a, b) { return a - b; }),
        b: r[8], w1: r[9] || 0, a1: r[10] || 0, a2: r[11] || 0, a3: r[12] || 0
      };
    }).sort(function (a, b) { return a.n - b.n; });
  }

  /* 시드 고정 난수 — 같은 회차·같은 전략이면 같은 추천이 나오게 한다. */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- 누적 통계 ---------- */
  function newState() {
    return {
      t: 0,
      count: new Int32Array(N + 1),
      last: new Int32Array(N + 1).fill(-1),
      recent: new Int32Array(N + 1),
      window: [],
      pair: new Int32Array((N + 1) * (N + 1))
    };
  }

  function addDraw(s, draw) {
    var nums = draw.nums, i, j;
    for (i = 0; i < PICK; i++) {
      s.count[nums[i]]++;
      s.recent[nums[i]]++;
      s.last[nums[i]] = s.t;
      for (j = i + 1; j < PICK; j++) s.pair[nums[i] * (N + 1) + nums[j]]++;
    }
    s.window.push(nums);
    if (s.window.length > RECENT) {
      var old = s.window.shift();
      for (i = 0; i < PICK; i++) s.recent[old[i]]--;
    }
    s.t++;
    return s;
  }

  function buildState(draws, upto) {
    var s = newState(), end = upto == null ? draws.length : upto;
    for (var i = 0; i < end; i++) addDraw(s, draws[i]);
    return s;
  }

  function gapOf(s, k) { return s.last[k] < 0 ? s.t + 1 : s.t - 1 - s.last[k]; }

  /* 1..45 값을 평균 0, 표준편차 1로 맞춘다. */
  function zs(get) {
    var v = new Float64Array(N + 1), sum = 0, k;
    for (k = 1; k <= N; k++) { v[k] = get(k); sum += v[k]; }
    var mean = sum / N, sq = 0;
    for (k = 1; k <= N; k++) sq += (v[k] - mean) * (v[k] - mean);
    var sd = Math.sqrt(sq / N) || 1;
    for (k = 1; k <= N; k++) v[k] = (v[k] - mean) / sd;
    return v;
  }

  /* 번호별 점수(z값). 높을수록 그 전략이 선호하는 번호. */
  function numberScores(s, strategy) {
    var zAll = zs(function (k) { return s.count[k]; });
    var zRec = zs(function (k) { return s.recent[k]; });
    var zGap = zs(function (k) { return gapOf(s, k); });
    var out = new Float64Array(N + 1);
    for (var k = 1; k <= N; k++) {
      if (strategy === 'hot') out[k] = 0.5 * zAll[k] + 0.5 * zRec[k];
      else if (strategy === 'cold') out[k] = zGap[k];
      else out[k] = 0.4 * zAll[k] + 0.3 * zRec[k] + 0.3 * zGap[k];
    }
    return out;
  }

  /* ---------- 조합 생성 ---------- */
  function sampleCombo(weights, total, rand) {
    var picked = [], used = new Uint8Array(N + 1), left = total;
    for (var i = 0; i < PICK; i++) {
      var r = rand() * left, k, acc = 0, chosen = 0;
      for (k = 1; k <= N; k++) {
        if (used[k]) continue;
        acc += weights[k];
        chosen = k;
        if (r < acc) break;
      }
      used[chosen] = 1;
      left -= weights[chosen];
      picked.push(chosen);
    }
    return picked.sort(function (a, b) { return a - b; });
  }

  /* 실제 당첨번호 대부분이 지나가는 "흔한 모양" 범위 안인지 본다. */
  function shapeOk(c, avoidPopular) {
    var odd = 0, sum = 0, low = 0, run = 1, maxRun = 1, dec = [0, 0, 0, 0, 0], over31 = 0, i;
    for (i = 0; i < PICK; i++) {
      var x = c[i];
      if (x & 1) odd++;
      sum += x;
      if (x <= 22) low++;
      if (x > 31) over31++;
      dec[Math.min(4, Math.floor((x - 1) / 10))]++;
      if (i && x === c[i - 1] + 1) { run++; if (run > maxRun) maxRun = run; } else run = 1;
    }
    if (odd < 2 || odd > 4) return false;
    if (sum < 100 || sum > 175) return false;
    if (low < 2 || low > 4) return false;
    if (maxRun > 2) return false;
    if (Math.max.apply(null, dec) > 3) return false;
    if (avoidPopular) {
      if (over31 < 2) return false;               // 생일 번호(1~31) 쏠림 피하기
      var step = c[1] - c[0], arith = true;        // 등차수열 모양 피하기
      for (i = 2; i < PICK; i++) if (c[i] - c[i - 1] !== step) { arith = false; break; }
      if (arith) return false;
    }
    return true;
  }

  function overlap(a, b) {
    var n = 0;
    for (var i = 0; i < PICK; i++) if (b.indexOf(a[i]) >= 0) n++;
    return n;
  }

  /**
   * 전략 점수에 따라 조합을 만든다.
   * opts: { count, rand, samples, avoidPopular }
   * 반환: [{ nums:[6], score }]  (점수 높은 순)
   */
  function generate(s, strategy, opts) {
    opts = opts || {};
    var count = opts.count || 5, rand = opts.rand || Math.random;
    var samples = opts.samples || 400;
    var z = numberScores(s, strategy);
    var w = new Float64Array(N + 1), total = 0, k, i;
    for (k = 1; k <= N; k++) { w[k] = Math.exp(0.7 * z[k]); total += w[k]; }

    var pairMean = s.t * 15 / 990; // 한 쌍이 함께 나올 기대 횟수 (회차당 15쌍 / 전체 990쌍)
    var pool = [], seen = {}, tries = 0;
    while (pool.length < samples && tries < samples * 20) {
      tries++;
      var c = sampleCombo(w, total, rand);
      if (!shapeOk(c, opts.avoidPopular)) continue;
      var key = c.join(',');
      if (seen[key]) continue;
      seen[key] = 1;
      var sc = 0, ps = 0, j;
      for (i = 0; i < PICK; i++) {
        sc += z[c[i]];
        for (j = i + 1; j < PICK; j++) ps += s.pair[c[i] * (N + 1) + c[j]];
      }
      if (strategy !== 'cold' && pairMean > 0) sc += 0.15 * (ps / 15 - pairMean) / Math.sqrt(pairMean);
      pool.push({ nums: c, score: sc });
    }
    pool.sort(function (a, b) { return b.score - a.score; });

    var out = [];
    for (var limit = 2; out.length < count && limit <= PICK; limit++) {
      for (i = 0; i < pool.length && out.length < count; i++) {
        var cand = pool[i], ok = out.indexOf(cand) < 0;
        for (var m = 0; ok && m < out.length; m++) if (overlap(cand.nums, out[m].nums) > limit) ok = false;
        if (ok) out.push(cand);
      }
    }
    return out;
  }

  function randomCombo(rand) {
    var c = [];
    while (c.length < PICK) {
      var x = 1 + Math.floor(rand() * N);
      if (c.indexOf(x) < 0) c.push(x);
    }
    return c.sort(function (a, b) { return a - b; });
  }

  /* ---------- 당첨 판정 ---------- */
  function matchCount(combo, draw) {
    var m = 0;
    for (var i = 0; i < PICK; i++) if (draw.nums.indexOf(combo[i]) >= 0) m++;
    return m;
  }

  /* 0 = 낙첨, 1~5 = 등수 */
  function rankOf(combo, draw) {
    var m = matchCount(combo, draw);
    if (m === 6) return 1;
    if (m === 5) return combo.indexOf(draw.b) >= 0 ? 2 : 3;
    if (m === 4) return 4;
    if (m === 3) return 5;
    return 0;
  }

  function prizeOf(rank, draw) {
    if (rank === 1) return draw.a1;
    if (rank === 2) return draw.a2;
    if (rank === 3) return draw.a3;
    return FIXED[rank] || 0;
  }

  /* ---------- 백테스트 ---------- */
  /**
   * "그 회차 직전까지의 데이터만 보고 추천 → 실제 추첨과 대조"를 과거 전 구간에 반복한다.
   * 화면이 멈추지 않도록 step(k) 로 k회차씩 나눠 돌린다.
   */
  function createBacktest(draws, opts) {
    opts = opts || {};
    var start = Math.max(opts.start || 100, RECENT);
    var perDraw = opts.perDraw || 5;
    var seed = opts.seed || 20021207;
    var keys = ['hot', 'cold', 'mixed', 'random'];
    var state = buildState(draws, start);
    var t = start;
    var res = {};
    keys.forEach(function (k) {
      res[k] = { tickets: 0, matches: 0, ranks: [0, 0, 0, 0, 0, 0], cost: 0, won: 0, hist: [0, 0, 0, 0, 0, 0, 0] };
    });

    function play(key, combo, draw) {
      var r = res[key], m = matchCount(combo, draw), rank = rankOf(combo, draw);
      r.tickets++; r.matches += m; r.hist[m]++; r.ranks[rank]++;
      r.cost += PRICE; r.won += prizeOf(rank, draw);
    }

    return {
      total: draws.length - start,
      done: function () { return t - start; },
      finished: function () { return t >= draws.length; },
      step: function (k) {
        var end = Math.min(draws.length, t + (k || 25));
        for (; t < end; t++) {
          var draw = draws[t];
          for (var i = 0; i < 3; i++) {
            var picks = generate(state, keys[i], {
              count: perDraw, samples: 120, avoidPopular: !!opts.avoidPopular,
              rand: rng(seed + draw.n * 7 + i)
            });
            for (var j = 0; j < picks.length; j++) play(keys[i], picks[j].nums, draw);
          }
          var rr = rng(seed + draw.n * 7 + 5);
          for (var q = 0; q < perDraw; q++) play('random', randomCombo(rr), draw);
          addDraw(state, draw);
        }
        return t >= draws.length;
      },
      result: function () { return res; }
    };
  }

  return {
    N: N, PICK: PICK, RECENT: RECENT, PRICE: PRICE, STRATEGIES: STRATEGIES,
    parse: parse, rng: rng, newState: newState, addDraw: addDraw, buildState: buildState,
    gapOf: gapOf, numberScores: numberScores, generate: generate, randomCombo: randomCombo,
    shapeOk: shapeOk, matchCount: matchCount, rankOf: rankOf, prizeOf: prizeOf,
    createBacktest: createBacktest
  };
});
