/* 로또 분석 — 화면 */
(function () {
  'use strict';
  var L = window.Lotto;
  var $ = function (id) { return document.getElementById(id); };

  var draws = [], state = null, next = 0;
  var ui = { strategy: 'mixed', avoid: false, reroll: 0, statMode: 'all' };

  /* ---------- 저장소 (이 기기 전용) ---------- */
  function load(key, fallback) {
    try { var v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
    catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 저장 불가 환경이면 무시 */ }
  }

  /* ---------- 표시 도우미 ---------- */
  function cls(n) { return 'c' + Math.min(5, Math.floor((n - 1) / 10) + 1); }
  function ball(n, extra) { return '<span class="ball ' + cls(n) + (extra ? ' ' + extra : '') + '">' + n + '</span>'; }
  function balls(nums, extra) { return nums.map(function (n) { return ball(n, extra); }).join(''); }
  function date(d) { return d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8); }
  function won(v) {
    if (v >= 1e8) return (v / 1e8).toFixed(v >= 1e10 ? 0 : 1) + '억원';
    if (v >= 1e4) return Math.round(v / 1e4).toLocaleString('ko-KR') + '만원';
    return v.toLocaleString('ko-KR') + '원';
  }
  function pct(v, digits) { return (v * 100).toFixed(digits == null ? 1 : digits) + '%'; }
  function comb(n, k) { var r = 1; for (var i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; }

  /* ---------- 추천 ---------- */
  function renderLatest() {
    var d = draws[draws.length - 1];
    $('latest').innerHTML =
      '<div class="note" style="margin:0 0 8px">' + d.n + '회 · ' + date(d.d) + '</div>' +
      '<div class="balls">' + balls(d.nums) + '<span class="plus">+</span>' + ball(d.b) + '</div>' +
      '<p class="note">1등 ' + d.w1 + '명' + (d.a1 ? ' · 1인당 ' + won(d.a1) : '') + '</p>';
  }

  function renderStrategy() {
    var keys = Object.keys(L.STRATEGIES);
    $('strategy').innerHTML = keys.map(function (k) {
      return '<button data-k="' + k + '"' + (k === ui.strategy ? ' class="on"' : '') + '>' + L.STRATEGIES[k].name + '</button>';
    }).join('');
    $('strategyDesc').textContent = L.STRATEGIES[ui.strategy].desc;
    $('avoid').checked = ui.avoid;
  }

  var currentPicks = [];
  function renderPicks() {
    var idx = Object.keys(L.STRATEGIES).indexOf(ui.strategy);
    var seed = next * 1000 + idx * 10 + (ui.avoid ? 1 : 0) + ui.reroll * 99991;
    currentPicks = L.generate(state, ui.strategy, {
      count: 5, samples: 600, avoidPopular: ui.avoid, rand: L.rng(seed)
    });
    $('pickTitle').textContent = next + '회 추천 조합';
    $('picks').innerHTML = currentPicks.map(function (p, i) {
      return '<div class="pick"><div><div class="balls">' + balls(p.nums) + '</div>' +
        '<div class="meta" style="text-align:left;margin-top:4px">통계 점수 ' + (p.score >= 0 ? '+' : '') + p.score.toFixed(1) +
        '</div></div><button class="save" data-i="' + i + '">저장</button></div>';
    }).join('') || '<div class="empty">조건에 맞는 조합을 만들지 못했습니다.</div>';

    var z = L.numberScores(state, ui.strategy), order = [];
    for (var k = 1; k <= L.N; k++) order.push(k);
    order.sort(function (a, b) { return z[b] - z[a]; });
    $('topNums').innerHTML = balls(order.slice(0, 10));
  }

  /* ---------- 통계 ---------- */
  function renderChart() {
    var vals = [], k, mode = ui.statMode, expected;
    for (k = 1; k <= L.N; k++) {
      vals[k] = mode === 'all' ? state.count[k] : mode === 'recent' ? state.recent[k] : L.gapOf(state, k);
    }
    if (mode === 'all') {
      expected = state.t * 6 / 45;
      $('statNote').textContent = '전체 ' + state.t + '회 기준. 번호당 기대 횟수는 ' + expected.toFixed(1) + '회이며, 옅은 막대는 기대보다 적게 나온 번호입니다.';
    } else if (mode === 'recent') {
      expected = L.RECENT * 6 / 45;
      $('statNote').textContent = '최근 ' + L.RECENT + '회 기준. 번호당 기대 횟수는 ' + expected.toFixed(1) + '회입니다.';
    } else {
      expected = null;
      $('statNote').textContent = '마지막으로 나온 뒤 지나간 회차 수입니다. 0은 직전 회차에 나왔다는 뜻입니다.';
    }
    var max = 1, min = Infinity;
    for (k = 1; k <= L.N; k++) { if (vals[k] > max) max = vals[k]; if (vals[k] < min) min = vals[k]; }
    var base = mode === 'all' ? Math.max(0, min - (max - min) * 0.4) : 0; // 전체 보기는 차이가 보이게 바닥을 올림
    var html = '';
    for (var r = 0; r < 3; r++) {
      var v = '', b = '', l = '';
      for (k = r * 15 + 1; k <= r * 15 + 15; k++) {
        var h = Math.max(2, (vals[k] - base) / (max - base) * 100);
        v += '<span>' + vals[k] + '</span>';
        b += '<div class="b' + (expected != null && vals[k] < expected ? ' lo' : '') + '" style="height:' + h.toFixed(1) + '%" title="' + k + '번: ' + vals[k] + '"></div>';
        l += '<span>' + k + '</span>';
      }
      html += '<div class="barval">' + v + '</div><div class="bars">' + b + '</div><div class="barlab">' + l + '</div>';
    }
    $('chart').innerHTML = html;
  }

  function renderShape() {
    var odd = [0, 0, 0, 0, 0, 0, 0], sumIn = 0, i;
    draws.forEach(function (d) {
      var o = 0, s = 0;
      d.nums.forEach(function (x) { if (x & 1) o++; s += x; });
      odd[o]++;
      if (s >= 100 && s <= 175) sumIn++;
    });
    var total = comb(45, 6), rows = '';
    for (i = 0; i <= 6; i++) {
      rows += '<tr><td>홀 ' + i + ' : 짝 ' + (6 - i) + '</td><td>' + odd[i] + '회</td><td>' + pct(odd[i] / draws.length) +
        '</td><td>' + pct(comb(23, i) * comb(22, 6 - i) / total) + '</td></tr>';
    }
    $('shape').innerHTML = '<thead><tr><th>홀짝 구성</th><th>실제</th><th>실제 비율</th><th>이론 비율</th></tr></thead><tbody>' + rows +
      '<tr><td>번호 합 100~175</td><td>' + sumIn + '회</td><td>' + pct(sumIn / draws.length) + '</td><td>—</td></tr></tbody>';
  }

  function renderRecent() {
    $('recent10').innerHTML = draws.slice(-10).reverse().map(function (d) {
      return '<div class="pick"><div class="balls">' + balls(d.nums, 'sm') + '<span class="plus">+</span>' + ball(d.b, 'sm') +
        '</div><span class="meta">' + d.n + '회<br>' + date(d.d) + '</span></div>';
    }).join('');
  }

  /* ---------- 백테스트 ---------- */
  var testing = false;
  function runTest() {
    if (testing) return;
    testing = true;
    var bt = L.createBacktest(draws, { start: 100, perDraw: 5, avoidPopular: ui.avoid });
    var prog = $('testProg');
    prog.hidden = false; prog.max = bt.total; prog.value = 0;
    $('runTest').disabled = true;
    $('testOut').innerHTML = '';
    (function loop() {
      var fin = bt.step(40);
      prog.value = bt.done();
      $('testState').textContent = bt.done() + ' / ' + bt.total + '회차';
      if (!fin) return setTimeout(loop, 0);
      testing = false;
      prog.hidden = true;
      $('runTest').disabled = false;
      $('testState').textContent = draws[100].n + '회 ~ ' + draws[draws.length - 1].n + '회, 회차당 5조합';
      renderTest(bt.result());
    })();
  }

  function renderTest(res) {
    var names = { hot: L.STRATEGIES.hot.name, cold: L.STRATEGIES.cold.name, mixed: L.STRATEGIES.mixed.name, random: '무작위' };
    var keys = ['hot', 'cold', 'mixed', 'random'];
    var tickets = res.random.tickets;
    var expected = 0.8;                                   // 한 조합이 맞히는 번호 수의 이론 기대값 (6×6/45)
    var se = Math.sqrt(0.6146 / tickets), band = 2 * se;  // 우연히 벌어질 수 있는 폭(약 95%)

    var rows1 = '', rows2 = '';
    keys.forEach(function (k) {
      var r = res[k], avg = r.matches / r.tickets, diff = avg - expected;
      var inside = Math.abs(diff) <= band;
      rows1 += '<tr><td>' + names[k] + '</td><td>' + avg.toFixed(3) + '</td><td>' + (diff >= 0 ? '+' : '') + diff.toFixed(3) +
        '</td><td>' + (inside ? '우연 범위 안' : '<b>범위 밖</b>') + '</td></tr>';
      rows2 += '<tr><td>' + names[k] + '</td><td>' + r.ranks[5] + '</td><td>' + r.ranks[4] + '</td><td>' + r.ranks[3] +
        '</td><td>' + r.ranks[2] + '</td><td>' + r.ranks[1] + '</td><td>' + won(r.won) +
        '</td><td class="' + (r.won >= r.cost ? 'good' : 'bad') + '">' + pct(r.won / r.cost, 0) + '</td></tr>';
    });

    var outside = keys.slice(0, 3).filter(function (k) {
      return Math.abs(res[k].matches / res[k].tickets - expected) > band;
    });
    var verdict = outside.length === 0
      ? '세 분석법 모두 평균 적중 개수가 무작위 기대값(0.800)에서 우연 범위(±' + band.toFixed(3) + ') 안에 있습니다. 즉 과거 데이터에서는 무작위로 고른 것과 구별되는 차이가 없었습니다.'
      : outside.map(function (k) { return names[k]; }).join(', ') + '이(가) 우연 범위(±' + band.toFixed(3) + ')를 벗어났습니다. 다만 여러 방법을 동시에 시험하면 우연히 벗어나는 경우도 생기므로, 구간을 바꿔도 같은 방향으로 유지되는지 확인이 필요합니다.';

    $('testOut').innerHTML =
      '<div class="card"><h2>결론</h2><p style="margin:0">' + verdict + '</p></div>' +
      '<div class="card"><h2>조합당 평균 적중 개수</h2><div class="kv">' +
        '<div><b>' + tickets.toLocaleString('ko-KR') + '</b><span>방법별 시험한 조합 수</span></div>' +
        '<div><b>0.800</b><span>이론 기대값</span></div>' +
        '<div><b>±' + band.toFixed(3) + '</b><span>우연 범위</span></div></div>' +
        '<div class="tscroll" style="margin-top:10px"><table><thead><tr><th>방법</th><th>평균 적중</th><th>기대값 대비</th><th>판정</th></tr></thead><tbody>' + rows1 + '</tbody></table></div></div>' +
      '<div class="card"><h2>등수별 당첨 횟수와 회수율</h2>' +
        '<div class="tscroll"><table><thead><tr><th>방법</th><th>5등</th><th>4등</th><th>3등</th><th>2등</th><th>1등</th><th>받은 돈</th><th>회수율</th></tr></thead><tbody>' + rows2 + '</tbody></table></div>' +
        '<p class="note">방법마다 쓴 돈은 ' + won(res.random.cost) + '입니다. 회수율은 3등 이상이 한 번 나오느냐에 크게 흔들리므로, 방법 간 비교는 위의 평균 적중 개수가 더 믿을 만합니다.</p></div>';
  }

  /* ---------- 내 번호 ---------- */
  var chosen = [];
  function renderGrid() {
    var html = '';
    for (var k = 1; k <= L.N; k++) {
      var on = chosen.indexOf(k) >= 0;
      html += '<button data-n="' + k + '" class="' + (on ? 'on ' + cls(k) : '') + '">' + k + '</button>';
    }
    $('grid').innerHTML = html;
    $('gridState').textContent = chosen.length === 6 ? next + '회차용으로 저장됩니다' : (6 - chosen.length) + '개 더 고르세요';
    $('addMine').disabled = chosen.length !== 6;
  }

  function addMine(nums) {
    var list = load('lotto.mine', []);
    var key = nums.join(',');
    if (list.some(function (m) { return m.round === next && m.nums.join(',') === key; })) return false;
    list.unshift({ nums: nums.slice(), round: next });
    save('lotto.mine', list);
    renderMine();
    return true;
  }

  function renderMine() {
    var list = load('lotto.mine', []);
    if (!list.length) { $('mine').innerHTML = '<div class="empty">저장한 번호가 없습니다.</div>'; return; }
    var byRound = {};
    draws.forEach(function (d) { byRound[d.n] = d; });
    $('mine').innerHTML = list.map(function (m, i) {
      var d = byRound[m.round], body, meta;
      if (!d) {
        body = balls(m.nums, 'sm');
        meta = m.round + '회<br>추첨 대기';
      } else {
        body = m.nums.map(function (n) { return ball(n, 'sm ' + (d.nums.indexOf(n) >= 0 ? 'hit' : 'miss')); }).join('');
        var rank = L.rankOf(m.nums, d);
        meta = m.round + '회<br>' + (rank ? '<b class="good">' + rank + '등 · ' + won(L.prizeOf(rank, d)) + '</b>' : '낙첨 (' + L.matchCount(m.nums, d) + '개)');
      }
      return '<div class="pick"><div class="balls">' + body + '</div><div class="row" style="flex-wrap:nowrap">' +
        '<span class="meta">' + meta + '</span><button class="save" data-del="' + i + '" aria-label="삭제">삭제</button></div></div>';
    }).join('');
  }

  /* ---------- 이벤트 ---------- */
  function bind() {
    document.querySelector('nav').addEventListener('click', function (e) {
      var t = e.target.closest('button'); if (!t) return;
      document.querySelectorAll('nav button').forEach(function (b) { b.classList.toggle('on', b === t); });
      document.querySelectorAll('main section').forEach(function (s) { s.classList.toggle('on', s.id === 'tab-' + t.dataset.tab); });
      window.scrollTo(0, 0);
    });
    $('strategy').addEventListener('click', function (e) {
      var t = e.target.closest('button'); if (!t) return;
      ui.strategy = t.dataset.k; ui.reroll = 0;
      save('lotto.ui', { strategy: ui.strategy, avoid: ui.avoid });
      renderStrategy(); renderPicks();
    });
    $('avoid').addEventListener('change', function () {
      ui.avoid = $('avoid').checked; ui.reroll = 0;
      save('lotto.ui', { strategy: ui.strategy, avoid: ui.avoid });
      renderPicks();
    });
    $('reroll').addEventListener('click', function () { ui.reroll++; renderPicks(); });
    $('picks').addEventListener('click', function (e) {
      var t = e.target.closest('button.save'); if (!t) return;
      var ok = addMine(currentPicks[+t.dataset.i].nums);
      t.textContent = ok ? '저장됨' : '이미 있음';
      t.disabled = true;
    });
    $('statMode').addEventListener('click', function (e) {
      var t = e.target.closest('button'); if (!t) return;
      ui.statMode = t.dataset.m;
      $('statMode').querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b === t); });
      renderChart();
    });
    $('runTest').addEventListener('click', runTest);
    $('grid').addEventListener('click', function (e) {
      var t = e.target.closest('button'); if (!t) return;
      var n = +t.dataset.n, i = chosen.indexOf(n);
      if (i >= 0) chosen.splice(i, 1); else if (chosen.length < 6) chosen.push(n);
      renderGrid();
    });
    $('addMine').addEventListener('click', function () {
      addMine(chosen.slice().sort(function (a, b) { return a - b; }));
      chosen = []; renderGrid();
    });
    $('mine').addEventListener('click', function (e) {
      var t = e.target.closest('button[data-del]'); if (!t) return;
      if (!window.confirm('이 번호를 삭제할까요?')) return;
      var list = load('lotto.mine', []);
      list.splice(+t.dataset.del, 1);
      save('lotto.mine', list);
      renderMine();
    });
  }

  /* ---------- 시작 ---------- */
  function start(payload) {
    draws = L.parse(payload);
    state = L.buildState(draws);
    var last = draws[draws.length - 1];
    next = last.n + 1;
    var saved = load('lotto.ui', {});
    if (L.STRATEGIES[saved.strategy]) ui.strategy = saved.strategy;
    ui.avoid = !!saved.avoid;
    $('headline').textContent = '1~' + last.n + '회 분석 · 최신 ' + date(last.d) + ' 추첨 · 데이터 갱신 ' + payload.updated;
    renderLatest(); renderStrategy(); renderPicks();
    renderChart(); renderShape(); renderRecent();
    renderGrid(); renderMine();
  }

  bind();
  fetch('data.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(start)
    .catch(function () {
      $('headline').textContent = '당첨번호 데이터(data.json)를 불러오지 못했습니다. 「데이터 갱신」을 먼저 실행해 주세요.';
    });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(function () { /* 설치 불가 환경이면 무시 */ });
  }
})();
