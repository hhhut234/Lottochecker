/* 로또 분석 — 화면 */
(function () {
  'use strict';
  var L = window.Lotto, M = window.Machine;
  var $ = function (id) { return document.getElementById(id); };
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var draws = [], state = null, next = 0;
  var ui = { strategy: 'mixed', avoid: false, reroll: -1, statMode: 'all', detail: 0 };

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
  function ball(n, extra, style) {
    return '<span class="ball ' + cls(n) + (extra ? ' ' + extra : '') + '"' + (style ? ' style="' + style + '"' : '') + '>' + n + '</span>';
  }
  function balls(nums, extra) { return nums.map(function (n) { return ball(n, extra); }).join(''); }
  function date(d) { return d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8); }
  function won(v) {
    if (v >= 1e8) return (v / 1e8).toFixed(v >= 1e10 ? 0 : 1) + '억원';
    if (v >= 1e4) return Math.round(v / 1e4).toLocaleString('ko-KR') + '만원';
    return v.toLocaleString('ko-KR') + '원';
  }
  function pct(v, digits) { return (v * 100).toFixed(digits == null ? 1 : digits) + '%'; }
  function signed(v, digits) {
    var s = v.toFixed(digits);
    if (parseFloat(s) === 0) return s.replace('-', '');   // "-0" 대신 "0"
    return (v > 0 ? '+' : '') + s;
  }
  function shareHtml(f) {
    return '<b class="' + (f < 0.97 ? 'good' : f > 1.03 ? 'bad' : '') + '">×' + f.toFixed(2) + '</b>';
  }

  /* ---------- 추첨 ---------- */
  var currentPicks = [];

  function emptyTray() {
    var h = '';
    for (var i = 0; i < 6; i++) h += '<span class="ball empty">?</span>';
    $('tray').innerHTML = h;
  }

  function resetMachine() {
    ui.reroll = -1;
    emptyTray();
    $('resultCard').hidden = true;
    $('go').textContent = '추첨 시작';
    $('machineTitle').textContent = '분석 번호 추첨';
  }

  function makePicks() {
    var idx = Object.keys(L.STRATEGIES).indexOf(ui.strategy);
    var seed = next * 1000 + idx * 10 + (ui.avoid ? 1 : 0) + ui.reroll * 99991;
    return L.generate(state, ui.strategy, { count: 5, samples: 600, avoidPopular: ui.avoid, rand: L.rng(seed) });
  }

  function startDraw() {
    if (M.busy()) return;
    ui.reroll++;
    currentPicks = makePicks();
    if (!currentPicks.length) { $('machineTitle').textContent = '조건에 맞는 조합이 없습니다'; return; }
    var first = currentPicks[0].nums, order = first.slice(), r = L.rng(next * 31 + ui.reroll * 7 + 3), i;
    for (i = order.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = order[i]; order[i] = order[j]; order[j] = t; }

    emptyTray();
    $('resultCard').hidden = true;
    $('go').disabled = true; $('go').textContent = '추첨 중…';
    $('skip').hidden = false;
    $('machineTitle').textContent = 'A 게임 추첨 중';

    M.draw(order, function (n, k) {
      var slot = $('tray').children[k];
      if (slot) slot.outerHTML = ball(n, calm ? '' : 'pop');
    }, finishDraw);
    if (calm) M.skip();
  }

  function finishDraw() {
    $('skip').hidden = true;
    $('go').disabled = false; $('go').textContent = '다시 추첨';
    $('machineTitle').textContent = 'A 게임 추첨 완료';
    $('tray').innerHTML = currentPicks[0].nums.map(function (n, i) {
      return ball(n, calm ? '' : 'flip', 'animation-delay:' + (i * 60) + 'ms');
    }).join('');
    if (!calm) {
      var m = $('machine');
      m.classList.remove('win-glow'); void m.offsetWidth; m.classList.add('win-glow');
      M.confetti($('confetti'));
    }
    renderPicks();
  }

  function renderPicks() {
    $('pickTitle').textContent = next + '회 추첨 결과 · ' + L.STRATEGIES[ui.strategy].name;
    $('picks').innerHTML = currentPicks.map(function (p, i) {
      var bl = p.nums.map(function (n, k) {
        return ball(n, calm ? '' : 'flip', 'animation-delay:' + (i * 180 + k * 50) + 'ms');
      }).join('');
      return '<div class="pick"><span class="lab">' + 'ABCDE'.charAt(i) + '</span><div class="mid"><div class="balls">' + bl + '</div>' +
        '<div class="meta">통계 점수 <b>' + signed(p.score, 1) + '</b> · 동시 당첨 ' + shareHtml(L.shareFactor(state, p.nums)) + '</div></div>' +
        '<button class="save" data-i="' + i + '">저장</button></div>';
    }).join('');
    $('resultCard').hidden = false;
  }

  function renderStrategy() {
    $('strategy').innerHTML = Object.keys(L.STRATEGIES).map(function (k) {
      return '<button data-k="' + k + '"' + (k === ui.strategy ? ' class="on"' : '') + '>' + L.STRATEGIES[k].name + '</button>';
    }).join('');
    $('strategyDesc').textContent = L.STRATEGIES[ui.strategy].desc;
    $('avoid').checked = ui.avoid;
  }

  function renderLatest() {
    var d = draws[draws.length - 1];
    $('latest').innerHTML =
      '<div class="note" style="margin:0 0 10px">' + d.n + '회 · ' + date(d.d) + '</div>' +
      '<div class="balls">' + balls(d.nums) + '<span class="plus">+</span>' + ball(d.b) + '</div>' +
      '<p class="note">1등 ' + d.w1 + '명' + (d.a1 ? ' · 1인당 ' + won(d.a1) : '') +
      ' · 이 번호의 동시 당첨 추정 ' + shareHtml(L.shareFactor(state, d.nums)) + '</p>';
  }

  /* ---------- 통계 ---------- */
  function renderChart() {
    var vals = [], k, mode = ui.statMode, expected;
    for (k = 1; k <= L.N; k++) {
      vals[k] = mode === 'all' ? state.count[k] : mode === 'recent' ? state.recent[k] : L.gapOf(state, k);
    }
    if (mode === 'all') {
      expected = state.t * 6 / 45;
      $('statNote').textContent = '전체 ' + state.t + '회 기준. 번호당 기대 횟수는 ' + expected.toFixed(1) + '회이며, 어두운 막대는 기대보다 적게 나온 번호입니다.';
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

  var integrityDone = false;
  function renderIntegrity() {
    if (integrityDone) return;
    integrityDone = true;
    var r = L.integrity(draws, { sims: 300 });
    var bad = 0, warn = 0;
    var rows = r.tests.map(function (t) {
      var lvl = t.p < 0.005 ? 'no' : t.p < 0.05 ? 'warn' : 'ok';
      if (lvl === 'no') bad++; else if (lvl === 'warn') warn++;
      var ptxt = t.p < 0.001 ? '0.1% 미만' : pct(t.p, t.p < 0.1 ? 1 : 0);
      return '<div class="tst"><div><div class="nm">' + t.name + '</div><div class="ds">' + t.what + '</div>' +
        '<div class="ds">' + t.stat + (t.note ? ' · ' + t.note : '') + '</div></div>' +
        '<div class="rt"><div class="pv">p ' + ptxt + '</div><span class="badge ' + lvl + '">' +
        (lvl === 'no' ? '의심' : lvl === 'warn' ? '약한 신호' : '정상') + '</span></div></div>';
    }).join('');
    var n = r.tests.length, verdict;
    if (bad) verdict = '<b class="bad">' + n + '개 검정 중 ' + bad + '개에서 우연으로 보기 어려운 치우침이 나왔습니다.</b> 아래에서 어떤 검정인지 확인하세요.';
    else if (warn) verdict = '<b class="gold">' + n + '개 검정 중 뚜렷한 조작 흔적은 없고, ' + warn + '개가 약한 신호입니다.</b> 검정을 ' + n + '개 하면 공정한 추첨에서도 평균 ' + (n * 0.05).toFixed(1) + '개쯤은 약한 신호가 우연히 나옵니다.';
    else verdict = '<b class="good">' + n + '개 검정 모두 정상입니다.</b> ' + draws.length + '회 기록에서 무작위 추첨과 구별되는 패턴은 발견되지 않았습니다.';
    $('integrity').innerHTML = '<p style="margin:12px 0 4px">' + verdict + '</p>' + rows +
      '<p class="note">이 검정들이 조작을 실제로 잡아내는지도 확인했습니다. 특정 번호를 10% 더 자주 뽑거나, 직전 번호를 피하거나, 과거 조합을 5% 재사용하도록 일부러 조작한 가짜 기록은 모두 "의심"으로 걸렸습니다. ' +
      '다만 번호 기록에 흔적을 남기지 않는 부정(예: 당첨번호를 미리 아는 경우)은 이 방법으로 알 수 없습니다.</p>';

    var w = r.winners;
    $('winners').innerHTML =
      '<p class="note" style="margin-top:0">판매량과 번호 인기도로 예상한 인원보다 실제 1등이 훨씬 많았던 회차입니다. "조작 아니냐"는 말이 가장 많이 나오는 회차들입니다.</p>' +
      w.top.map(function (x) {
        return '<div class="pick"><div class="mid"><div class="balls">' + balls(x.nums, 'sm') + '</div>' +
          '<div class="meta">' + x.n + '회 · ' + date(x.d) + '</div></div>' +
          '<span class="meta r"><b>' + x.w1 + '명</b><br>예상 ' + x.mu.toFixed(1) + '명</span></div>';
      }).join('') +
      '<p class="note">번호를 보면 공통점이 있습니다. 용지에서 한 줄·한 덩어리로 찍히는 번호(20·21·22, 30·31·32, 35·36·37)이거나 사람들이 좋아하는 번호 묶음입니다. ' +
      '수동으로 같은 모양을 찍는 사람이 많아서 그 모양이 나오면 당첨자가 한꺼번에 몰립니다. 조작이라면 굳이 당첨자가 많이 나오는 번호를 뽑을 이유가 없고, 당첨금 총액은 판매액의 일정 비율로 정해져 있어 운영 쪽 이득도 달라지지 않습니다.</p>' +
      '<p class="note">참고: 1등이 0명이었던 회차는 ' + w.zero + '회(예상 ' + w.zeroExpected.toFixed(1) + '회)였고, 당첨자 수의 들쭉날쭉함은 순수한 우연의 ' + w.dispersion.toFixed(1) + '배 수준입니다. 1보다 큰 것은 위와 같은 모양 쏠림 때문입니다.</p>';
  }

  function renderDetailGrid() {
    var h = '';
    for (var k = 1; k <= L.N; k++) h += '<button data-n="' + k + '"' + (k === ui.detail ? ' class="on"' : '') + '>' + k + '</button>';
    $('detailGrid').innerHTML = h;
  }

  function renderDetail() {
    if (!ui.detail) { $('detail').innerHTML = '<div class="empty">번호를 누르면 자세한 기록이 나옵니다.</div>'; return; }
    var k = ui.detail, d = L.numberDetail(draws, state, k);
    var zText = Math.abs(d.z) < 2 ? '우연 범위 안' : '우연 범위를 조금 벗어남';
    $('detail').innerHTML =
      '<div class="row" style="margin:14px 0 10px">' + ball(k) + '<span class="note" style="margin:0">기대 ' + d.expected.toFixed(1) + '회 대비 ' +
        signed(d.count - d.expected, 1) + '회 (표준편차의 ' + signed(d.z, 1) + '배, ' + zText + ')</span></div>' +
      '<div class="kv">' +
        '<div><b>' + d.count + '</b><span>전체 출현</span></div>' +
        '<div><b>' + d.recent + '</b><span>최근 ' + L.RECENT + '회</span></div>' +
        '<div><b>' + d.gap + '</b><span>미출현 회차</span></div>' +
        '<div><b>' + d.avgGap.toFixed(1) + '</b><span>평균 간격 (이론 6.5)</span></div>' +
        '<div><b>' + d.maxGap + '</b><span>최장 간격</span></div>' +
        '<div><b class="' + (d.pop < -0.01 ? 'good' : d.pop > 0.01 ? 'bad' : '') + '">' + signed(d.pop * 100, 1) + '%</b><span>인기도 (1등 인원 영향)</span></div>' +
      '</div>' +
      '<h3>함께 가장 자주 나온 번호 (쌍마다 기대 ' + d.pairExpected.toFixed(1) + '회)</h3>' +
      '<div class="row">' + d.partners.map(function (p) {
        return '<span class="row" style="gap:4px">' + ball(p.n, 'sm') + '<span class="note" style="margin:0">' + p.c + '회</span></span>';
      }).join('') + '</div>';
  }

  function renderShape() {
    var p = L.patterns(draws), i, rows = '', rows2 = '';
    for (i = 0; i <= 6; i++) {
      rows += '<tr><td>홀 ' + i + ' : 짝 ' + (6 - i) + '</td><td>' + p.odd[i] + '회</td><td>' + pct(p.odd[i] / p.n) + '</td><td>' + pct(p.oddT[i]) + '</td></tr>';
    }
    for (i = 0; i <= 3; i++) {
      var c = i < 3 ? p.carry[i] : p.carry[3] + p.carry[4] + p.carry[5] + p.carry[6];
      var t = i < 3 ? p.carryT[i] : p.carryT[3] + p.carryT[4] + p.carryT[5] + p.carryT[6];
      rows2 += '<tr><td>직전 회차와 ' + i + (i < 3 ? '개' : '개 이상') + ' 겹침</td><td>' + c + '회</td><td>' + pct(c / (p.n - 1)) + '</td><td>' + pct(t) + '</td></tr>';
    }
    rows2 += '<tr><td>연속번호 포함</td><td>' + p.consec + '회</td><td>' + pct(p.consec / p.n) + '</td><td>' + pct(p.consecT) + '</td></tr>' +
      '<tr><td>번호 합 100~175</td><td>' + p.sumIn + '회</td><td>' + pct(p.sumIn / p.n) + '</td><td>—</td></tr>';
    var head = '<thead><tr><th>구분</th><th>실제</th><th>실제 비율</th><th>이론 비율</th></tr></thead>';
    $('shape').innerHTML =
      '<div class="tscroll"><table>' + head + '<tbody>' + rows + '</tbody></table></div>' +
      '<div class="tscroll" style="margin-top:14px"><table>' + head + '<tbody>' + rows2 + '</tbody></table></div>' +
      '<p class="note">이론 비율은 완전한 무작위 추첨일 때의 값입니다. 실제 비율이 거의 같다는 것은 "이월수"나 "연속번호" 같은 패턴도 우연이 만든 모양이라는 뜻입니다.</p>';
  }

  function renderRecent() {
    $('recent10').innerHTML = draws.slice(-10).reverse().map(function (d) {
      return '<div class="pick"><div class="balls">' + balls(d.nums, 'sm') + '<span class="plus">+</span>' + ball(d.b, 'sm') +
        '</div><span class="meta r">' + d.n + '회<br>1등 ' + d.w1 + '명</span></div>';
    }).join('');
  }

  /* ---------- 인기도 ---------- */
  function renderPop() {
    var b = L.popularity(state), v = [], k, max = 0.01;
    for (k = 1; k <= L.N; k++) { v[k] = Math.exp(2 * b[k]) - 1; if (Math.abs(v[k]) > max) max = Math.abs(v[k]); }
    var html = '';
    for (var r = 0; r < 3; r++) {
      var val = '', cols = '', lab = '';
      for (k = r * 15 + 1; k <= r * 15 + 15; k++) {
        var h = (Math.abs(v[k]) / max * 100).toFixed(1);
        val += '<span>' + signed(v[k] * 100, 0) + '</span>';
        cols += '<div class="col" title="' + k + '번: ' + signed(v[k] * 100, 1) + '%"><div class="up">' + (v[k] > 0 ? '<i style="height:' + h + '%"></i>' : '') +
          '</div><div class="dn">' + (v[k] <= 0 ? '<i style="height:' + h + '%"></i>' : '') + '</div></div>';
        lab += '<span>' + k + '</span>';
      }
      html += '<div class="barval">' + val + '</div><div class="div">' + cols + '</div><div class="barlab">' + lab + '</div>';
    }
    $('popChart').innerHTML = html;

    var order = [];
    for (k = 1; k <= L.N; k++) order.push(k);
    order.sort(function (x, y) { return v[x] - v[y]; });
    function chip(n) { return '<span class="row" style="gap:4px;margin-bottom:4px">' + ball(n, 'sm') + '<span class="note" style="margin:0">' + signed(v[n] * 100, 0) + '%</span></span>'; }
    $('popLow').innerHTML = order.slice(0, 8).map(chip).join('');
    $('popHigh').innerHTML = order.slice(-8).reverse().map(chip).join('');

    var val2 = L.popValidation(draws), names = ['덜 고르는 번호 위주로 나온 회차', '중간', '많이 고르는 번호 위주로 나온 회차'];
    var g = val2.groups;
    $('popVal').innerHTML =
      '<p class="note" style="margin-top:0">' + val2.fitFrom + '~' + val2.fitTo + '회의 <b>5등</b> 인원만으로 인기도를 추정한 뒤, 추정에 쓰지 않은 ' +
        val2.testFrom + '~' + val2.testTo + '회를 당첨번호의 인기 점수 순으로 3등분해 실제 <b>1등</b> 당첨자 수를 비교했습니다.</p>' +
      '<div class="tscroll" style="margin-top:10px"><table><thead><tr><th>회차 구분</th><th>회차 수</th><th>1등 평균</th><th>판매량 기대 대비</th></tr></thead><tbody>' +
      g.map(function (x, i) {
        return '<tr><td>' + names[i] + '</td><td>' + x.draws + '</td><td>' + x.avg.toFixed(1) + '명</td><td class="' + (x.ratio < 1 ? 'good' : 'bad') + '">×' + x.ratio.toFixed(2) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="note">' + (g[2].ratio > g[0].ratio
        ? '많이 고르는 번호가 나온 회차는 1등이 평균 ' + g[2].avg.toFixed(1) + '명, 덜 고르는 번호가 나온 회차는 ' + g[0].avg.toFixed(1) + '명이었습니다. 처음 보는 회차에서도 방향이 맞았으므로 이 추정은 실제 효과가 있습니다. '
        : '이번 데이터에서는 그룹 간 차이가 뚜렷하지 않았습니다. ') +
      '다만 구매의 상당수가 자동(무작위)이라 차이는 크지 않습니다. 번호를 잘 골라도 동시 당첨자는 대략 20% 안팎 줄어드는 정도이며, 당첨 확률 자체는 변하지 않습니다.</p>';
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
      var fin = bt.step(30);
      prog.value = bt.done();
      $('testState').textContent = bt.done() + ' / ' + bt.total + '회차';
      if (!fin) return setTimeout(loop, 0);
      testing = false;
      prog.hidden = true;
      $('runTest').disabled = false;
      $('testState').textContent = draws[100].n + '회 ~ ' + draws[draws.length - 1].n + '회, 회차당 5조합';
      lastBt = { res: bt.result(), start: bt.start, perDraw: bt.perDraw, windows: bt.windows };
      renderTest(lastBt.res);
      renderBlocks();
    })();
  }

  /* ---------- 구간별로 끊어 보기 ---------- */
  var lastBt = null, blockUi = { size: 10, key: 'mixed' };
  var BLOCK_SIZES = [5, 10, 20, 50, 100];

  function blockStats(key, size) {
    var list = L.blocks(lastBt.res[key].byDraw, size, lastBt.perDraw);
    var band = L.chanceBand(size * lastBt.perDraw), above = 0, out = 0, best = list[0], worst = list[0];
    list.forEach(function (b) {
      if (b.avg > 0.8) above++;
      if (Math.abs(b.avg - 0.8) > band) out++;
      if (b.avg > best.avg) best = b;
      if (b.avg < worst.avg) worst = b;
    });
    return { list: list, band: band, above: above, out: out, best: best, worst: worst };
  }

  function renderBlocks() {
    if (!lastBt) return;
    var names = btNames();
    var size = blockUi.size, st = blockStats(blockUi.key, size), rnd = blockStats('random', size);
    var n = st.list.length, span = st.band, i;
    st.list.forEach(function (b) { span = Math.max(span, Math.abs(b.avg - 0.8)); });
    span *= 1.12;
    function y(v) { return 50 - (v - 0.8) / span * 50; }
    function round(b) { return draws[lastBt.start + b.from].n + '~' + draws[lastBt.start + b.to].n + '회'; }

    var bars = '';
    for (i = 0; i < n; i++) {
      var a = st.list[i].avg, top = Math.min(y(a), 50), h = Math.max(0.6, Math.abs(y(a) - 50));
      var col = Math.abs(a - 0.8) <= st.band ? '#6ea8ff' : a > 0.8 ? '#f6c453' : '#ff7a6b';
      bars += '<rect x="' + (i + 0.12) + '" y="' + top.toFixed(2) + '" width="0.76" height="' + h.toFixed(2) + '" fill="' + col + '"><title>' +
        round(st.list[i]) + ': ' + a.toFixed(3) + '</title></rect>';
    }
    var svg = '<svg viewBox="0 0 ' + n + ' 100" preserveAspectRatio="none" style="width:100%;height:150px;display:block;margin-top:10px" role="img" aria-label="구간별 평균 적중 개수">' +
      '<rect x="0" y="' + y(0.8 + st.band).toFixed(2) + '" width="' + n + '" height="' + (y(0.8 - st.band) - y(0.8 + st.band)).toFixed(2) + '" fill="rgba(255,255,255,.06)"/>' +
      bars + '<line x1="0" x2="' + n + '" y1="50" y2="50" stroke="rgba(255,255,255,.45)" stroke-width="0.4" vector-effect="non-scaling-stroke"/></svg>';

    function row(label, s) {
      return '<tr><td>' + label + '</td><td>' + pct(s.above / s.list.length, 0) + '</td><td>' + s.out + '개 (' + pct(s.out / s.list.length, 0) + ')</td></tr>';
    }
    $('blockOut').innerHTML =
      '<div class="seg">' + BLOCK_SIZES.map(function (s) {
        return '<button data-bs="' + s + '"' + (s === size ? ' class="on"' : '') + '>' + s + '회씩</button>';
      }).join('') + '</div>' +
      '<div class="seg" style="margin-top:8px">' + L.BT_SHOW.map(function (k) {
        return '<button data-bk="' + k + '"' + (k === blockUi.key ? ' class="on"' : '') + '>' + names[k] + '</button>';
      }).join('') + '</div>' +
      svg +
      '<div class="legend" style="margin-top:8px"><span><i style="background:#6ea8ff"></i>우연 범위 안</span><span><i style="background:#f6c453"></i>범위 위</span><span><i style="background:#ff7a6b"></i>범위 아래</span></div>' +
      '<p class="note">막대 하나가 ' + size + '회차(조합 ' + (size * lastBt.perDraw) + '개)의 평균 적중 개수입니다. 가운데 선이 기대값 0.800, 옅은 띠가 이 구간 크기에서의 우연 범위(±' + st.band.toFixed(3) + ')입니다. 왼쪽이 과거, 오른쪽이 최근입니다.</p>' +
      '<div class="kv" style="margin-top:10px">' +
        '<div><b>' + n + '</b><span>구간 수</span></div>' +
        '<div><b>' + st.best.avg.toFixed(2) + '</b><span>최고 · ' + round(st.best) + '</span></div>' +
        '<div><b>' + st.worst.avg.toFixed(2) + '</b><span>최저 · ' + round(st.worst) + '</span></div></div>' +
      '<div class="tscroll" style="margin-top:10px"><table><thead><tr><th>방법</th><th>기대값보다 높았던 구간</th><th>우연 범위 밖 구간</th></tr></thead><tbody>' +
        row(names[blockUi.key], st) + (blockUi.key === 'random' ? '' : row('무작위', rnd)) + '</tbody></table></div>' +
      '<p class="note">어떤 방법이 정말 효과가 있다면 대부분의 구간에서 기대값보다 높아야 합니다. 효과가 없으면 높았던 구간이 절반 근처이고, 범위 밖 구간은 무작위로 골라도 5% 안팎 나옵니다. 구간을 짧게 끊을수록 들쭉날쭉해 보이지만, 그만큼 우연 범위도 넓어집니다. 또 분석법이 뽑은 조합들은 같은 번호를 선호해 함께 맞고 함께 틀리기 때문에, 무작위보다 범위 밖 구간이 조금 더 많이 나오는 것이 정상입니다.</p>';

    var band = L.chanceBand(lastBt.res.random.tickets), wr = '';
    lastBt.windows.forEach(function (w) {
      var r = lastBt.res['w' + w], avg = r.matches / r.tickets, d = avg - 0.8;
      wr += '<tr><td>최근 ' + w + '회</td><td>' + avg.toFixed(3) + '</td><td>' + signed(d, 3) + '</td><td>' +
        (Math.abs(d) <= band ? '우연 범위 안' : '<b class="bad">범위 밖</b>') + '</td></tr>';
    });
    $('windowOut').innerHTML =
      '<div class="tscroll"><table><thead><tr><th>참고한 기간</th><th>평균 적중</th><th>기대 대비</th><th>판정</th></tr></thead><tbody>' + wr + '</tbody></table></div>' +
      '<p class="note">매 회차마다 직전 N회에 많이 나온 번호 위주로 5조합을 추천했을 때의 결과입니다. 우연 범위는 ±' + band.toFixed(3) + '입니다.</p>';
  }

  function btNames() {
    var names = { random: '무작위', nn: '신경망 (딥러닝)' };
    Object.keys(L.STRATEGIES).forEach(function (k) { names[k] = L.STRATEGIES[k].name; });
    return names;
  }

  function nnHtml(res) {
    var r = res.nn, n = r.tickets / 5, loss = r.loss / n, base = r.baseLoss, gain = (base - loss) / base;
    var learned = gain > 0.002;
    return '<div class="kv">' +
        '<div><b>' + loss.toFixed(4) + '</b><span>신경망의 예측 오차</span></div>' +
        '<div><b>' + base.toFixed(4) + '</b><span>아무것도 모를 때의 오차</span></div>' +
        '<div><b class="' + (learned ? 'good' : '') + '">' + signed(gain * 100, 2) + '%</b><span>개선 폭</span></div></div>' +
      '<p class="note">번호마다 최근 5·10·20·50·100회 출현 횟수, 미출현 기간, 직전 회차 출현 여부, 전체 출현 횟수를 넣어 "다음 회차에 나올 확률"을 예측하게 한 2층 신경망입니다. 매 회차를 그 전까지의 데이터로만 학습한 상태에서 예측했습니다.</p>' +
      '<p class="note">' + (learned
        ? '오차가 기준보다 줄었습니다. 다만 위 표의 평균 적중 개수가 우연 범위 안이라면 실제로 쓸 수 있는 수준은 아닙니다.'
        : '예측 오차가 "모든 번호가 6/45 확률"이라고만 답했을 때와 사실상 같습니다. 신경망이 학습 끝에 도달한 결론이 "과거 기록에는 쓸 정보가 없다"였다는 뜻입니다.') + '</p>';
  }

  /* ---------- 패턴 자동 탐색 ---------- */
  function runPatterns() {
    $('patOut').innerHTML = '<div class="empty">탐색 중…</div>';
    setTimeout(function () {
      var r = L.patternSearch(draws);
      var rows = r.top.map(function (h) {
        var keep = h.zA * h.zB > 0 && Math.abs(h.zB) > 2;
        return '<div class="tst"><div><div class="nm">' + h.cond + ' → ' + h.target + '번이 ' + (h.zA > 0 ? '더' : '덜') + ' 나온다</div>' +
          '<div class="ds">발견 구간 ' + pct(h.rA, 0) + ' (' + h.nA + '회 중) · 검증 구간 ' + pct(h.rB, 0) + ' (' + h.nB + '회 중) · 기대 13%</div></div>' +
          '<div class="rt"><span class="badge ' + (keep ? 'no' : 'ok') + '">' + (keep ? '재현됨' : '사라짐') + '</span></div></div>';
      }).join('');
      $('patOut').innerHTML =
        '<div class="kv" style="margin-top:10px">' +
          '<div><b>' + r.hypotheses.toLocaleString('ko-KR') + '</b><span>시험한 가설 수</span></div>' +
          '<div><b>' + r.strong + '</b><span>발견 구간에서 강해 보인 것</span></div>' +
          '<div><b>' + Math.round(r.strongExpected) + '</b><span>우연만으로 기대되는 수</span></div>' +
          '<div><b>' + r.confirmed + ' / ' + r.top.length + '</b><span>상위 가설 중 재현된 것</span></div></div>' +
        '<p style="margin:12px 0 4px">' + (r.confirmed === 0
          ? '<b class="good">발견 구간에서 가장 강해 보였던 패턴 ' + r.top.length + '개 중, 처음 보는 회차에서도 유지된 것은 하나도 없습니다.</b>'
          : '<b class="gold">상위 ' + r.top.length + '개 중 ' + r.confirmed + '개가 검증 구간에서도 같은 방향으로 나왔습니다.</b> 가설을 많이 시험하면 우연히 재현되는 것도 생기므로, 다음 회차들에서 계속 유지되는지 지켜봐야 합니다.') + '</p>' +
        rows +
        '<p class="note">' + r.discFrom + '~' + r.discTo + '회에서 패턴을 찾고, ' + r.holdFrom + '~' + r.holdTo + '회로 검증했습니다. 가설을 수천 개 시험하면 아무 패턴이 없어도 그럴듯해 보이는 것이 수백 개 나옵니다(위의 ' + r.strong + '개 대 기대 ' + Math.round(r.strongExpected) + '개). ' +
        '그래서 "찾은 데이터"가 아니라 "처음 보는 데이터"에서 다시 확인해야 합니다. 전체 가설에 대해 발견 구간과 검증 구간의 결과가 얼마나 닮았는지를 나타내는 상관계수는 ' + signed(r.corr, 3) + '로, 0에 가까울수록 발견 구간의 결과가 검증 구간과 무관했다는 뜻입니다.</p>';
    }, 30);
  }

  function renderTest(res) {
    var names = btNames(), keys = L.BT_SHOW;
    var tickets = res.random.tickets;
    var expected = 0.8;                                   // 한 조합이 맞히는 번호 수의 이론 기대값 (6×6/45)
    var se = Math.sqrt(0.6146 / tickets), band = 2 * se;  // 우연히 벌어질 수 있는 폭(약 95%)

    var rows1 = '', rows2 = '';
    keys.forEach(function (k) {
      var r = res[k], avg = r.matches / r.tickets, diff = avg - expected, sh = r.share / r.shareN;
      rows1 += '<tr><td>' + names[k] + '</td><td>' + avg.toFixed(3) + '</td><td>' + signed(diff, 3) +
        '</td><td>' + (Math.abs(diff) <= band ? '우연 범위 안' : '<b class="bad">범위 밖</b>') + '</td><td>' + shareHtml(sh) + '</td></tr>';
      rows2 += '<tr><td>' + names[k] + '</td><td>' + r.ranks[5] + '</td><td>' + r.ranks[4] + '</td><td>' + r.ranks[3] +
        '</td><td>' + r.ranks[2] + '</td><td>' + r.ranks[1] + '</td><td>' + won(r.won) +
        '</td><td class="' + (r.won >= r.cost ? 'good' : 'bad') + '">' + pct(r.won / r.cost, 0) + '</td></tr>';
    });

    var outside = keys.filter(function (k) {
      return k !== 'random' && Math.abs(res[k].matches / res[k].tickets - expected) > band;
    });
    var verdict = outside.length === 0
      ? '신경망을 포함한 ' + (keys.length - 1) + '가지 방법 모두 평균 적중 개수가 무작위 기대값(0.800)에서 우연 범위(±' + band.toFixed(3) + ') 안에 있습니다. 즉 과거 데이터에서 <b>번호를 더 잘 맞히는 방법은 없었습니다.</b>'
      : outside.map(function (k) { return names[k]; }).join(', ') + '이(가) 우연 범위(±' + band.toFixed(3) + ')를 벗어났습니다. 다만 여러 방법을 동시에 시험하면 우연히 벗어나는 경우도 생기므로, 구간을 바꿔도 같은 방향으로 유지되는지 확인이 필요합니다.';
    var un = res.unpop.share / res.unpop.shareN, rn = res.random.share / res.random.shareN;
    verdict += ' 차이가 난 것은 당첨금 쪽입니다. 「' + names.unpop + '」는 동시 당첨 배수가 ×' + un.toFixed(2) + '로 무작위(×' + rn.toFixed(2) +
      ')보다 낮아, 같은 확률로 1등이 되더라도 받는 금액이 약 ' + Math.round((rn / un - 1) * 100) + '% 많을 것으로 추정됩니다.';

    $('testOut').innerHTML =
      '<div class="card"><h2>결론</h2><p style="margin:0">' + verdict + '</p></div>' +
      '<div class="card"><h2>구간별로 끊어 보기</h2><div id="blockOut"></div></div>' +
      '<div class="card"><h2>최근 몇 회만 보고 추천했다면</h2><div id="windowOut"></div></div>' +
      '<div class="card"><h2>신경망(딥러닝)은 무엇을 배웠나</h2>' + nnHtml(res) + '</div>' +
      '<div class="card"><h2>조합당 평균 적중 개수</h2><div class="kv">' +
        '<div><b>' + tickets.toLocaleString('ko-KR') + '</b><span>방법별 시험 조합 수</span></div>' +
        '<div><b>0.800</b><span>이론 기대값</span></div>' +
        '<div><b>±' + band.toFixed(3) + '</b><span>우연 범위</span></div></div>' +
        '<div class="tscroll" style="margin-top:10px"><table><thead><tr><th>방법</th><th>평균 적중</th><th>기대 대비</th><th>판정</th><th>동시 당첨</th></tr></thead><tbody>' + rows1 + '</tbody></table></div>' +
        '<p class="note">동시 당첨 배수는 그 시점까지의 데이터로 추정한 값의 평균입니다(인기도 추정이 가능해진 회차부터).</p></div>' +
      '<div class="card"><h2>등수별 당첨 횟수와 회수율</h2>' +
        '<div class="tscroll"><table><thead><tr><th>방법</th><th>5등</th><th>4등</th><th>3등</th><th>2등</th><th>1등</th><th>받은 돈</th><th>회수율</th></tr></thead><tbody>' + rows2 + '</tbody></table></div>' +
        '<p class="note">방법마다 쓴 돈은 ' + won(res.random.cost) + '입니다. 회수율은 3등 이상이 한 번 나오느냐에 크게 흔들리므로, 방법 간 비교는 위의 평균 적중 개수가 더 믿을 만합니다.</p></div>';
  }

  /* ---------- 내 번호 ---------- */
  var chosen = [];
  function renderGrid() {
    var html = '';
    for (var k = 1; k <= L.N; k++) html += '<button data-n="' + k + '"' + (chosen.indexOf(k) >= 0 ? ' class="on"' : '') + '>' + k + '</button>';
    $('grid').innerHTML = html;
    $('gridState').innerHTML = chosen.length === 6
      ? next + '회차용 · 동시 당첨 ' + shareHtml(L.shareFactor(state, chosen))
      : (6 - chosen.length) + '개 더 고르세요';
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
        '<span class="meta r">' + meta + '</span><button class="save" data-del="' + i + '">삭제</button></div></div>';
    }).join('');
  }

  /* ---------- 이벤트 ---------- */
  function bind() {
    document.querySelector('nav').addEventListener('click', function (e) {
      var t = e.target.closest('button'); if (!t) return;
      document.querySelectorAll('nav button').forEach(function (b) { b.classList.toggle('on', b === t); });
      document.querySelectorAll('main section').forEach(function (s) { s.classList.toggle('on', s.id === 'tab-' + t.dataset.tab); });
      window.scrollTo(0, 0);
      if (t.dataset.tab === 'stats' && draws.length) setTimeout(renderIntegrity, 60);   // 계산이 무거워 탭을 열 때 한 번만
    });
    $('go').addEventListener('click', startDraw);
    $('skip').addEventListener('click', function () { M.skip(); });
    $('strategy').addEventListener('click', function (e) {
      var t = e.target.closest('button'); if (!t || M.busy()) return;
      ui.strategy = t.dataset.k;
      save('lotto.ui', { strategy: ui.strategy, avoid: ui.avoid });
      renderStrategy(); resetMachine();
    });
    $('avoid').addEventListener('change', function () {
      if (M.busy()) { $('avoid').checked = ui.avoid; return; }
      ui.avoid = $('avoid').checked;
      save('lotto.ui', { strategy: ui.strategy, avoid: ui.avoid });
      resetMachine();
    });
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
    $('detailGrid').addEventListener('click', function (e) {
      var t = e.target.closest('button'); if (!t) return;
      ui.detail = +t.dataset.n;
      renderDetailGrid(); renderDetail();
    });
    $('runTest').addEventListener('click', runTest);
    $('runPat').addEventListener('click', runPatterns);
    $('testOut').addEventListener('click', function (e) {
      var t = e.target.closest('button'); if (!t) return;
      if (t.dataset.bs) blockUi.size = +t.dataset.bs;
      else if (t.dataset.bk) blockUi.key = t.dataset.bk;
      else return;
      renderBlocks();
    });
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
    $('headline').textContent = '1~' + last.n + '회 분석 · 최신 ' + date(last.d) + ' 추첨 · 갱신 ' + payload.updated;
    $('roundLabel').textContent = '제 ' + next + '회';
    renderStrategy(); resetMachine(); renderLatest();
    renderChart(); renderDetailGrid(); renderDetail(); renderShape(); renderRecent();
    renderPop();
    renderGrid(); renderMine();
    $('go').disabled = false;
  }

  bind();
  emptyTray();
  M.init($('drum'));
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
