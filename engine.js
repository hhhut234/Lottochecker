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
    var z = opts.z || numberScores(s, strategy);   // opts.z 를 주면 그 점수를 그대로 쓴다
    var w = new Float64Array(N + 1), total = 0, k, i;
    for (k = 1; k <= N; k++) { w[k] = Math.exp(0.7 * z[k]); total += w[k]; }

    var usePair = !opts.z && (strategy === 'hot' || strategy === 'mixed');
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

  /* ---------- 조작 검증 ----------
   * "완전한 무작위 추첨"이라면 나올 수 없는 흔적이 있는지 여러 각도에서 본다.
   * 각 검정의 p 는 "공정한 추첨에서도 이 정도 이상 벗어날 확률"이다. */
  function zP(z) { return chiTail(z * z, 1); }   // 정규분포 양쪽 꼬리 확률

  function pop2(a, b) {                           // 두 비트마스크의 공통 비트 수
    var x = a & b; x = x - ((x >>> 1) & 0x55555555); x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
    return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24;
  }

  function pairChi(list) {                        // 번호 쌍 990개의 동반 출현 불균형
    var c = new Int32Array(D * D), i, j, k, e = list.length * 15 / 990, chi = 0;
    for (k = 0; k < list.length; k++) {
      var a = list[k];
      for (i = 0; i < PICK; i++) for (j = i + 1; j < PICK; j++) c[a[i] * D + a[j]]++;
    }
    for (i = 1; i <= N; i++) for (j = i + 1; j <= N; j++) chi += (c[i * D + j] - e) * (c[i * D + j] - e) / e;
    return chi;
  }

  function integrity(draws, opts) {
    opts = opts || {};
    var n = draws.length, s = buildState(draws), tests = [], i, j, k;
    function add(id, name, what, stat, p, note) { tests.push({ id: id, name: name, what: what, stat: stat, p: p, note: note || '' }); }

    // 1. 번호별 출현 횟수
    var f = fairness(s);
    add('freq', '번호별 출현 횟수', '특정 번호가 유난히 자주/드물게 나오는가', '카이제곱 ' + f.chi.toFixed(1) + ' (자유도 44)', f.p);

    // 2. 보너스 번호
    var bc = new Int32Array(D), be = n / N, bchi = 0;
    for (i = 0; i < n; i++) bc[draws[i].b]++;
    for (k = 1; k <= N; k++) bchi += (bc[k] - be) * (bc[k] - be) / be;
    add('bonus', '보너스 번호', '보너스 번호에 치우침이 있는가', '카이제곱 ' + bchi.toFixed(1) + ' (자유도 44)', chiTail(bchi, 44));

    // 3. 시기별 변화 — 전체로는 고르더라도 특정 시기에만 치우쳤을 수 있다(기계·공 교체 등)
    var eras = 5, size = Math.floor(n / eras), echi = 0, worst = null;
    for (var e = 0; e < eras; e++) {
      var lo = e * size, hi = e === eras - 1 ? n : lo + size, cnt = new Int32Array(D), ex = (hi - lo) * PICK / N, ch = 0;
      for (i = lo; i < hi; i++) for (j = 0; j < PICK; j++) cnt[draws[i].nums[j]]++;
      for (k = 1; k <= N; k++) ch += (cnt[k] - ex) * (cnt[k] - ex) / ex;
      ch *= (N - 1) / (N - PICK);
      echi += ch;
      var ep = chiTail(ch, 44);
      if (!worst || ep < worst.p) worst = { p: ep, from: draws[lo].n, to: draws[hi - 1].n };
    }
    add('era', '시기별 치우침', '전체 기간을 5개 시기로 나눠, 어느 시기에만 치우침이 있었는가',
      '카이제곱 합 ' + echi.toFixed(0) + ' (자유도 ' + 44 * eras + ')', chiTail(echi, 44 * eras),
      '가장 고르지 않았던 시기: ' + worst.from + '~' + worst.to + '회 (그 시기만의 p ' + (worst.p * 100).toFixed(0) + '%)');

    // 4. 번호 쌍 — 특정 번호끼리 유난히 같이 나오는가 (분포가 복잡해 모의 추첨으로 p 를 구한다)
    var obs = pairChi(draws.map(function (d) { return d.nums; }));
    var sims = opts.sims || 300, rand = rng(opts.seed || 645), ge = 0, sum = 0;
    for (var m = 0; m < sims; m++) {
      var fake = [];
      for (i = 0; i < n; i++) fake.push(randomCombo(rand));
      var v = pairChi(fake); sum += v; if (v >= obs) ge++;
    }
    add('pair', '번호 쌍의 동반 출현', '특정 번호끼리 유난히 함께 나오는가 (990쌍)',
      '카이제곱 ' + obs.toFixed(0) + ' (모의 추첨 평균 ' + (sum / sims).toFixed(0) + ')', (ge + 1) / (sims + 1),
      '공정한 가상 추첨 ' + sims + '벌과 비교');

    // 5. 직전 회차와의 연관 — 지난 번호가 다시 나오거나 일부러 피해지는가
    var VAR = 0.6146;
    function lagMean(lag) { var t = 0; for (var a = lag; a < n; a++) t += matchCount(draws[a].nums, draws[a - lag]); return t / (n - lag); }
    var l1 = lagMean(1);
    add('lag1', '직전 회차와 겹치는 번호', '지난 회차 번호가 다시 나오는 정도가 기대(0.800개)와 같은가',
      '평균 ' + l1.toFixed(3) + '개', zP((l1 - 0.8) / Math.sqrt(VAR / (n - 1))));
    var lm = 0, lc = 0;
    for (var lag = 2; lag <= 5; lag++) { lm += lagMean(lag) * (n - lag); lc += n - lag; }
    add('lag25', '2~5회 전과 겹치는 번호', '몇 회차 전 번호와의 연관이 있는가',
      '평균 ' + (lm / lc).toFixed(3) + '개', zP((lm / lc - 0.8) / Math.sqrt(VAR / lc)));

    // 6. 번호 합 — 평균과 연속 회차 간 상관
    var MEAN = PICK * (N + 1) / 2, SV = PICK * ((N * N - 1) / 12) * (N - PICK) / (N - 1);
    var sums = draws.map(function (d) { return d.nums.reduce(function (a, b) { return a + b; }, 0); });
    var sm = sums.reduce(function (a, b) { return a + b; }, 0) / n, ac = 0;
    for (i = 1; i < n; i++) ac += (sums[i] - MEAN) * (sums[i - 1] - MEAN);
    ac /= (n - 1) * SV;
    add('sum', '번호 합의 평균', '큰 번호 또는 작은 번호 쪽으로 쏠렸는가 (기대 ' + MEAN + ')',
      '평균 ' + sm.toFixed(1), zP((sm - MEAN) / Math.sqrt(SV / n)));
    add('sumac', '번호 합의 회차 간 연관', '이번에 합이 크면 다음에도 큰(또는 작은) 경향이 있는가',
      '상관계수 ' + (ac >= 0 ? '+' : '') + ac.toFixed(3), zP(ac * Math.sqrt(n - 1)));

    // 7. 비슷한 조합의 재등장 — 같은 조합을 돌려 쓰는가
    var lo32 = new Int32Array(n), hi32 = new Int32Array(n), near4 = 0, near5 = 0, same = 0;
    for (i = 0; i < n; i++) for (j = 0; j < PICK; j++) {
      var x = draws[i].nums[j];
      if (x <= 30) lo32[i] |= 1 << (x - 1); else hi32[i] |= 1 << (x - 31);
    }
    for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
      var c = pop2(lo32[i], lo32[j]) + pop2(hi32[i], hi32[j]);
      if (c >= 4) { near4++; if (c >= 5) { near5++; if (c === 6) same++; } }
    }
    var pairs = n * (n - 1) / 2, e4 = pairs * (11115 + 234 + 1) / TOTAL, e5 = pairs * 235 / TOTAL;
    add('reuse', '비슷한 조합의 재등장', '서로 다른 두 회차의 번호가 4개 이상 겹친 경우의 수',
      near4 + '쌍 (기대 ' + e4.toFixed(0) + '쌍)', zP((near4 - e4) / Math.sqrt(e4)),
      '5개 이상 겹침 ' + near5 + '쌍 (기대 ' + e5.toFixed(1) + '), 완전히 같은 조합 ' + same + '쌍 (기대 ' + (pairs / TOTAL).toFixed(2) + ')');

    // 8. 사람들이 많이 고른 번호를 피하거나 골라서 뽑는가
    //    (당첨자를 줄이거나 늘리려는 조작이라면 번호 인기도와 출현 횟수가 연관된다)
    var b = popularity(s), mb = 0, mc = 0, sbb = 0, scc = 0, sbc = 0;
    for (k = 1; k <= N; k++) { mb += b[k] / N; mc += s.count[k] / N; }
    for (k = 1; k <= N; k++) { sbb += (b[k] - mb) * (b[k] - mb); scc += (s.count[k] - mc) * (s.count[k] - mc); sbc += (b[k] - mb) * (s.count[k] - mc); }
    var r = sbc / Math.sqrt(sbb * scc);
    add('popfreq', '인기 번호와 출현 횟수', '사람들이 많이 고르는 번호가 덜(또는 더) 뽑히는가',
      '상관계수 ' + (r >= 0 ? '+' : '') + r.toFixed(2), zP(0.5 * Math.log((1 + r) / (1 - r)) * Math.sqrt(N - 3)));

    // 1등 당첨자 수: 판매량과 번호 인기도로 설명되지 않는 회차
    var rows = [], sw = 0, se = 0;
    draws.forEach(function (d) {
      if (!popUsable(d)) return;
      var e1 = d.sales / priceOf(d.n) / TOTAL * shareFactor(s, d.nums);
      rows.push({ d: d, e: e1 }); sw += d.w1; se += e1;
    });
    var scale = sw / se, disp = 0;
    rows.forEach(function (x) { x.mu = x.e * scale; x.z = (x.d.w1 - x.mu) / Math.sqrt(x.mu); disp += x.z * x.z; });
    disp /= rows.length - 1;
    rows.sort(function (a, c2) { return c2.z - a.z; });
    var zero = rows.filter(function (x) { return x.d.w1 === 0; }).length, zeroExp = 0;
    rows.forEach(function (x) { zeroExp += Math.exp(-x.mu); });

    return {
      tests: tests, sims: sims,
      winners: {
        dispersion: disp, draws: rows.length, zero: zero, zeroExpected: zeroExp,
        top: rows.slice(0, 6).map(function (x) { return { n: x.d.n, d: x.d.d, nums: x.d.nums, w1: x.d.w1, mu: x.mu }; })
      }
    };
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
  var BT_WINDOWS = [5, 10, 20, 50, 100];

  /* 백테스트 결과를 size 회차씩 끊어, 구간마다 조합당 평균 적중 개수를 낸다.
   * 마지막에 size 에 못 미치는 자투리 구간은 버린다. */
  function blocks(byDraw, size, perDraw) {
    var out = [];
    for (var a = 0; a + size <= byDraw.length; a += size) {
      var sum = 0;
      for (var i = a; i < a + size; i++) sum += byDraw[i];
      out.push({ from: a, to: a + size - 1, avg: sum / (size * perDraw) });
    }
    return out;
  }
  /* 조합 n개의 평균 적중 개수가 우연히 벌어질 수 있는 폭(약 95%) */
  function chanceBand(n) { return 2 * Math.sqrt(0.6146 / n); }
  function createBacktest(draws, opts) {
    opts = opts || {};
    var start = Math.max(opts.start || 100, RECENT);
    var perDraw = opts.perDraw || 5;
    var seed = opts.seed || 20021207;
    var state = buildState(draws, start);
    var t = start;
    var res = {};
    var total = draws.length - start;
    function blank() {
      return { tickets: 0, matches: 0, ranks: [0, 0, 0, 0, 0, 0], cost: 0, won: 0, share: 0, shareN: 0,
               byDraw: new Uint8Array(total) };   // 회차별 적중 개수 합(조합 perDraw개) — 구간별 보기용
    }
    BT_KEYS.forEach(function (k) { res[k] = blank(); });
    // "최근 W회만 보고 추천" 변형들
    var windows = opts.windows || BT_WINDOWS;
    windows.forEach(function (w) { res['w' + w] = blank(); });

    function play(key, combo, draw, canShare) {
      var r = res[key], rank = rankOf(combo, draw), m = matchCount(combo, draw);
      r.tickets++; r.matches += m; r.ranks[rank]++; r.byDraw[t - start] += m;
      r.cost += priceOf(draw.n); r.won += prizeOf(rank, draw);
      if (canShare) { r.share += shareFactor(state, combo); r.shareN++; }
    }

    function windowScores(w) {
      var c = new Int32Array(N + 1);
      for (var a = Math.max(0, t - w); a < t; a++) for (var b = 0; b < PICK; b++) c[draws[a].nums[b]]++;
      return zs(function (k) { return c[k]; });
    }

    return {
      total: total, start: start, perDraw: perDraw, windows: windows,
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
          for (i = 0; i < windows.length; i++) {
            var wp = generate(state, 'hot', {
              count: perDraw, samples: 120, z: windowScores(windows[i]),
              rand: rng(seed + draw.n * 7 + 100 + windows[i])
            });
            for (j = 0; j < wp.length; j++) play('w' + windows[i], wp[j].nums, draw, false);
          }
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
    createBacktest: createBacktest, blocks: blocks, chanceBand: chanceBand, BT_WINDOWS: BT_WINDOWS,
    fairness: fairness, chiTail: chiTail, integrity: integrity, numberDetail: numberDetail, patterns: patterns
  };
});
