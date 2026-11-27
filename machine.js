/* 추첨기 연출 — 통 안에서 공 45개가 바람에 섞이다가, 정해진 번호가 하나씩 아래 출구로 떨어진다. */
(function () {
  'use strict';

  var W = 260, H = 290;            // 캔버스 논리 크기
  var CX = 130, CY = 126, R = 116; // 통 중심·반지름
  var BR = 10.5;                   // 공 반지름
  var EXIT_Y = R - BR - 2;         // 통 바닥(출구), 중심 기준
  var JET = 36;                    // 바닥에서 솟는 바람 기둥의 반폭
  var COLORS = [
    ['#ffe98a', '#f5b70a', '#c98600', '#3a2600'],
    ['#9fd0ff', '#2f86e0', '#1759a6', '#ffffff'],
    ['#ffa9a4', '#e5484d', '#a8262b', '#ffffff'],
    ['#c9d0d9', '#7d8794', '#4d5661', '#ffffff'],
    ['#a5e39c', '#3fa34d', '#23722f', '#ffffff']
  ];

  var canvas, ctx, dpr = 1, sprites = [];
  var balls = [], running = false, lastT = 0, blow = 0, quietFor = 0;
  var job = null; // 진행 중인 추첨

  function colorOf(n) { return COLORS[Math.min(4, Math.floor((n - 1) / 10))]; }

  function makeSprite(n) {
    var size = Math.ceil(BR * 2 * dpr) + 2, c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d'), col = colorOf(n), r = BR * dpr, m = size / 2;
    var grad = g.createRadialGradient(m - r * 0.36, m - r * 0.44, r * 0.1, m, m, r);
    grad.addColorStop(0, col[0]); grad.addColorStop(0.5, col[1]); grad.addColorStop(1, col[2]);
    g.fillStyle = grad;
    g.beginPath(); g.arc(m, m, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = col[3];
    g.font = '800 ' + Math.round(9.8 * dpr) + 'px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(n), m, m + 0.5 * dpr);
    return c;
  }

  function fill() {
    balls = [];
    for (var n = 1; n <= 45; n++) {
      var a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * (R - BR - 2);
      balls.push({ n: n, x: Math.cos(a) * d, y: Math.sin(a) * d * 0.6 + 20, vx: 0, vy: 0, mode: 'in' });
    }
  }

  function init(el) {
    canvas = el;
    dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx = canvas.getContext('2d');
    sprites = [null];
    for (var n = 1; n <= 45; n++) sprites.push(makeSprite(n));
    fill();
    kick();
  }

  function kick() {
    quietFor = 0;
    if (running) return;
    running = true; lastT = 0;
    requestAnimationFrame(frame);
  }

  function physics(dt) {
    var i, j, b, n = balls.length, target = job && job.current;
    for (i = 0; i < n; i++) {
      b = balls[i];
      if (b.mode === 'tube') { b.x += (0 - b.x) * 0.3; b.vy = Math.min(420, b.vy + 1400 * dt); b.y += b.vy * dt; continue; }
      if (b.mode === 'pick') {
        // 뽑힌 공은 다른 공 사이를 빠져나와 바닥 가운데 출구로 빨려 들어간다
        b.vx += (0 - b.x) * 90 * dt; b.vy += ((EXIT_Y - b.y) * 90 + 500) * dt;
        var damp = Math.pow(0.0006, dt);
        b.vx *= damp; b.vy *= damp;
        b.x += b.vx * dt; b.y += b.vy * dt;
        continue;
      }
      b.vy += 950 * dt;
      if (blow > 0) {
        // 바닥 가운데에서 솟는 바람: 가운데로 올라갔다가 벽을 타고 떨어지며 돈다
        var ax = Math.abs(b.x);
        if (ax < JET && b.y > -R * 0.25) {
          var depth = Math.pow((b.y + R * 0.25) / (R * 1.25), 0.7);   // 아래쪽일수록 세고, 위쪽 절반에서는 사라진다
          b.vy -= (3900 + Math.random() * 1300) * (1 - ax / JET * 0.5) * depth * blow * dt;
        }
        if (b.y < -R * 0.45) b.vx += (b.x >= 0 ? 1 : -1) * 900 * blow * dt;   // 천장 근처에서는 옆으로 밀려난다
        if (b.y > R * 0.35 && ax >= JET) b.vx -= (b.x > 0 ? 1 : -1) * 700 * blow * dt; // 바닥에서는 가운데로 모인다
        b.vx += (Math.random() - 0.5) * 900 * blow * dt;
        b.vy += (Math.random() - 0.5) * 500 * blow * dt;
      }
      var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy), cap = 520;
      if (sp > cap) { b.vx *= cap / sp; b.vy *= cap / sp; }
      if (blow === 0) { b.vx *= 0.992; b.vy *= 0.997; }
      b.x += b.vx * dt; b.y += b.vy * dt;
    }
    // 공끼리 충돌
    for (i = 0; i < n; i++) {
      var p = balls[i]; if (p.mode !== 'in') continue;
      for (j = i + 1; j < n; j++) {
        var q = balls[j]; if (q.mode !== 'in') continue;
        var dx = q.x - p.x, dy = q.y - p.y, d2 = dx * dx + dy * dy, min = BR * 2;
        if (d2 >= min * min || d2 === 0) continue;
        var d = Math.sqrt(d2), nx = dx / d, ny = dy / d, push = (min - d) / 2;
        p.x -= nx * push; p.y -= ny * push; q.x += nx * push; q.y += ny * push;
        var rel = (q.vx - p.vx) * nx + (q.vy - p.vy) * ny;
        if (rel < 0) {
          var imp = rel * 0.92;
          p.vx += nx * imp; p.vy += ny * imp; q.vx -= nx * imp; q.vy -= ny * imp;
        }
      }
    }
    // 통 벽
    var lim = R - BR, energy = 0;
    for (i = 0; i < n; i++) {
      b = balls[i]; if (b.mode === 'tube') continue;
      var dist = Math.sqrt(b.x * b.x + b.y * b.y);
      if (dist > lim) {
        var ux = b.x / dist, uy = b.y / dist, vn = b.vx * ux + b.vy * uy;
        b.x = ux * lim; b.y = uy * lim;
        if (vn > 0) { b.vx -= 1.75 * vn * ux; b.vy -= 1.75 * vn * uy; }
      }
      energy += b.vx * b.vx + b.vy * b.vy;
    }
    return energy / Math.max(1, n);
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // 받침대
    var baseTop = CY + R - 8;
    ctx.fillStyle = '#0d1430';
    ctx.beginPath(); ctx.moveTo(CX - 70, H); ctx.lineTo(CX + 70, H); ctx.lineTo(CX + 44, baseTop); ctx.lineTo(CX - 44, baseTop); ctx.closePath(); ctx.fill();

    // 출구 관 (통 바닥 → 아래 번호 칸)
    var tubeW = BR * 2 + 8;
    ctx.fillStyle = 'rgba(255,255,255,.07)';
    ctx.fillRect(CX - tubeW / 2, baseTop, tubeW, H - baseTop);
    ctx.strokeStyle = 'rgba(246,196,83,.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(CX - tubeW / 2, baseTop + 6); ctx.lineTo(CX - tubeW / 2, H);
    ctx.moveTo(CX + tubeW / 2, baseTop + 6); ctx.lineTo(CX + tubeW / 2, H); ctx.stroke();

    // 통 안쪽
    var glass = ctx.createRadialGradient(CX - 30, CY - 40, 10, CX, CY, R);
    glass.addColorStop(0, 'rgba(120,150,255,.16)'); glass.addColorStop(1, 'rgba(10,16,40,.55)');
    ctx.fillStyle = glass;
    ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI * 2); ctx.fill();

    // 공
    var s = BR * 2 + 2 / dpr;
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      ctx.drawImage(sprites[b.n], CX + b.x - s / 2, CY + b.y - s / 2, s, s);
    }

    // 유리 테두리와 반사광
    ctx.lineWidth = 3;
    var rim = ctx.createLinearGradient(CX - R, CY - R, CX + R, CY + R);
    rim.addColorStop(0, 'rgba(255,255,255,.55)'); rim.addColorStop(0.5, 'rgba(246,196,83,.5)'); rim.addColorStop(1, 'rgba(255,255,255,.12)');
    ctx.strokeStyle = rim;
    ctx.beginPath(); ctx.arc(CX, CY, R + 1.5, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(CX, CY, R - 12, Math.PI * 1.08, Math.PI * 1.36); ctx.stroke();
  }

  function frame(t) {
    if (!running) return;
    // 화면 갱신이 느려져도(절전·백그라운드) 실제 시간만큼 진행되도록 잘게 나눠 계산한다
    var elapsed = lastT ? Math.min(0.25, (t - lastT) / 1000) : 0.016;
    lastT = t;
    var steps = Math.max(1, Math.ceil(elapsed / 0.017)), dt = elapsed / steps, energy = 0;
    for (var s = 0; s < steps; s++) {
      if (job) advance(dt);
      energy = physics(dt);
      // 관을 다 올라간 공은 통에서 뺀다
      for (var i = balls.length - 1; i >= 0; i--) {
        if (balls[i].mode === 'tube' && balls[i].y > R + 44) {
          var out = balls.splice(i, 1)[0];
          if (job && job.current === out) emit();
        }
      }
    }
    render();
    if (!job && blow === 0) {
      quietFor = energy < 60 ? quietFor + dt : 0;
      if (quietFor > 0.6) { running = false; return; } // 공이 가라앉으면 그리기를 멈춘다(배터리 절약)
    }
    requestAnimationFrame(frame);
  }

  function emit() {
    var j = job, n = j.nums[j.i];
    j.current = null; j.i++; j.wait = j.i < j.nums.length ? 0.42 : 0.3;
    j.onBall(n, j.i - 1);
    if (navigator.vibrate) { try { navigator.vibrate(18); } catch (e) { /* 무시 */ } }
  }

  function advance(dt) {
    var j = job;
    if (j.current) {
      j.elapsed += dt;
      var b = j.current;
      if (b.mode === 'pick') {
        var dx = b.x, dy = b.y - EXIT_Y;
        if (dx * dx + dy * dy < 70 || j.elapsed > 1.4) { b.mode = 'tube'; b.vx = 0; b.vy = 140; }
      }
      return;
    }
    j.wait -= dt;
    if (j.wait > 0) return;
    if (j.i >= j.nums.length) {
      var done = j.onDone; job = null; blow = 0; done();
      return;
    }
    for (var k = 0; k < balls.length; k++) {
      if (balls[k].n === j.nums[j.i]) {
        j.current = balls.splice(k, 1)[0];
        j.current.mode = 'pick';
        balls.push(j.current);   // 맨 위에 그려지도록 맨 뒤로
        break;
      }
    }
    j.elapsed = 0;
    if (!j.current) emit(); // 통에 없는 번호면 바로 내보낸다
  }

  /* nums 를 순서대로 뽑는다. 공이 나올 때마다 onBall(번호, 순번), 끝나면 onDone(). */
  function draw(nums, onBall, onDone) {
    if (balls.length < 45) fill();
    var mine = job = { nums: nums.slice(), i: 0, current: null, wait: 1.25, elapsed: 0, onBall: onBall, onDone: onDone };
    blow = 1;
    kick();
    // 화면이 가려져 애니메이션이 멈춘 경우에도 결과는 반드시 나오게 한다
    setTimeout(function () { if (job === mine) skip(); }, 15000);
  }

  /* 남은 공을 연출 없이 한꺼번에 내보낸다. */
  function skip() {
    if (!job) return;
    var j = job; job = null; blow = 0;
    for (var i = j.i; i < j.nums.length; i++) {
      for (var k = balls.length - 1; k >= 0; k--) if (balls[k].n === j.nums[i]) balls.splice(k, 1);
      j.onBall(j.nums[i], i);
    }
    kick();
    j.onDone();
  }

  /* ---------- 색종이 ---------- */
  function confetti(el) {
    var c = el.getContext('2d'), w = el.width = window.innerWidth, h = el.height = window.innerHeight;
    var cols = ['#f6c453', '#ffe08a', '#ffffff', '#2f86e0', '#e5484d', '#3fa34d'], parts = [], start = 0;
    for (var i = 0; i < 120; i++) {
      var left = i % 2 === 0;
      parts.push({
        x: left ? -10 : w + 10, y: h * (0.25 + Math.random() * 0.3),
        vx: (left ? 1 : -1) * (180 + Math.random() * 420), vy: -(250 + Math.random() * 450),
        s: 5 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 14, col: cols[i % cols.length]
      });
    }
    function tick(t) {
      if (!start) start = t;
      var e = (t - start) / 1000, dt = 0.016;
      c.clearRect(0, 0, w, h);
      if (e > 2.4) return;
      c.globalAlpha = e > 1.7 ? Math.max(0, (2.4 - e) / 0.7) : 1;
      parts.forEach(function (p) {
        p.vy += 900 * dt; p.vx *= 0.985; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
        c.save(); c.translate(p.x, p.y); c.rotate(p.r);
        c.fillStyle = p.col; c.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.66);
        c.restore();
      });
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  window.Machine = { init: init, draw: draw, skip: skip, confetti: confetti, busy: function () { return !!job; } };
})();
