/* ============ NEURAL LINK · brain circuit visualizer ============ */
const BUILD = 'b9';

function reportProbe(extra) {
  const d = Object.assign({
    build: BUILD, ua: navigator.userAgent, vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio,
  }, extra);
  try { fetch('/_probe?d=' + encodeURIComponent(JSON.stringify(d)), { keepalive: true }); } catch (e) { /* offline */ }
}
window.addEventListener('error', ev => reportProbe({ err: (ev.message || 'error') + '@' + (ev.filename || '?') + ':' + (ev.lineno || 0) }));

(function () {
  const cvs = document.getElementById('c');
  const ctx = cvs.getContext('2d');
  const RMAP = new Map(REGIONS.map(r => [r.id, r]));
  const POS_SCALE = 1.15;
  REGIONS.forEach(r => { r.pos = r.pos.map(v => v * POS_SCALE); });
  const ekey = (a, b) => a + '|' + b;

  let W = 0, H = 0, DPR = 1;

  /* ---------- scene state ---------- */
  const cam = { yaw: -0.55, pitch: 0.36, dist: 560, zoom: 1, pan: [0, 0, 0], panT: [0, 0, 0] };

  const nodes = REGIONS.map(r => ({
    r, act: 0.06, actT: 0.06, pulse: 0, flash: 0,
    sx: 0, sy: 0, sr: 0, sz: 0, vis: false,
  }));
  const nById = new Map(nodes.map(n => [n.r.id, n]));

  const edges = EDGES.map(([a, b, dir]) => ({
    a, b, dir, w: 0.05, wT: 0.05, boost: 0,
    pts: [], parts: [], key: a + '|' + b,
  }));
  const eByPair = new Map();
  edges.forEach(e => { eByPair.set(e.a + '|' + e.b, e); eByPair.set(e.b + '|' + e.a, e); });

  const dust = [];
  const cloud = [];
  const HOLO = [104, 160, 255];
  const HOLO_FILL = Array.from({ length: 32 }, (_, i) => 'rgba(' + HOLO[0] + ',' + HOLO[1] + ',' + HOLO[2] + ',' + (i / 31).toFixed(3) + ')');
  const SHELL = { A: 58, B: 52, C: 76, c: [0, 3, -4] };

  const S = {
    id: 'dependence',
    sc: SCENARIOS.dependence,
    stage: 0,
    elapsed: 0,
    playing: true,
    speed: 1,
    autoRotate: true,
    labels: true,
    hover: null,
    selected: null,
    chem: { DA: 0, '5HT': 0, OT: 0, COR: 0 },
    chemT: { DA: 0, '5HT': 0, OT: 0, COR: 0 },
    accent: hex2rgb(SCENARIOS.dependence.accent),
    accent2: hex2rgb(SCENARIOS.dependence.accent2),
    accentT: hex2rgb(SCENARIOS.dependence.accent),
    accent2T: hex2rgb(SCENARIOS.dependence.accent2),
  };

  function hex2rgb(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  function rgba(c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')'; }
  function mixRGB(c1, c2, t) {
    return [c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t];
  }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* seeded noise for the point cloud */
  let seed = 20261012;
  function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

  const CD = (window.innerWidth < 720 || (window.devicePixelRatio || 1) > 2) ? 0.4 : 1;
  function buildCloud() {
    cloud.length = 0;
    const A = SHELL.A, B = SHELL.B, C = SHELL.C, cx = SHELL.c[0], cy = SHELL.c[1], cz = SHELL.c[2];
    for (let i = 0; i < 1500 * CD; i++) {
      const u = rnd() * Math.PI * 2, v = Math.acos(2 * rnd() - 1);
      const k = 0.9 + rnd() * 0.1;
      cloud.push([cx + A * Math.sin(v) * Math.cos(u) * k, cy + B * Math.cos(v) * k * 0.92, cz + C * Math.sin(v) * Math.sin(u) * k, 1]);
    }
    for (let i = 0; i < 420 * CD; i++) {
      const u = rnd() * Math.PI * 2, v = Math.acos(2 * rnd() - 1), k = 0.35 + rnd() * 0.5;
      cloud.push([cx + A * Math.sin(v) * Math.cos(u) * k, cy + B * Math.cos(v) * k, cz + C * Math.sin(v) * Math.sin(u) * k, 0.5]);
    }
    dust.length = 0;
    for (let i = 0; i < 150 * CD; i++) {
      dust.push([(rnd() - 0.5) * 900, (rnd() - 0.5) * 620, (rnd() - 0.5) * 700, rnd()]);
    }
  }
  buildCloud();

  /* ---------- projection ---------- */
  function toView(p, out) {
    let x = p[0] - cam.pan[0], y = p[1] - cam.pan[1], z = p[2] - cam.pan[2];
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    let X = x * cy + z * sy, Z = -x * sy + z * cy;
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    let Y = y * cp - Z * sp; Z = y * sp + Z * cp;
    out[0] = X; out[1] = Y; out[2] = Z;
    return out;
  }
  const _v = [0, 0, 0];
  function project(p, ox, oy) {
    toView(p, _v);
    const f = cam.dist / Math.max(60, cam.dist - _v[2]);
    const sc = f * cam.zoom * (Math.min(W, H * 1.15) / 250);
    return { x: ox + _v[0] * sc, y: oy - _v[1] * sc, s: f * cam.zoom, z: _v[2], sc: sc };
  }

  /* curved edge sampling (bow outward from brain centre) */
  function edgePoint(e, t, out) {
    const a = RMAP.get(e.a).pos, b = RMAP.get(e.b).pos;
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, mz = (a[2] + b[2]) / 2;
    const dx = mx - SHELL.c[0], dy = my - SHELL.c[1], dz = mz - SHELL.c[2];
    const L = Math.hypot(dx, dy, dz) || 1;
    const dist = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const bow = dist * 0.17;
    const cxp = mx + dx / L * bow, cyp = my + dy / L * bow, czp = mz + dz / L * bow;
    const it = 1 - t;
    out[0] = it * it * a[0] + 2 * it * t * cxp + t * t * b[0];
    out[1] = it * it * a[1] + 2 * it * t * cyp + t * t * b[1];
    out[2] = it * it * a[2] + 2 * it * t * czp + t * t * b[2];
    return out;
  }
  const _p = [0, 0, 0];

  /* ---------- scenario picker ---------- */
  const SC_KEYS = Object.keys(SCENARIOS);

  function buildScenarioPicker() {
    const nav = document.getElementById('scenarios');
    SC_KEYS.forEach(id => {
      const sc = SCENARIOS[id];
      const b = document.createElement('button');
      b.className = 'sc'; b.dataset.id = id; b.setAttribute('role', 'tab');
      b.innerHTML = '<span class="sc-idx">' + sc.tag.slice(-2) + '</span>' +
        '<span class="sc-name">' + sc.title.split('：')[0] + '</span>' +
        '<span class="sc-sub">' + sc.sub + '</span>';
      nav.appendChild(b);
    });

    const byGroup = new Map();
    SC_KEYS.forEach(id => {
      const g = SCENARIOS[id].group || '其他';
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g).push(id);
    });
    const all = document.getElementById('scAll');
    byGroup.forEach((list, g) => {
      const og = document.createElement('optgroup');
      og.label = g + ' · ' + list.length;
      list.forEach(id => {
        const o = document.createElement('option');
        o.value = id;
        o.textContent = SCENARIOS[id].tag + ' ' + SCENARIOS[id].title;
        og.appendChild(o);
      });
      all.appendChild(og);
    });
  }

  /* ---------- scenario application ---------- */
  function applyScenario(id, first) {
    const sc = SCENARIOS[id];
    S.id = id; S.sc = sc;
    S.accentT = hex2rgb(sc.accent); S.accent2T = hex2rgb(sc.accent2);
    document.documentElement.style.setProperty('--accent', sc.accent);
    document.documentElement.style.setProperty('--accent2', sc.accent2);

    nodes.forEach(n => { n.actT = (sc.nodes[n.r.id] != null ? sc.nodes[n.r.id] : 0.06); });
    edges.forEach(e => {
      const k = ekey(e.a, e.b), k2 = ekey(e.b, e.a);
      const w = sc.edges[k] != null ? sc.edges[k] : (sc.edges[k2] != null ? sc.edges[k2] : 0.05);
      e.wT = w;
    });

    document.querySelectorAll('.sc').forEach(b => b.classList.toggle('on', b.dataset.id === id));
    const on = document.querySelector('.sc.on');
    if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    document.getElementById('scAll').value = id;
    document.getElementById('thesis').textContent = sc.thesis;
    document.getElementById('scTag').textContent = sc.tag + ' · ' + sc.title + ' · ' + BUILD;
    document.getElementById('nodeCount').textContent = REGIONS.length + ' NODES / ' + EDGES.length + ' PATHS';
    renderChips('mainPath', sc.mainPath);
    buildStages();
    buildChems();
    buildRank();
    buildWave();
    buildScrub();
    setStage(0, true);
    if (!first) closeDetail();
  }

  /* ---------- live activity ranking ---------- */
  let rankRows = [];
  function buildRank() {
    const box = document.getElementById('rank');
    box.innerHTML = '';
    rankRows = nodes.slice()
      .sort((a, b) => b.actT - a.actT).slice(0, 8)
      .map(n => {
        const el = document.createElement('div');
        el.className = 'rk';
        el.innerHTML = '<b>' + n.r.name + '</b><span class="rk-bar"><i></i></span><em>0%</em>';
        el.addEventListener('click', () => openDetail(n));
        box.appendChild(el);
        return { n, el, bar: el.querySelector('i'), val: el.querySelector('em') };
      });
  }
  function updateRank() {
    rankRows.forEach(r => {
      const p = Math.round(r.n.act * 100);
      r.bar.style.width = p + '%';
      r.val.textContent = p + '%';
      r.el.classList.toggle('sel', S.selected === r.n);
    });
  }

  /* ---------- stages ---------- */
  function buildStages() {
    const box = document.getElementById('stages');
    box.innerHTML = '';
    S.sc.stages.forEach((st, i) => {
      const card = document.createElement('div');
      card.className = 'stage-card';
      card.innerHTML =
        '<div class="sc-h"><span class="sc-no">' + String(i + 1).padStart(2, '0') + '</span>' +
        '<span class="sc-t">' + st.name + '</span><span class="sc-time">' + st.time + '</span></div>' +
        '<div class="sc-body">' +
        '<div class="sc-block mech"><h6>NEURAL MECHANISM</h6><p>' + st.mech + '</p></div>' +
        '<div class="sc-block exp"><h6>SUBJECTIVE EXPERIENCE</h6><p>' + st.exp + '</p></div>' +
        '<div class="sc-chain" data-chain="' + i + '"></div>' +
        '</div>';
      card.addEventListener('click', () => { setStage(i, true); S.playing = false; syncPlayBtn(); });
      box.appendChild(card);
      renderChips(box.querySelector('[data-chain="' + i + '"]'), st.focus.map(k => RMAP.get(k).name));
    });
  }

  function renderChips(el, items) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (!el) return;
    el.innerHTML = '';
    items.forEach((t, i) => {
      if (i) { const a = document.createElement('span'); a.className = 'chip arrow'; a.textContent = '▸'; el.appendChild(a); }
      const c = document.createElement('span'); c.className = 'chip'; c.textContent = t; el.appendChild(c);
    });
  }

  function setStage(i, manual) {
    const n = S.sc.stages.length;
    S.stage = ((i % n) + n) % n;
    S.elapsed = 0;
    const st = S.sc.stages[S.stage];

    nodes.forEach(nd => { nd.flash = st.focus.indexOf(nd.r.id) >= 0 ? 1 : 0; });
    edges.forEach(e => { e.boost = 0; });
    st.flows.forEach(f => {
      const e = eByPair.get(f[0] + '|' + f[1]);
      if (e) { e.boost = 1; burst(e); }
    });

    const cx = st.focus.reduce((s, k) => s + RMAP.get(k).pos[0], 0) / st.focus.length;
    const cy = st.focus.reduce((s, k) => s + RMAP.get(k).pos[1], 0) / st.focus.length;
    const cz = st.focus.reduce((s, k) => s + RMAP.get(k).pos[2], 0) / st.focus.length;
    cam.panT = [cx * 0.5, cy * 0.5, cz * 0.5];

    const ch = st.chem || S.sc.chem;
    Object.keys(S.chemT).forEach(k => { S.chemT[k] = ch[k] != null ? ch[k] : (S.sc.chem[k] || 0); });

    document.querySelectorAll('.stage-card').forEach((c, j) => {
      const on = j === S.stage;
      c.classList.toggle('on', on);
      if (on && manual) c.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    updateChems();
    refreshScrub();
    if (S.selected) openDetail(S.selected, true);
  }

  function burst(e) {
    for (let i = 0; i < 9; i++) {
      e.parts.push({ t: -i * 0.07, sp: 0.55 + Math.random() * 0.35, sz: 2.6, b: 1 });
    }
  }

  /* ---------- chemicals ---------- */
  function buildChems() {
    const box = document.getElementById('chems');
    box.innerHTML = '';
    CHEM_META.forEach(m => {
      const d = document.createElement('div');
      d.className = 'chem';
      d.dataset.id = m.id;
      d.innerHTML =
        '<div class="chem-h"><b>' + m.name + '</b><span>' + m.id + '</span><em class="chem-v" style="font-style:normal">+0.00</em></div>' +
        '<div class="chem-track"><i></i></div><div class="chem-sub">' + m.sub + '</div>';
      box.appendChild(d);
    });
  }
  function updateChems() {
    CHEM_META.forEach(m => {
      const el = document.querySelector('.chem[data-id="' + m.id + '"]');
      if (!el) return;
      const v = S.chem[m.id];
      const bar = el.querySelector('.chem-track i');
      const half = 50;
      const w = Math.abs(v) * half;
      const up = v >= 0;
      bar.style.left = up ? half + '%' : (half - w) + '%';
      bar.style.width = Math.max(1.5, w) + '%';
      bar.style.background = up
        ? 'linear-gradient(90deg,' + 'rgba(255,120,80,.5),' + 'rgba(255,170,90,1))'
        : 'linear-gradient(90deg,rgba(90,160,255,1),rgba(80,220,255,.55))';
      bar.style.boxShadow = '0 0 10px ' + (up ? 'rgba(255,160,80,.7)' : 'rgba(90,200,255,.6)');
      const lab = el.querySelector('.chem-v');
      lab.textContent = (up ? '+' : '') + v.toFixed(2);
      lab.style.color = up ? '#ffb066' : '#6fd8ff';
    });
  }

  /* ---------- wave curve ---------- */
  function buildWave() {
    const st = S.sc.stages, n = st.length, w = 320, h = 78, pad = 8;
    const pts = st.map((s, i) => [i / (n - 1) * (w - 12) + 6, h - pad - s.intensity * (h - pad * 2 - 4)]);
    let d = 'M' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += 'C' + c1[0].toFixed(1) + ',' + c1[1].toFixed(1) + ' ' + c2[0].toFixed(1) + ',' + c2[1].toFixed(1) + ' ' + p2[0].toFixed(1) + ',' + p2[1].toFixed(1);
    }
    document.getElementById('waveLine').setAttribute('d', d);
    document.getElementById('waveArea').setAttribute('d', d + 'L' + pts[n - 1][0].toFixed(1) + ',' + h + 'L' + pts[0][0].toFixed(1) + ',' + h + 'Z');
    S.wavePts = pts;
  }
  function updateWave() {
    const pts = S.wavePts; if (!pts || pts.length < 2) return;
    const n = pts.length;
    const f = (S.stage + Math.min(1, S.elapsed / S.sc.stages[S.stage].len)) / (n - 1);
    const x = f * (pts[1][0] - pts[0][0]);
    const i0 = Math.min(n - 2, Math.floor(f * (n - 1))), i1 = i0 + 1;
    const lt = f * (n - 1) - i0;
    const y = lerp(pts[i0][1], pts[i1][1], lt);
    const dot = document.getElementById('waveDot');
    dot.setAttribute('cx', x.toFixed(1)); dot.setAttribute('cy', y.toFixed(1));
  }

  /* ---------- scrub ---------- */
  function buildScrub() {
    const box = document.getElementById('scrub');
    box.innerHTML = '';
    S.sc.stages.forEach((st, i) => {
      const seg = document.createElement('div');
      seg.className = 'seg';
      seg.innerHTML = '<i></i>';
      seg.title = st.name;
      seg.addEventListener('click', () => { setStage(i, true); S.playing = false; syncPlayBtn(); });
      box.appendChild(seg);
    });
  }
  function refreshScrub() {
    const segs = document.querySelectorAll('#scrub .seg');
    segs.forEach((s, i) => {
      s.classList.toggle('done', i < S.stage);
      s.querySelector('i').style.width = i < S.stage ? '100%' : (i === S.stage ? '0%' : '0%');
    });
    const st = S.sc.stages[S.stage];
    document.getElementById('scrubName').textContent = 'STAGE ' + String(S.stage + 1).padStart(2, '0') + ' · ' + st.name;
    document.getElementById('scrubTime').textContent = st.time;
  }

  /* ---------- node detail ---------- */
  function openDetail(n, keep) {
    S.selected = n;
    const box = document.getElementById('detail');
    const leg = document.getElementById('legend');
    leg.classList.add('hidden');
    box.classList.remove('hidden');
    const r = n.r;
    const act = Math.round(n.actT * 100);
    const stageHits = S.sc.stages.map((s, i) => s.focus.indexOf(r.id) >= 0 ? (i + 1) : 0).filter(Boolean);
    const links = edges.filter(e => e.a === r.id || e.b === r.id)
      .sort((a, b) => b.wT - a.wT).slice(0, 5)
      .map(e => {
        const other = e.a === r.id ? e.b : e.a;
        const dirTxt = e.a === r.id ? (e.dir === 'back' ? '←' : '→') : (e.dir === 'fwd' ? '←' : '⇄');
        return '<li><b>' + RMAP.get(other).name + '</b><span>' + dirTxt + '</span><em>' + Math.round(e.wT * 100) + '%</em></li>';
      }).join('');
    const level = act >= 75 ? '关键节点' : act >= 50 ? '主要参与' : act >= 30 ? '次要参与' : '低参与 / 功能受抑';
    box.innerHTML =
      '<div class="d-top"><div><div class="d-name">' + r.name + '</div><div class="d-en">' + r.en + '</div></div>' +
      '<button class="d-close" title="关闭">×</button></div>' +
      '<div class="meter"><div class="meter-lb"><span>场景参与度</span><span>' + act + '% · ' + level + '</span></div>' +
      '<div class="meter-bar"><i style="width:' + act + '%"></i></div></div>' +
      '<div class="d-sec"><h5>FUNCTION 基础功能</h5>' + r.fn + '</div>' +
      '<div class="d-sec role"><h5>IN THIS SCENARIO 本场景角色</h5>' +
      (stageHits.length ? '被以下阶段直接调用：第 ' + stageHits.join('、') + ' 阶段。' : '在本场景中作为背景网络参与，不构成关键节点。') +
      '</div>' +
      '<div class="d-sec"><h5>TOP LINKS 主要通路</h5><ul class="linklist">' + links + '</ul></div>';
    box.querySelector('.d-close').addEventListener('click', closeDetail);
    if (!keep) box.scrollTop = 0;
    if (isMobile()) setSheet(true);
  }
  function closeDetail() {
    S.selected = null;
    document.getElementById('detail').classList.add('hidden');
    document.getElementById('detail').innerHTML = '';
    document.getElementById('legend').classList.remove('hidden');
    if (isMobile()) setSheet(false);
  }

  /* ---------- render loop ---------- */
  let last = performance.now(), T = 0, sweep = 0, rankTick = 0, loopErr = null;

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; T += dt;
    try {
      step(dt);
      draw();
    } catch (err) {
      if (!loopErr) {
        loopErr = err;
        reportProbe({ ev: 'looperr', msg: String((err && err.message) || err) });
      }
    }
  }

  function step(dt) {
    /* interpolate */
    const k = 1 - Math.pow(0.0025, dt);
    nodes.forEach(n => { n.act = lerp(n.act, n.actT, k); n.pulse = Math.max(0, n.pulse - dt * 1.6); n.flash = Math.max(0, n.flash - dt * 0.55); });
    edges.forEach(e => { e.w = lerp(e.w, e.wT, k); e.boost = Math.max(0, e.boost - dt * 0.35); });
    S.accent = mixRGB(S.accent, S.accentT, k * 0.7);
    S.accent2 = mixRGB(S.accent2, S.accent2T, k * 0.7);
    Object.keys(S.chem).forEach(c => { S.chem[c] = lerp(S.chem[c], S.chemT[c], 1 - Math.pow(0.02, dt)); });
    updateChems();
    rankTick += dt;
    if (rankTick > 0.25) { rankTick = 0; updateRank(); }
    for (let i = 0; i < 3; i++) cam.pan[i] = lerp(cam.pan[i], cam.panT[i], 1 - Math.pow(0.05, dt));
    if (S.autoRotate && !drag.on) cam.yaw += dt * 0.075;

    /* stage clock */
    if (S.playing) {
      S.elapsed += dt * S.speed;
      const st = S.sc.stages[S.stage];
      if (S.elapsed >= st.len) setStage(S.stage + 1, true);
    }
    const frac = Math.min(1, S.elapsed / S.sc.stages[S.stage].len);
    const seg = document.querySelectorAll('#scrub .seg')[S.stage];
    if (seg) seg.querySelector('i').style.width = (frac * 100).toFixed(1) + '%';
    updateWave();

    /* particles */
    sweep = (sweep + dt * 0.12) % 1;
    edges.forEach(e => {
      const rate = (e.w * 0.9 + e.boost * 0.5) * 3.2;
      e.acc = (e.acc || 0) + dt * rate;
      while (e.acc > 1) {
        e.acc -= 1;
        e.parts.push({ t: 0, sp: 0.28 + Math.random() * 0.3, sz: 1.3 + e.w * 1.7, b: e.boost > 0.3 ? 1 : 0 });
      }
      for (let i = e.parts.length - 1; i >= 0; i--) {
        const p = e.parts[i];
        p.t += dt * p.sp * (p.b ? 1.5 : 1);
        if (p.t > 1.05) e.parts.splice(i, 1);
      }
      if (e.parts.length > 26) e.parts.splice(0, e.parts.length - 26);
    });

    /* random neural jitter flashes on strong nodes */
    nodes.forEach(n => { if (n.actT > 0.6 && Math.random() < dt * 0.35) n.pulse = 1; });
  }

  function draw() {
    const ox = W / 2, oy = H / 2;
    ctx.clearRect(0, 0, W, H);
    bg(ox, oy);

    /* point-cloud hologram */
    ctx.save();
    for (let i = 0; i < cloud.length; i++) {
      const q = project(cloud[i], ox, oy);
      const d = Math.max(0, Math.min(1, (q.z + 260) / 520));
      const a = (0.07 + d * d * 0.55) * cloud[i][3];
      ctx.fillStyle = HOLO_FILL[Math.min(31, (a * 31) | 0)];
      const s = (0.8 + d * 1.5) * q.s;
      ctx.fillRect(q.x, q.y, s, s);
    }
    /* shell rings */
    ctx.strokeStyle = rgba(HOLO, 0.16); ctx.lineWidth = 1;
    ring(ox, oy, SHELL.A * 1.02, SHELL.B * 1.02, 0);
    ring(ox, oy, SHELL.A * 0.78, SHELL.B * 0.95, 34);
    ctx.strokeStyle = rgba(HOLO, 0.13);
    meridian(ox, oy, SHELL.A * 1.0, SHELL.C * 1.0, 0);
    meridian(ox, oy, SHELL.A * 1.0, SHELL.C * 1.0, 90);
    ctx.restore();

    /* project nodes */
    nodes.forEach(n => {
      const q = project(n.r.pos, ox, oy);
      n.sx = q.x; n.sy = q.y; n.sz = q.z; n.ss = q.s;
      n.sr = (n.r.base * (0.45 + n.act * 0.95)) * q.s * 0.5;
      n.vis = true;
    });

    const order = nodes.slice().sort((a, b) => a.sz - b.sz);

    /* edges (far to near) */
    edges.slice().sort((a, b) => depth(a) - depth(b)).forEach(e => drawEdge(e, ox, oy));

    /* nodes */
    order.forEach(n => drawNode(n));

    /* labels */
    if (S.labels) drawLabels(order);

    /* scan sweep */
    const sy = sweep * H;
    const g = ctx.createLinearGradient(0, sy - 60, 0, sy + 60);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, rgba(S.accent, 0.05));
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, sy - 60, W, 120);
  }

  function depth(e) {
    const a = nById.get(e.a), b = nById.get(e.b);
    return (a.sz + b.sz) / 2;
  }

  function ring(ox, oy, ra, rb, latDeg) {
    const yy = SHELL.c[1] + Math.sin(latDeg * Math.PI / 180) * SHELL.B * 0.62;
    const kk = Math.cos(latDeg * Math.PI / 180);
    ctx.beginPath();
    for (let i = 0; i <= 64; i++) {
      const a = i / 64 * Math.PI * 2;
      const p = project([SHELL.c[0] + ra * kk * Math.cos(a), yy, SHELL.c[2] + rc(ra, kk) * Math.sin(a)], ox, oy);
      i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
    }
    ctx.stroke();
  }
  function rc(r, kk) { return r * kk * (SHELL.C / SHELL.A); }

  function meridian(ox, oy, ra, rcx, lonDeg) {
    const a0 = lonDeg * Math.PI / 180;
    ctx.beginPath();
    for (let i = 0; i <= 64; i++) {
      const v = -Math.PI / 2 + i / 64 * Math.PI;
      const p = project([
        SHELL.c[0] + ra * Math.cos(v) * Math.cos(a0),
        SHELL.c[1] + SHELL.B * Math.sin(v),
        SHELL.c[2] + rcx * Math.cos(v) * Math.sin(a0),
      ], ox, oy);
      i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
    }
    ctx.stroke();
  }

  function drawEdge(e, ox, oy) {
    const a = nById.get(e.a), b = nById.get(e.b);
    const rel = S.selected && (e.a === S.selected.r.id || e.b === S.selected.r.id);
    const dim = S.selected && !rel ? 0.32 : 1;
    const w = Math.max(0.02, e.w + e.boost * 0.6);
    const cc = mixRGB(S.accent2, S.accent, Math.min(1, w));
    const near = Math.max(a.sz, b.sz);
    const depthA = 0.35 + Math.max(0, Math.min(1, (near + 220) / 460)) * 0.65;

    ctx.beginPath();
    let first = true;
    for (let i = 0; i <= 18; i++) {
      edgePoint(e, i / 18, _p);
      const q = project(_p, ox, oy);
      if (first) { ctx.moveTo(q.x, q.y); first = false; } else ctx.lineTo(q.x, q.y);
    }
    ctx.lineWidth = 0.6 + w * 1.7;
    ctx.strokeStyle = rgba(cc, (0.05 + w * 0.34) * depthA * dim);
    ctx.stroke();

    if (w > 0.18) {
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = rgba([255, 255, 255], 0.05 * w * dim);
      ctx.stroke();
    }

    /* particles */
    e.parts.forEach(p => {
      if (p.t < 0) return;
      const t = e.dir === 'back' ? 1 - p.t : p.t;
      edgePoint(e, Math.min(1, Math.max(0, t)), _p);
      const q = project(_p, ox, oy);
      const size = (p.sz + (p.b ? 1.1 : 0)) * q.s;
      const alpha = (0.35 + w * 0.65) * depthA * dim * (p.b ? 1 : 0.9);
      const gg = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, size * 4.5);
      gg.addColorStop(0, rgba([255, 255, 255], Math.min(1, alpha * 1.5)));
      gg.addColorStop(0.35, rgba(cc, alpha));
      gg.addColorStop(1, rgba(cc, 0));
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(q.x, q.y, size * 4.5, 0, 6.2832); ctx.fill();
    });
  }

  function drawNode(n) {
    const act = n.act, c = mixRGB(S.accent2, S.accent, Math.min(1, act * 1.15));
    const isSel = S.selected === n, isHov = S.hover === n;
    const dim = S.selected && !isSel && !connected(S.selected, n) ? 0.4 : 1;
    const r = Math.max(2.2, n.sr);
    const glow = (0.06 + act * 0.42 + n.flash * 0.35 + n.pulse * 0.28) * dim;

    /* halo */
    const g = ctx.createRadialGradient(n.sx, n.sy, r * 0.6, n.sx, n.sy, r * 2.7);
    g.addColorStop(0, rgba(c, Math.min(0.42, glow)));
    g.addColorStop(0.5, rgba(c, glow * 0.18));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(n.sx, n.sy, r * 2.7, 0, 6.2832); ctx.fill();

    /* core */
    ctx.beginPath(); ctx.arc(n.sx, n.sy, r, 0, 6.2832);
    ctx.fillStyle = rgba(mixRGB([10, 16, 30], c, 0.35 + act * 0.6), 0.92 * dim);
    ctx.fill();
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = rgba(mixRGB(c, [255, 255, 255], 0.35 + act * 0.4), (0.5 + act * 0.5) * dim);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(n.sx - r * 0.2, n.sy - r * 0.22, r * 0.34, 0, 6.2832);
    ctx.fillStyle = rgba([255, 255, 255], (0.1 + act * 0.4 + n.flash * 0.3) * dim);
    ctx.fill();

    if (act > 0.4 || isSel || isHov) {
      const rr = r + 4 + (1 - act) * 6 + Math.sin(T * 2 + r) * 1.2;
      ctx.beginPath(); ctx.arc(n.sx, n.sy, rr, 0, 6.2832);
      ctx.lineWidth = 1; ctx.strokeStyle = rgba(c, (0.16 + act * 0.32) * dim);
      ctx.setLineDash([2.4, 3.4]); ctx.lineDashOffset = -T * 12; ctx.stroke(); ctx.setLineDash([]);
    }

    if (n.pulse > 0.02) {
      const pr = r + (1 - n.pulse) * 34;
      ctx.beginPath(); ctx.arc(n.sx, n.sy, pr, 0, 6.2832);
      ctx.strokeStyle = rgba(c, n.pulse * 0.5); ctx.lineWidth = 1.4; ctx.stroke();
    }
    if (n.flash > 0.02) {
      ctx.beginPath(); ctx.arc(n.sx, n.sy, r + 8 + (1 - n.flash) * 26, 0, 6.2832);
      ctx.strokeStyle = rgba([255, 255, 255], n.flash * 0.35); ctx.lineWidth = 1.2; ctx.stroke();
    }

    if (isSel) {
      const s = r + 13;
      ctx.strokeStyle = rgba(c, 0.95); ctx.lineWidth = 1.3;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([dx, dy]) => {
        ctx.beginPath();
        ctx.moveTo(n.sx + dx * s, n.sy + dy * s - dy * 6);
        ctx.lineTo(n.sx + dx * s, n.sy + dy * s);
        ctx.lineTo(n.sx + dx * s - dx * 6, n.sy + dy * s);
        ctx.stroke();
      });
    }
  }

  function connected(a, b) {
    return edges.some(e => (e.a === a.r.id && e.b === b.r.id) || (e.b === a.r.id && e.a === b.r.id));
  }

  const FONTS = {
    mono: '11px "JetBrains Mono", Consolas, monospace',
    cn: '10px "PingFang SC", "Microsoft YaHei", sans-serif',
  };

  function drawLabels(order) {
    const st = S.sc.stages[S.stage];
    const maxLabels = W < 700 ? 6 : 15;
    const cands = order.filter(n => n.act > 0.5 || n === S.selected || n === S.hover || st.focus.indexOf(n.r.id) >= 0)
      .sort((a, b) => (b.sz - a.sz) || (b.act - a.act)).slice(0, maxLabels);
    const placed = [];
    cands.forEach(n => {
      const strong = n === S.selected || n === S.hover || st.focus.indexOf(n.r.id) >= 0;
      const a = (strong ? 0.95 : 0.38 + (n.act - 0.5) * 0.8);
      if (a <= 0.12) return;
      const ccx = W / 2, ccy = H / 2;
      let dx = n.sx - ccx, dy = n.sy - ccy;
      const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      const right = dx >= 0;
      const ax = n.sx + dx * (n.sr + 26), ay = n.sy + dy * (n.sr + 26);
      const lx = right ? ax + 9 : ax - 9;
      const ly = ay - 1;
      ctx.font = FONTS.mono; const w1 = ctx.measureText(n.r.en).width;
      ctx.font = FONTS.cn; const w2 = ctx.measureText(n.r.name).width;
      const bw = Math.max(w1, w2);
      const box = right ? [lx - 2, ly - 12, lx + bw + 2, ly + 14] : [lx - bw - 2, ly - 12, lx + 2, ly + 14];
      const hit = placed.some(p => !(box[2] < p[0] || box[0] > p[2] || box[3] < p[1] || box[1] > p[3]));
      if (hit && !strong) return;
      placed.push(box);
      const c = mixRGB(S.accent2, S.accent, Math.min(1, n.act * 1.2));
      ctx.strokeStyle = rgba(c, a * (hit ? 0.7 : 0.42)); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(n.sx + dx * n.sr, n.sy + dy * n.sr); ctx.lineTo(ax, ay); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ax, ay); ctx.lineTo(lx + (right ? -2 : 2), ay);
      ctx.stroke();
      ctx.textAlign = right ? 'left' : 'right';
      ctx.fillStyle = rgba(strong ? [255, 255, 255] : c, a);
      ctx.font = FONTS.mono;
      ctx.fillText(n.r.en, lx, ly);
      ctx.fillStyle = rgba(c, a * 0.72);
      ctx.font = FONTS.cn;
      ctx.fillText(n.r.name, lx, ly + 12);
    });
    ctx.textAlign = 'left';
  }

  function bg(ox, oy) {
    /* grid */
    ctx.save();
    ctx.strokeStyle = 'rgba(90,140,220,.05)'; ctx.lineWidth = 1;
    const gs = 46;
    const off = (T * 5) % gs;
    for (let x = -gs + off; x < W + gs; x += gs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = -gs + off; y < H + gs; y += gs) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    /* dust */
    dust.forEach(d => {
      const q = project(d.slice(0, 3), ox, oy);
      ctx.fillStyle = rgba(S.accent, 0.06 + d[3] * 0.16);
      ctx.fillRect(q.x, q.y, q.s * 1.4, q.s * 1.4);
    });

    /* radar circle */
    ctx.strokeStyle = rgba(S.accent, 0.07);
    ctx.beginPath(); ctx.arc(ox, oy, Math.min(W, H) * 0.44 * cam.zoom, 0, 6.2832); ctx.stroke();
    ctx.beginPath(); ctx.arc(ox, oy, Math.min(W, H) * 0.31 * cam.zoom, 0, 6.2832); ctx.stroke();
    const ang = T * 0.5;
    ctx.save();
    ctx.translate(ox, oy); ctx.rotate(ang);
    const rr = Math.min(W, H) * 0.44 * cam.zoom;
    const lg = ctx.createLinearGradient(0, 0, rr, 0);
    lg.addColorStop(0, rgba(S.accent, 0.16)); lg.addColorStop(1, rgba(S.accent, 0));
    ctx.strokeStyle = lg; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(rr, 0); ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  /* ---------- interaction ---------- */
  const drag = { on: false, x: 0, y: 0, moved: 0 };
  const tips = new Map();
  let pinchDist = 0;
  const tip = document.getElementById('tip');
  const isMobile = () => window.matchMedia('(max-width: 860px)').matches;

  function pick(mx, my) {
    let best = null, bd = 1e9;
    nodes.forEach(n => {
      const d = Math.hypot(mx - n.sx, my - n.sy);
      const rr = Math.max(11, n.sr + 6);
      if (d < rr && d < bd) { bd = d; best = n; }
    });
    return best;
  }

  cvs.addEventListener('pointerdown', ev => {
    tips.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (tips.size === 2) { drag.on = false; pinchDist = pinchSpan(); return; }
    drag.on = true; drag.x = ev.clientX; drag.y = ev.clientY; drag.moved = 0;
    cvs.classList.add('grab'); cvs.setPointerCapture(ev.pointerId);
  });
  cvs.addEventListener('pointermove', ev => {
    if (tips.has(ev.pointerId)) tips.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (tips.size === 2) {
      const s = pinchSpan();
      if (pinchDist) cam.zoom = Math.max(0.5, Math.min(2.4, cam.zoom * (s / pinchDist)));
      pinchDist = s;
      tip.classList.remove('on');
      return;
    }
    const rect = cvs.getBoundingClientRect();
    const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
    if (drag.on) {
      const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      cam.yaw += dx * 0.006; cam.pitch = Math.max(-1.25, Math.min(1.25, cam.pitch + dy * 0.005));
      drag.x = ev.clientX; drag.y = ev.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
      tip.classList.remove('on');
      return;
    }
    if (ev.pointerType === 'touch') return;
    const n = pick(mx, my);
    S.hover = n;
    cvs.style.cursor = n ? 'pointer' : 'default';
    if (n) {
      tip.innerHTML = '<b>' + n.r.name + '</b><i>' + n.r.en + ' · 参与度 ' + Math.round(n.act * 100) + '%</i><p>' + n.r.fn + '</p>';
      tip.style.left = Math.min(window.innerWidth - 285, ev.clientX + 16) + 'px';
      tip.style.top = (ev.clientY + 16) + 'px';
      tip.classList.add('on');
    } else tip.classList.remove('on');
  });
  function endPointer(ev) {
    const wasPinch = tips.size === 2;
    tips.delete(ev.pointerId);
    if (tips.size < 2) pinchDist = 0;
    if (wasPinch) return;
    const rect = cvs.getBoundingClientRect();
    const moved = drag.on ? drag.moved : 99;
    drag.on = false; cvs.classList.remove('grab');
    if (moved < 8) {
      const n = pick(ev.clientX - rect.left, ev.clientY - rect.top);
      if (n) openDetail(n); else if (!isMobile()) closeDetail();
    }
  }
  function pinchSpan() {
    const [a, b] = [...tips.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  cvs.addEventListener('pointerup', endPointer);
  cvs.addEventListener('pointercancel', endPointer);
  cvs.addEventListener('pointerleave', ev => { tips.delete(ev.pointerId); S.hover = null; tip.classList.remove('on'); });
  cvs.addEventListener('wheel', ev => {
    ev.preventDefault();
    cam.zoom = Math.max(0.5, Math.min(2.4, cam.zoom * (1 - ev.deltaY * 0.0011)));
  }, { passive: false });

  document.getElementById('scenarios').addEventListener('click', ev => {
    const b = ev.target.closest('.sc'); if (b) applyScenario(b.dataset.id);
  });
  document.getElementById('scAll').addEventListener('change', ev => applyScenario(ev.target.value));

  /* mobile: 回路档案 sheet */
  const sheetBtn = document.getElementById('sheetToggle');
  const leftPanel = document.querySelector('.panel.left');
  function setSheet(open) {
    leftPanel.classList.toggle('open', open);
    sheetBtn.classList.toggle('on', open);
    sheetBtn.textContent = open ? '× 收起' : '◈ 档案';
    if (open) leftPanel.querySelector('.legend, .detail').scrollTop = 0;
  }
  sheetBtn.addEventListener('click', () => setSheet(!leftPanel.classList.contains('open')));

  const btnPlay = document.getElementById('btnPlay');
  function syncPlayBtn() {
    btnPlay.classList.toggle('primary', S.playing);
    btnPlay.querySelector('span').textContent = S.playing ? '自动推演' : '已暂停';
    btnPlay.querySelector('path').setAttribute('d', S.playing ? 'M4 3h3v10H4zM9 3h3v10H9z' : 'M4 3l9 5-9 5z');
  }
  btnPlay.addEventListener('click', () => { S.playing = !S.playing; syncPlayBtn(); });
  document.getElementById('btnPrev').addEventListener('click', () => { setStage(S.stage - 1, true); S.playing = false; syncPlayBtn(); });
  document.getElementById('btnNext').addEventListener('click', () => { setStage(S.stage + 1, true); S.playing = false; syncPlayBtn(); });
  const rotBtn = document.getElementById('btnRotate');
  rotBtn.addEventListener('click', () => { S.autoRotate = !S.autoRotate; rotBtn.classList.toggle('on', S.autoRotate); });
  const labBtn = document.getElementById('btnLabels');
  labBtn.addEventListener('click', () => { S.labels = !S.labels; labBtn.classList.toggle('on', S.labels); });
  document.getElementById('speed').addEventListener('change', ev => { S.speed = parseFloat(ev.target.value); });

  window.addEventListener('keydown', ev => {
    if (ev.key === ' ') { ev.preventDefault(); S.playing = !S.playing; syncPlayBtn(); }
    else if (ev.key === 'ArrowRight') { setStage(S.stage + 1, true); S.playing = false; syncPlayBtn(); }
    else if (ev.key === 'ArrowLeft') { setStage(S.stage - 1, true); S.playing = false; syncPlayBtn(); }
    else if (/^[1-9]$/.test(ev.key)) applyScenario(SC_KEYS[+ev.key - 1]);
    else if (ev.key === 'Escape') closeDetail();
  });

  /* ---------- size ---------- */
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    const r = cvs.getBoundingClientRect();
    W = r.width; H = r.height;
    cvs.width = W * DPR; cvs.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);

  /* ---------- boot ---------- */
  const logs = ['linking cortical map…', 'calibrating ' + REGIONS.length + ' nuclei…', 'loading scenario matrix…', 'neural link established'];
  let li = 0;
  const logTimer = setInterval(() => {
    li++; const el = document.getElementById('bootLog');
    if (el && logs[li]) el.textContent = logs[li];
    if (li >= logs.length) clearInterval(logTimer);
  }, 380);

  resize();
  if (window.matchMedia('(pointer: coarse)').matches) {
    document.getElementById('hint').textContent = '单指拖动旋转 · 双指缩放 · 点击核团查看通路 · 下方卡片切换阶段';
  }
  buildScenarioPicker();
  applyScenario('dependence', true);
  syncPlayBtn();
  requestAnimationFrame(frame);
  setTimeout(() => document.getElementById('boot').classList.add('done'), 1650);

  reportProbe({ ev: 'init', buf: cvs.width + 'x' + cvs.height, css: Math.round(W) + 'x' + Math.round(H) });
  let pT0 = null, pN = 0;
  (function countFps(t) {
    if (pT0 === null) pT0 = t;
    pN++;
    if (t - pT0 < 1200) return void requestAnimationFrame(countFps);
    reportProbe({ ev: 'fps', fps: +(pN / ((t - pT0) / 1000)).toFixed(1), vis: document.visibilityState });
  })(performance.now());
})();
