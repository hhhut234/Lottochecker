/* 로또 6/45 분석 엔진 — 브라우저(window.Lotto)와 node(require) 양쪽에서 쓴다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Lotto = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var N = 45;          // 번호 범위
  var PICK = 6;        // 한 조합의 번호 수
  var RECENT = 30;     // "최근" 창 크기(회차)
  var TOTAL = 8145060; // 전체 조합 수
  var P5 = 182780 / TOTAL;   // 한 게임이 5등(3개 일치)이 될 확률
  var PRICE_CHANGE = 88;     // 이 회차부터 한 게임 1,000원·5등 5,000원 (그 전은 2,000원·10,000원)
  var POP_MIN = 100;         // 인기도 추정에 필요한 최소 회차 수

  var STRATEGIES = {
    mixed: { name: '종합 점수', desc: '전체 빈도 + 최근 추세 + 미출현 기간을 섞은 점수' },
    hot:   { name: '자주 나온 번호', desc: '전체·최근 출현이 많은 번호 위주' },
    cold:  { name: '오래 안 나온 번호', desc: '미출현 기간이 긴 번호 위주' },
    unpop: { name: '남들이 덜 고르는 번호', desc: '당첨 확률은 같지만, 당첨되면 나눠 갖는 사람이 적은 번호 위주' }
  };

  function priceOf(n) { return n < PRICE_CHANGE ? 2000 : 1000; }

  /* ---------- 데이터 ---------- */
  function parse(payload) {
    return payload.draws.map(function (r) {
      return {
        n: r[0], d: String(r[1]),
        nums: [r[2], r[3], r[4], r[5], r[6], r[7]].sort(function (a, b) { return a - b; }),
        b: r[8], w1: r[9] || 0, a1: r[10] || 0, a2: r[11] || 0, a3: r[12] || 0,
        sales: r[13] || 0, w5: r[17] || 0
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

  /* ---------- 번호 인기도 ----------
   * 5등(3개 일치) 당첨자 수는 수백만 명 단위라 우연의 영향이 거의 없다.
   * "판매량으로 기대되는 5등 인원" 대비 실제 인원이 많으면, 그 회차 당첨번호는
   * 사람들이 평소 많이 고르는 번호였다는 뜻이다. 이를 번호별 효과로 분해한다:
   *   ln(실제/기대) = a + Σ(당첨번호 k의 효과 b_k)
   */
  var D = N + 1;
  function popNew() { return { A: new Float64Array(D * D), B: new Float64Array(D), n: 0 }; }

  function popUsable(d) { return d.n >= PRICE_CHANGE && d.sales > 0 && d.w5 > 0; }

  function popAdd(acc, d) {
    if (!popUsable(d)) return;
    var y = Math.log(d.w5 / (d.sales / priceOf(d.n) * P5));
    var idx = [0].concat(d.nums), i, j;
    for (i = 0; i < idx.length; i++) {
      acc.B[idx[i]] += y;
      for (j = 0; j < idx.length; j++) acc.A[idx[i] * D + idx[j]]++;
    }
    acc.n++;
  }

  /* 번호별 효과 b[1..45] (b[0]은 기준선). 데이터가 부족하면 전부 0. */
  function popSolve(acc) {
    var b = new Float64Array(D);
    if (acc.n < POP_MIN) return b;
    var M = new Float64Array(D * (D + 1)), i, j, k;
    for (i = 0; i < D; i++) {
      for (j = 0; j < D; j++) M[i * (D + 1) + j] = acc.A[i * D + j];
      if (i > 0) M[i * (D + 1) + i] += 1;   // 약한 규제: 번호 효과의 합이 0 근처에 오게 한다
      M[i * (D + 1) + D] = acc.B[i];
    }
    for (i = 0; i < D; i++) {                // 가우스 소거
      var p = i, best = Math.abs(M[i * (D + 1) + i]);
      for (k = i + 1; k < D; k++) if (Math.abs(M[k * (D + 1) + i]) > best) { best = Math.abs(M[k * (D + 1) + i]); p = k; }
      if (p !== i) for (j = 0; j <= D; j++) { var tmp = M[i * (D + 1) + j]; M[i * (D + 1) + j] = M[p * (D + 1) + j]; M[p * (D + 1) + j] = tmp; }
      var piv = M[i * (D + 1) + i];
      for (k = i + 1; k < D; k++) {
        var f = M[k * (D + 1) + i] / piv;
        if (f) for (j = i; j <= D; j++) M[k * (D + 1) + j] -= f * M[i * (D + 1) + j];
      }
    }
    for (i = D - 1; i >= 0; i--) {
      var s = M[i * (D + 1) + D];
      for (j = i + 1; j < D; j++) s -= M[i * (D + 1) + j] * b[j];
      b[i] = s / M[i * (D + 1) + i];
    }
    return b;
  }

  /* ---------- 누적 통계 ---------- */
  function newState() {
    return {
      t: 0,
      count: new Int32Array(N + 1),
      last: new Int32Array(N + 1).fill(-1),
      recent: new Int32Array(N + 1),
      window: [],
      pair: new Int32Array((N + 1) * (N + 1)),
      pop: popNew(), popCache: null, popAt: -1
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
    popAdd(s.pop, draw);
    s.t++;
    return s;
  }

  function buildState(draws, upto) {
    var s = newState(), end = upto == null ? draws.length : upto;
    for (var i = 0; i < end; i++) addDraw(s, draws[i]);
    return s;
  }

  function gapOf(s, k) { return s.last[k] < 0 ? s.t + 1 : s.t - 1 - s.last[k]; }

  function popularity(s) {
    if (s.popAt !== s.t) { s.popCache = popSolve(s.pop); s.popAt = s.t; }
    return s.popCache;
  }

  /* 이 조합이 1등이 됐을 때 함께 당첨될 사람 수의 배수(1 = 평균).
   * 5등은 6개 중 3개만 맞으면 되므로 번호 효과가 절반만 드러난다 → 1등에는 2배로 적용.
   * (실제 1등 당첨자 수로 따로 맞춰 봐도 계수가 약 2.0으로 나온다.) */
  function shareFactor(s, combo) {
    var b = popularity(s), sum = 0;
    for (var i = 0; i < combo.length; i++) sum += b[combo[i]];
    return Math.exp(2 * sum);
  }

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
    if (strategy === 'unpop') {
      var b = popularity(s);
      return zs(function (k) { return -b[k]; });
    }
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

    var usePair = strategy === 'hot' || strategy === 'mixed';
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
        if (usePair) for (j = i + 1; j < PICK; j++) ps += s.pair[c[i] * (N + 1) + c[j]];
      }
      if (usePair && pairMean > 0) sc += 0.15 * (ps / 15 - pairMean) / Math.sqrt(pairMean);
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
    if (rank === 4) return 50000;
    if (rank === 5) return draw.n && draw.n < PRICE_CHANGE ? 10000 : 5000;
    return 0;
  }

  /* ---------- 공정성 검정 ---------- */
  function gammln(x) {
    var cof = [76.18009172947146, -86.50532032941677, 24.01409824083091,
      -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    var y = x, tmp = x + 5.5, ser = 1.000000000190015;
    tmp -= (x + 0.5) * Math.log(tmp);
    for (var j = 0; j < 6; j++) ser += cof[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }

  /* 카이제곱 분포의 오른쪽 꼬리 확률 */
  function chiTail(x, df) {
    var a = df / 2, xx = x / 2, i;
    if (xx <= 0) return 1;
    var lead = Math.exp(-xx + a * Math.log(xx) - gammln(a));
    if (xx < a + 1) {
      var ap = a, sum = 1 / a, del = sum;
      for (i = 0; i < 500; i++) { ap++; del *= xx / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-12) break; }
      return 1 - sum * lead;
    }
    var tiny = 1e-300, b = xx + 1 - a, c = 1 / tiny, d = 1 / b, h = d;
    for (i = 1; i < 500; i++) {
      var an = -i * (i - a);
      b += 2;
      d = an * d + b; if (Math.abs(d) < tiny) d = tiny;
      c = b + an / c; if (Math.abs(c) < tiny) c = tiny;
      d = 1 / d;
      var dl = d * c; h *= dl;
      if (Math.abs(dl - 1) < 1e-12) break;
    }
    return lead * h;
  }

  /* 번호별 출현 횟수가 "완전히 공정한 추첨"에서 나올 만한 범위인지 본다.
   * 한 회차에 같은 번호가 두 번 나올 수 없으므로 (N-1)/(N-PICK) 로 보정한다. */
  function fairness(s) {
    var e = s.t * PICK / N, chi = 0;
    for (var k = 1; k <= N; k++) chi += (s.count[k] - e) * (s.count[k] - e) / e;
    chi *= (N - 1) / (N - PICK);
    return { chi: chi, df: N - 1, p: chiTail(chi, N - 1), expected: e };
  }

  /* ---------- 번호 하나 자세히 ---------- */
  function numberDetail(draws, s, k) {
    var gaps = [], prev = -1, i;
    for (i = 0; i < draws.length; i++) {
      if (draws[i].nums.indexOf(k) >= 0) { if (prev >= 0) gaps.push(i - prev - 1); prev = i; }
    }
    var partners = [];
    for (i = 1; i <= N; i++) {
      if (i !== k) partners.push({ n: i, c: s.pair[Math.min(i, k) * (N + 1) + Math.max(i, k)] });
    }
    partners.sort(function (a, b) { return b.c - a.c; });
    var e = s.t * PICK / N, sd = Math.sqrt(s.t * (PICK / N) * (1 - PICK / N));
    return {
      count: s.count[k], expected: e, z: (s.count[k] - e) / sd,
      recent: s.recent[k], gap: gapOf(s, k),
      avgGap: gaps.length ? gaps.reduce(function (a, b) { return a + b; }, 0) / gaps.length : 0,
      maxGap: gaps.length ? Math.max.apply(null, gaps) : 0,
      partners: partners.slice(0, 5),
      pairExpected: s.t * 15 / 990,
      pop: Math.exp(2 * popularity(s)[k]) - 1
    };
  }

  /* ---------- 모양 통계 (실제 vs 이론) ---------- */
  function comb(n, k) { var r = 1; for (var i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; }

  function patterns(draws) {
    var odd = [0, 0, 0, 0, 0, 0, 0], carry = [0, 0, 0, 0, 0, 0, 0], consec = 0, sumIn = 0, i;
    draws.forEach(function (d, t) {
      var o = 0, sm = 0, has = false;
      for (i = 0; i < PICK; i++) {
        if (d.nums[i] & 1) o++;
        sm += d.nums[i];
        if (i && d.nums[i] === d.nums[i - 1] + 1) has = true;
      }
      odd[o]++;
      if (has) consec++;
      if (sm >= 100 && sm <= 175) sumIn++;
      if (t) carry[matchCount(d.nums, draws[t - 1])]++;
    });
    var oddT = [], carryT = [];
    for (i = 0; i <= 6; i++) {
      oddT.push(comb(23, i) * comb(22, 6 - i) / TOTAL);
      carryT.push(comb(6, i) * comb(39, 6 - i) / TOTAL);
    }
    return {
      n: draws.length, odd: odd, oddT: oddT, carry: carry, carryT: carryT,
      consec: consec, consecT: 1 - comb(40, 6) / TOTAL, sumIn: sumIn
    };
  }

  /* ---------- 인기도 검증 ----------
   * 앞쪽 절반 회차의 5등 인원으로 인기도를 맞춘 뒤, 뒤쪽 절반 회차를
   * "당첨번호의 인기 점수" 순으로 3등분해 실제 1등 당첨자 수를 비교한다. */
  function popValidation(draws) {
    var ok = draws.filter(popUsable), h = Math.floor(ok.length / 2), acc = popNew(), i;
    for (i = 0; i < h; i++) popAdd(acc, ok[i]);
    var b = popSolve(acc), rest = [];
    for (i = h; i < ok.length; i++) {
      var d = ok[i], sc = 0;
      for (var j = 0; j < PICK; j++) sc += b[d.nums[j]];
      rest.push({ s: sc, w1: d.w1, e1: d.sales / priceOf(d.n) / TOTAL });
    }
    rest.sort(function (x, y) { return x.s - y.s; });
    var third = Math.floor(rest.length / 3), out = [];
    [[0, third], [third, 2 * third], [2 * third, rest.length]].forEach(function (r) {
      var w = 0, e = 0;
      for (i = r[0]; i < r[1]; i++) { w += rest[i].w1; e += rest[i].e1; }
      out.push({ draws: r[1] - r[0], avg: w / (r[1] - r[0]), ratio: w / e });
    });
    return { fitFrom: ok[0].n, fitTo: ok[h - 1].n, testFrom: ok[h].n, testTo: ok[ok.length - 1].n, groups: out };
  }

  /* ---------- 백테스트 ---------- */
  /**
   * "그 회차 직전까지의 데이터만 보고 추천 → 실제 추첨과 대조"를 과거 전 구간에 반복한다.
   * 화면이 멈추지 않도록 step(k) 로 k회차씩 나눠 돌린다.
   */
  var BT_KEYS = ['mixed', 'hot', 'cold', 'unpop', 'random'];
  function createBacktest(draws, opts) {
    opts = opts || {};
    var start = Math.max(opts.start || 100, RECENT);
    var perDraw = opts.perDraw || 5;
    var seed = opts.seed || 20021207;
    var state = buildState(draws, start);
    var t = start;
    var res = {};
    BT_KEYS.forEach(function (k) {
      res[k] = { tickets: 0, matches: 0, ranks: [0, 0, 0, 0, 0, 0], cost: 0, won: 0, share: 0, shareN: 0 };
    });

    function play(key, combo, draw, canShare) {
      var r = res[key], rank = rankOf(combo, draw);
      r.tickets++; r.matches += matchCount(combo, draw); r.ranks[rank]++;
      r.cost += priceOf(draw.n); r.won += prizeOf(rank, draw);
      if (canShare) { r.share += shareFactor(state, combo); r.shareN++; }
    }

    return {
      total: draws.length - start,
      done: function () { return t - start; },
      finished: function () { return t >= draws.length; },
      step: function (k) {
        var end = Math.min(draws.length, t + (k || 25));
        for (; t < end; t++) {
          var draw = draws[t], canShare = state.pop.n >= POP_MIN, i, j;
          for (i = 0; i < 4; i++) {
            var picks = generate(state, BT_KEYS[i], {
              count: perDraw, samples: 120, avoidPopular: !!opts.avoidPopular,
              rand: rng(seed + draw.n * 7 + i)
            });
            for (j = 0; j < picks.length; j++) play(BT_KEYS[i], picks[j].nums, draw, canShare);
          }
          var rr = rng(seed + draw.n * 7 + 5);
          for (j = 0; j < perDraw; j++) play('random', randomCombo(rr), draw, canShare);
          addDraw(state, draw);
        }
        return t >= draws.length;
      },
      result: function () { return res; }
    };
  }

  return {
    N: N, PICK: PICK, RECENT: RECENT, TOTAL: TOTAL, STRATEGIES: STRATEGIES, BT_KEYS: BT_KEYS,
    parse: parse, rng: rng, newState: newState, addDraw: addDraw, buildState: buildState,
    gapOf: gapOf, numberScores: numberScores, generate: generate, randomCombo: randomCombo,
    shapeOk: shapeOk, matchCount: matchCount, rankOf: rankOf, prizeOf: prizeOf, priceOf: priceOf,
    popularity: popularity, shareFactor: shareFactor, popValidation: popValidation,
    createBacktest: createBacktest, fairness: fairness, chiTail: chiTail, numberDetail: numberDetail, patterns: patterns
  };
});
