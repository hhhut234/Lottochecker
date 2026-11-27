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

  function renderFair() {
    var f = L.fairness(state), okay = f.p >= 0.01;
    $('fair').innerHTML =
      '<div class="kv"><div><b>' + f.chi.toFixed(1) + '</b><span>카이제곱 (자유도 ' + f.df + ')</span></div>' +
      '<div><b>' + pct(f.p, 0) + '</b><span>p값</span></div>' +
      '<div><b class="' + (okay ? 'good' : 'bad') + '">' + (okay ? '치우침 없음' : '치우침 의심') + '</b><span>판정</span></div></div>' +
      '<p class="note">번호별 출현 횟수가 고르지 않은 정도를 검정한 값입니다. 완전히 공정한 추첨에서도 지금 정도 또는 더 큰 불균형이 나올 확률이 ' + pct(f.p, 0) + '입니다. ' +
      (okay ? '즉 "자주 나온 번호"와 "덜 나온 번호"의 차이는 우연으로 충분히 설명되고, 특정 번호가 유리하다는 증거는 없습니다.'
            : '1% 미만이면 우연으로 보기 어려운 치우침입니다.') + '</p>';
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
      renderTest(bt.result());
    })();
  }

  function renderTest(res) {
    var names = { random: '무작위' }, keys = L.BT_KEYS;
    Object.keys(L.STRATEGIES).forEach(function (k) { names[k] = L.STRATEGIES[k].name; });
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
      ? '네 분석법 모두 평균 적중 개수가 무작위 기대값(0.800)에서 우연 범위(±' + band.toFixed(3) + ') 안에 있습니다. 즉 과거 데이터에서 <b>번호를 더 잘 맞히는 방법은 없었습니다.</b>'
      : outside.map(function (k) { return names[k]; }).join(', ') + '이(가) 우연 범위(±' + band.toFixed(3) + ')를 벗어났습니다. 다만 여러 방법을 동시에 시험하면 우연히 벗어나는 경우도 생기므로, 구간을 바꿔도 같은 방향으로 유지되는지 확인이 필요합니다.';
    var un = res.unpop.share / res.unpop.shareN, rn = res.random.share / res.random.shareN;
    verdict += ' 차이가 난 것은 당첨금 쪽입니다. 「' + names.unpop + '」는 동시 당첨 배수가 ×' + un.toFixed(2) + '로 무작위(×' + rn.toFixed(2) +
      ')보다 낮아, 같은 확률로 1등이 되더라도 받는 금액이 약 ' + Math.round((rn / un - 1) * 100) + '% 많을 것으로 추정됩니다.';

    $('testOut').innerHTML =
      '<div class="card"><h2>결론</h2><p style="margin:0">' + verdict + '</p></div>' +
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
    renderChart(); renderFair(); renderDetailGrid(); renderDetail(); renderShape(); renderRecent();
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
