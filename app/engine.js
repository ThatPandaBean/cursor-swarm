import { AGENTS, COLS, fmt, pct } from './shared';

const STOP = Symbol('stop');
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const BUBBLE_MS = 1800;

const union = (a, b) => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

const ARROW = (c) =>
  `<svg viewBox="0 0 18 22"><path d="M2 1.5v16l4.2-3.8 2.9 6.6 2.7-1.2-2.9-6.5h5.9z" fill="${c}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`;

/*
 * Every visible change the agents make is an event: {t, k, ...}. Events are applied to the
 * DOM as they happen and also recorded, so the replay scrubber can rebuild any moment by
 * re-applying the log up to that time.
 */
export function createEngine({ root, styles, n }) {
  const q = (sel) => root.querySelector(sel);
  const stage = q('[data-role=stage]');
  const overlay = q('[data-role=overlay]');
  const chart = q('[data-role=chart]');
  const titleEl = q('[data-role=charttitle]');
  const bars = [...root.querySelectorAll('[data-role=bar]')];
  const fbRef = q('[data-role=fbref]');
  const fbText = q('[data-role=fbtext]');
  const logEl = q('[data-role=log]');
  const skipBtn = q('[data-role=skip]');
  const rebuildBtn = q('[data-role=rebuild]');
  const kC = q('[data-role=kC]');
  const kF = q('[data-role=kF]');
  const kCv = q('[data-role=kCv]');
  const kFv = q('[data-role=kFv]');
  const playBtn = q('[data-role=play]');
  const scrub = q('[data-role=scrub]');
  const clock = q('[data-role=clock]');
  const last = n + 1; // last item row
  const tot = n + 2; // totals row
  const rowsOf = (from = 2, to = last) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

  const animated = window.matchMedia('(scripting: enabled) and (prefers-reduced-motion: no-preference)').matches;

  // remember each cell's real value (rendered by the server) so we can hide and reveal it
  root.querySelectorAll('[data-v]').forEach((v) => {
    if (!v.dataset.final) v.dataset.final = v.textContent;
  });

  const cell = (ref) => stage.querySelector(`[data-cell="${ref}"]`);
  const val = (ref) => cell(ref).querySelector('[data-v]');
  const finalOf = (ref) => val(ref).dataset.final;
  const formulaOf = (ref) => cell(ref).dataset.f;
  const visible = (ref) => cell(ref).offsetParent !== null;
  const rel = (el) => {
    const s = stage.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height };
  };
  const allCells = () => [...stage.querySelectorAll('[data-cell]')];

  // ---- overlay: one cursor and one selection box per agent
  const ag = {};
  const created = [];
  for (const d of AGENTS) {
    const sel = document.createElement('div');
    sel.className = styles.sel;
    sel.style.setProperty('--c', d.color);
    sel.innerHTML = '<b></b><i></i>';
    sel.firstChild.textContent = d.name;
    const cur = document.createElement('div');
    cur.className = styles.cursor;
    cur.style.setProperty('--c', d.color);
    cur.innerHTML = ARROW(d.color) + '<span></span>';
    cur.lastChild.textContent = d.name;
    overlay.append(sel, cur);
    created.push(sel, cur);
    ag[d.id] = { ...d, sel, cur, x: 0, y: 0, face: q(`[data-agent=${d.id}]`) };
  }
  const meBox = document.createElement('div');
  meBox.className = styles.me;
  overlay.append(meBox);
  created.push(meBox);
  const hideMe = () => (meBox.dataset.on = '0');

  // ---- event log: the single way state changes
  let events = [];
  let applied = 0; // index of the next event not yet applied (used by replay)
  let t0 = 0;
  let replayAt = null; // set while replaying so old speech bubbles are skipped
  const now = () => performance.now() - t0;

  const setOn = (el, on) => (on ? (el.dataset.on = '') : el.removeAttribute('data-on'));

  const apply = (e) => {
    const a = e.id && ag[e.id];
    switch (e.k) {
      case 'cur':
        a.x = e.x;
        a.y = e.y;
        a.cur.style.transform = `translate(${e.x}px, ${e.y}px)`;
        break;
      case 'show':
        a.cur.dataset.show = e.v ? '1' : '0';
        break;
      case 'sel':
        Object.assign(a.sel.style, { left: `${e.r.x}px`, top: `${e.r.y}px`, width: `${e.r.w}px`, height: `${e.r.h}px` });
        a.sel.dataset.on = '1';
        a.cur.dataset.sel = '1';
        break;
      case 'selx':
        a.sel.dataset.on = '0';
        a.sel.dataset.handle = '0';
        a.sel.classList.remove(styles.drag, styles.dashed);
        a.cur.dataset.sel = '0';
        break;
      case 'mode':
        a.sel.classList.toggle(styles.drag, !!e.drag);
        a.sel.classList.toggle(styles.dashed, !!e.dashed);
        a.sel.dataset.handle = e.handle ? '1' : '0';
        break;
      case 'cell': {
        const c = cell(e.ref);
        if (e.on !== undefined) setOn(c, e.on);
        if (e.hot !== undefined) (e.hot ? (c.dataset.hot = '') : c.removeAttribute('data-hot'));
        if (e.text !== undefined) val(e.ref).textContent = e.text;
        break;
      }
      case 'fb':
        fbRef.textContent = e.ref;
        fbText.textContent = e.text;
        break;
      case 'chart':
        setOn(e.what === 'frame' ? chart : e.what === 'title' ? titleEl : bars[e.i], e.on);
        break;
      case 'ttext':
        titleEl.textContent = e.text;
        break;
      case 'work':
        a.face.dataset.working = e.v ? '1' : '0';
        break;
      case 'log': {
        const li = document.createElement('li');
        li.style.setProperty('--c', a ? a.color : '#888');
        const time = document.createElement('time');
        time.textContent = `${(e.t / 1000).toFixed(1)}s`;
        const dot = document.createElement('i');
        const msg = document.createElement('span');
        msg.textContent = a ? `${a.name} ${e.text}` : e.text;
        li.append(time, dot, msg);
        logEl.append(li);
        while (logEl.children.length > 120) logEl.firstChild.remove();
        logEl.scrollTop = logEl.scrollHeight;
        break;
      }
      case 'say': {
        if (replayAt !== null && replayAt - e.t > BUBBLE_MS) break;
        a.cur.querySelector('[data-bubble]')?.remove();
        const b = document.createElement('div');
        b.className = styles.bubble;
        b.dataset.bubble = '';
        b.textContent = e.text;
        b.addEventListener('animationend', () => b.remove());
        a.cur.append(b);
        break;
      }
    }
  };
  const E = (e) => {
    e.t = now();
    events.push(e);
    apply(e);
  };

  const place = (a, x, y) => E({ k: 'cur', id: a.id, x, y });
  const show = (a, v) => E({ k: 'show', id: a.id, v });
  const setSel = (a, r) => E({ k: 'sel', id: a.id, r });
  const clearSel = (a) => E({ k: 'selx', id: a.id });
  const mode = (a, m) => E({ k: 'mode', id: a.id, ...m });
  const cellSet = (ref, patch) => E({ k: 'cell', ref, ...patch });
  const setFb = (ref, text) => E({ k: 'fb', ref, text });
  const log = (a, text) => E({ k: 'log', id: a && a.id, text });
  const say = (a, text) => {
    E({ k: 'say', id: a.id, text });
    log(a, `says "${text}"`);
  };

  // ---- one requestAnimationFrame loop drives every tween
  const tweens = new Set();
  let raf = 0;
  const tick = (t) => {
    raf = 0;
    for (const tw of [...tweens]) {
      const p = Math.min(1, Math.max(0, (t - tw.t0) / tw.dur));
      tw.fn(p);
      if (p >= 1) {
        tweens.delete(tw);
        tw.res();
      }
    }
    if (tweens.size) raf = requestAnimationFrame(tick);
  };
  const tween = (c, dur, fn) =>
    new Promise((res, rej) => {
      if (c.stop) return rej(STOP);
      tweens.add({ ctl: c, t0: performance.now(), dur: Math.max(1, dur), fn, res, rej });
      if (!raf) raf = requestAnimationFrame(tick);
    });
  const sleep = (c, ms) =>
    new Promise((res, rej) => {
      if (c.stop) return rej(STOP);
      setTimeout(() => (c.stop ? rej(STOP) : res()), ms);
    });
  const abortCtl = (c) => {
    if (!c) return;
    c.stop = true;
    for (const tw of [...tweens]) {
      if (tw.ctl === c) {
        tweens.delete(tw);
        tw.rej(STOP);
      }
    }
  };
  // eased move along a slightly bowed quadratic curve
  const moveTo = (c, a, x1, y1, dur, on) => {
    const x0 = a.x;
    const y0 = a.y;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const d = Math.hypot(dx, dy) || 1;
    const bow = Math.min(50, d * 0.15) * (Math.random() < 0.5 ? -1 : 1);
    const cx = (x0 + x1) / 2 - (dy / d) * bow;
    const cy = (y0 + y1) / 2 + (dx / d) * bow;
    return tween(c, dur, (p) => {
      const e = ease(p);
      const u = 1 - e;
      const x = u * u * x0 + 2 * u * e * cx + e * e * x1;
      const y = u * u * y0 + 2 * u * e * cy + e * e * y1;
      place(a, x, y);
      on && on(x, y);
    });
  };

  // ---- cell-level actions
  const goCell = async (c, a, ref, dur = 260, pad = 0) => {
    if (!visible(ref)) {
      show(a, false);
      return false; // column is dropped on phones: fill it without a cursor
    }
    show(a, true);
    const r = rel(cell(ref));
    await moveTo(c, a, r.x + r.w * 0.55, r.y + r.h * 0.6, dur);
    setSel(a, { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 });
    await sleep(c, 90);
    return true;
  };
  const typeText = async (c, ref, text, ms, write) => {
    for (let i = 1; i <= text.length; i++) {
      write(text.slice(0, i));
      setFb(ref, text.slice(0, i));
      await sleep(c, ms);
    }
  };
  const typeInto = async (c, ref, text, ms) => {
    cellSet(ref, { on: true });
    await typeText(c, ref, text, ms, (s) => cellSet(ref, { text: s }));
  };
  const reveal = (ref) => {
    cellSet(ref, { on: true, text: finalOf(ref) });
    setFb(ref, formulaOf(ref) || finalOf(ref));
  };
  const countUp = async (c, ref) => {
    cellSet(ref, { on: true });
    const target = +cell(ref).dataset.n;
    await tween(c, 380, (p) => {
      const v = Math.round(target * easeOut(p));
      cellSet(ref, { text: fmt(v) });
      setFb(ref, String(v));
    });
  };
  const dragRange = async (c, a, ref1, ref2, dur) => {
    const r1 = rel(cell(ref1));
    const r2 = rel(cell(ref2));
    await goCell(c, a, ref1);
    mode(a, { drag: true });
    await moveTo(c, a, r2.x + r2.w - 8, r2.y + r2.h - 8, dur, (x, y) => {
      setSel(a, { x: r1.x, y: r1.y, w: Math.max(r1.w, x - r1.x + 8), h: Math.max(r1.h, y - r1.y + 8) });
    });
    mode(a, {});
    setSel(a, union(r1, r2)); // snap to the range
    setFb(`${ref1}:${ref2}`, '');
    await sleep(c, 160);
  };
  // drag the fill handle from a cell's corner; the dashed range follows
  const fill = async (c, a, fromRef, toRef, axis, dur, onStep) => {
    const r1 = rel(cell(fromRef));
    const r2 = rel(cell(toRef));
    mode(a, { handle: true });
    await moveTo(c, a, r1.x + r1.w - 1, r1.y + r1.h - 1, 350);
    mode(a, { drag: true, dashed: true, handle: true });
    const ex = axis === 'y' ? r1.x + r1.w - 1 : r2.x + r2.w - 1;
    const ey = axis === 'y' ? r2.y + r2.h - 1 : r1.y + r1.h - 1;
    await moveTo(c, a, ex, ey, dur, (x, y) => {
      setSel(a, { x: r1.x, y: r1.y, w: Math.max(r1.w, x - r1.x + 1), h: Math.max(r1.h, y - r1.y + 1) });
      onStep(x, y);
    });
    mode(a, {});
    setSel(a, union(r1, r2));
    await sleep(c, 200);
  };

  // ---- gates: one agent hands a cell to another, or yields when it arrives first
  let gates = new Map();
  const gate = (ref) => {
    if (!gates.has(ref)) {
      const g = { done: false };
      g.p = new Promise((r) => (g.release = () => ((g.done = true), r())));
      gates.set(ref, g);
    }
    return gates.get(ref);
  };

  // ---- resets (these write straight to the DOM and are not recorded)
  const restoreText = () => root.querySelectorAll('[data-v]').forEach((v) => (v.textContent = v.dataset.final));
  const resetDom = () => {
    allCells().forEach((c) => {
      c.removeAttribute('data-on');
      c.removeAttribute('data-hot');
    });
    chart.removeAttribute('data-on');
    titleEl.removeAttribute('data-on');
    bars.forEach((b) => b.removeAttribute('data-on'));
    restoreText();
    for (const d of AGENTS) {
      apply({ k: 'selx', id: d.id });
      apply({ k: 'show', id: d.id, v: false });
      apply({ k: 'work', id: d.id, v: false });
    }
    overlay.querySelectorAll('[data-bubble]').forEach((b) => b.remove());
    hideMe();
    logEl.textContent = '';
    apply({ k: 'fb', ref: 'A1', text: '' });
  };
  const settleEvents = () => {
    const out = [];
    allCells().forEach((c) =>
      out.push({ k: 'cell', ref: c.dataset.cell, on: true, text: c.querySelector('[data-v]').dataset.final, hot: c.hasAttribute('data-h') }),
    );
    out.push({ k: 'chart', what: 'frame', on: true }, { k: 'chart', what: 'title', on: true }, { k: 'ttext', text: titleEl.dataset.final });
    bars.forEach((_, i) => out.push({ k: 'chart', what: 'bar', i, on: true }));
    for (const d of AGENTS) out.push({ k: 'selx', id: d.id }, { k: 'show', id: d.id, v: false }, { k: 'work', id: d.id, v: false });
    return out;
  };
  const settle = (record) => settleEvents().forEach((e) => (record ? E(e) : apply(e)));

  // ---- what-if sliders: recompute everything from the original numbers
  const baseC = {};
  const baseF = {};
  rowsOf().forEach((r) => {
    baseC[r] = +cell(`C${r}`).dataset.n;
    baseF[r] = +cell(`F${r}`).dataset.n;
  });
  const setText = (ref, text) => {
    const v = val(ref);
    v.dataset.final = text;
    v.textContent = text;
  };
  const whatIf = (kc, kf) => {
    const C = {};
    const F = {};
    rowsOf().forEach((r) => {
      C[r] = Math.round(baseC[r] * kc);
      F[r] = Math.min(C[r], Math.round(baseF[r] * kf)); // done can't exceed tasks
    });
    const maxC = Math.max(...Object.values(C));
    const maxF = Math.max(...Object.values(F)) || 1;
    let ct = 0;
    let ft = 0;
    rowsOf().forEach((r, i) => {
      setText(`C${r}`, fmt(C[r]));
      setText(`F${r}`, fmt(F[r]));
      setText(`G${r}`, pct(C[r] ? F[r] / C[r] : 0));
      cell(`F${r}`).style.setProperty('--h', F[r] / maxF);
      bars[i].style.setProperty('--w', C[r] / maxC);
      bars[i].querySelector('b').textContent = C[r];
      ct += C[r];
      ft += F[r];
    });
    setText(`C${tot}`, fmt(ct));
    setText(`F${tot}`, fmt(ft));
    setText(`G${tot}`, pct(ct ? ft / ct : 0));
    const top3 = Object.values(C).sort((a, b) => b - a).slice(0, 3).reduce((s, x) => s + x, 0);
    const text = `The top three items hold ${Math.round((top3 / ct) * 100)}% of all tasks`;
    titleEl.dataset.final = text;
    titleEl.textContent = text;
  };
  const sliderLabels = () => {
    kCv.textContent = `${kC.value}%`;
    kFv.textContent = `${kF.value}%`;
  };
  const resetWhatIf = () => {
    kC.value = 100;
    kF.value = 100;
    sliderLabels();
    whatIf(1, 1);
  };
  const setSliders = (on) => {
    kC.disabled = !on;
    kF.disabled = !on;
  };
  const onSlider = () => {
    sliderLabels();
    whatIf(kC.value / 100, kF.value / 100);
  };

  // ---- replay: re-apply the recorded events up to a time
  let replaying = false;
  let playCtl = null;
  let interactive = false;
  const duration = () => (events.length ? events[events.length - 1].t : 0);
  const fmtClock = (ms) => `${(ms / 1000).toFixed(1)}s / ${(duration() / 1000).toFixed(1)}s`;

  const foldTo = (i1) => {
    const lastCur = {};
    for (; applied < i1; applied++) {
      const e = events[applied];
      if (e.k === 'cur') lastCur[e.id] = e; // only the final cursor position matters
      else apply(e);
    }
    for (const id in lastCur) apply(lastCur[id]);
  };
  const gotoTime = (ms) => {
    let lo = 0;
    let hi = events.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (events[mid].t <= ms) lo = mid + 1;
      else hi = mid;
    }
    if (lo < applied) {
      resetDom();
      applied = 0;
    }
    replayAt = ms;
    foldTo(lo);
    replayAt = null;
  };
  const enterReplay = () => {
    if (replaying) return;
    replaying = true;
    interactive = false;
    resetWhatIf();
    setSliders(false);
    stage.classList.add(styles.scrub);
    hideMe();
  };
  const exitReplay = () => {
    replaying = false;
    interactive = true;
    setSliders(true);
    stage.classList.remove(styles.scrub);
  };
  const seek = (ms) => {
    const end = duration();
    ms = Math.max(0, Math.min(end, ms));
    if (ms >= end) {
      if (replaying) {
        gotoTime(end);
        exitReplay();
      }
    } else {
      enterReplay();
      gotoTime(ms);
    }
    scrub.value = ms;
    clock.textContent = fmtClock(ms);
  };
  const stopPlay = () => {
    abortCtl(playCtl);
    playCtl = null;
    playBtn.textContent = 'Play ×2';
  };
  const play = async () => {
    if (playCtl) return stopPlay();
    if (!events.length) return;
    const from = +scrub.value >= duration() ? 0 : +scrub.value;
    const span = duration() - from;
    const c = { stop: false };
    playCtl = c;
    playBtn.textContent = 'Pause';
    try {
      await tween(c, span / 2, (p) => seek(p >= 1 ? duration() : from + p * span));
    } catch (e) {
      if (e !== STOP) throw e;
      return;
    }
    if (playCtl === c) stopPlay();
  };
  const armReplay = () => {
    applied = events.length;
    scrub.max = duration();
    scrub.value = duration();
    scrub.disabled = false;
    playBtn.disabled = false;
    clock.textContent = fmtClock(duration());
  };
  const disarmReplay = () => {
    stopPlay();
    scrub.disabled = true;
    playBtn.disabled = true;
    scrub.value = 0;
    clock.textContent = '';
    replaying = false;
    stage.classList.remove(styles.scrub);
  };
  const onScrub = () => {
    stopPlay();
    seek(+scrub.value);
  };

  const setRunning = (on) => {
    skipBtn.disabled = !on;
    rebuildBtn.disabled = !animated;
  };
  const finish = () => {
    interactive = true;
    setRunning(false);
    setSliders(true);
    if (animated) armReplay();
  };

  // ---- the script
  let ctl = null;
  let epoch = 0;

  const job = async (a, fn) => {
    const fr = rel(a.face);
    E({ k: 'work', id: a.id, v: true });
    place(a, fr.x + fr.w / 2, fr.y + fr.h / 2);
    try {
      await fn(a);
    } finally {
      E({ k: 'work', id: a.id, v: false });
    }
  };

  async function run(c) {
    const A = ag;
    let placed;
    const chartPlaced = new Promise((r) => (placed = r));

    const headers = (a) => async () => {
      log(a, 'is typing the header row');
      for (const col of COLS) {
        const ref = `${col.k}1`;
        const shown = await goCell(c, a, ref, 200);
        await typeInto(c, ref, finalOf(ref), shown ? 30 : 5);
      }
      clearSel(a);
    };
    // Copy types each title, then hands the finished row to Tags
    const titles = (a) => async () => {
      log(a, `is typing titles into A2:A${last}`);
      for (const r of rowsOf()) {
        await goCell(c, a, `A${r}`, 240);
        await typeInto(c, `A${r}`, finalOf(`A${r}`), 14);
        gate(`A${r}`).release();
        if ([2, 6, last].includes(r)) say(a, `row ${r} is yours, Tags`);
      }
      clearSel(a);
      log(a, 'finished the titles');
    };
    const tags = (a) => async () => {
      log(a, `is waiting on Copy's titles to tag B2:B${last}`);
      for (const r of rowsOf()) {
        await gate(`A${r}`).p;
        await goCell(c, a, `B${r}`, 200);
        if (r === 2) say(a, 'got it, tagging');
        await typeInto(c, `B${r}`, finalOf(`B${r}`), 35);
      }
      clearSel(a);
    };
    const numbers = (a, col, delay, label) => async () => {
      await sleep(c, delay);
      say(a, `claiming ${col}2:${col}${last}`);
      log(a, `is counting up ${label} in column ${col}`);
      for (const r of rowsOf()) {
        const ref = `${col}${r}`;
        await goCell(c, a, ref, 220);
        await countUp(c, ref);
        gate(ref).release();
      }
      clearSel(a);
    };
    // Pixel tails Stats down column F; it keeps arriving at a cell Stats is still counting, so it yields
    const heat = (a) => async () => {
      await sleep(c, 800);
      say(a, 'tailing Stats down F');
      let yielded = 0;
      for (const r of rowsOf()) {
        const ref = `F${r}`;
        await goCell(c, a, ref, 260);
        const g = gate(ref);
        if (!g.done) {
          yielded++;
          const box = rel(cell(ref));
          setSel(a, { x: box.x - 4, y: box.y - 4, w: box.w + 8, h: box.h + 8 });
          if (yielded % 3 === 1) say(a, 'after you, Stats');
          await g.p;
          setSel(a, box);
        }
        cellSet(ref, { hot: true });
        await sleep(c, 120);
      }
      clearSel(a);
      log(a, `painted the heat map and yielded to Stats ${yielded} times`);
    };

    const formula = (a) => async () => {
      log(a, 'is writing =F2/C2 in G2');
      await goCell(c, a, 'G2', 400);
      await typeInto(c, 'G2', '=F2/C2', 90);
      await sleep(c, 500);
      reveal('G2');
      await sleep(c, 450);
      say(a, 'filling down');
      log(a, `is dragging the fill handle down to G${last}`);
      let next = 3;
      const rows = rowsOf().map((r) => ({ r, box: rel(cell(`G${r}`)) }));
      await fill(c, a, 'G2', `G${last}`, 'y', 2000, (x, y) => {
        while (next <= last && y >= rows[next - 2].box.y + rows[next - 2].box.h * 0.5) reveal(`G${next++}`);
      });
      while (next <= last) reveal(`G${next++}`);
      clearSel(a);
      log(a, 'filled the column');
    };
    const draw = (a) => async () => {
      log(a, `is selecting C2:C${last} for a chart`);
      await dragRange(c, a, 'C2', `C${last}`, 800);
      const cr = rel(chart);
      await moveTo(c, a, cr.x + 6, cr.y + 6, 800);
      say(a, 'chart goes here');
      log(a, 'is dragging a marquee for the chart');
      clearSel(a);
      mode(a, { drag: true, dashed: true });
      await moveTo(c, a, cr.x + cr.w - 6, cr.y + cr.h - 6, 1000, (x, y) =>
        setSel(a, { x: cr.x + 2, y: cr.y + 2, w: Math.max(4, x - cr.x - 2), h: Math.max(4, y - cr.y - 2) }),
      );
      clearSel(a);
      E({ k: 'chart', what: 'frame', on: true });
      placed();
      for (let i = 0; i < bars.length; i++) {
        E({ k: 'chart', what: 'bar', i, on: true });
        await sleep(c, 120);
      }
      log(a, 'drew the bar chart');
      await sleep(c, 500);
    };
    const chartTitle = (a) => async () => {
      await chartPlaced;
      const tr = rel(titleEl);
      show(a, true);
      await moveTo(c, a, tr.x + 30, tr.y + tr.h * 0.6, 900);
      setSel(a, tr);
      log(a, 'is typing the chart title');
      E({ k: 'chart', what: 'title', on: true });
      await typeText(c, 'Chart title', titleEl.dataset.final, 30, (s) => E({ k: 'ttext', text: s }));
      clearSel(a);
      say(a, 'title done');
    };
    const totals = (a) => async () => {
      say(a, 'adding it all up');
      log(a, 'is totalling the columns');
      await goCell(c, a, `A${tot}`, 300);
      await typeInto(c, `A${tot}`, finalOf(`A${tot}`), 40);
      await goCell(c, a, `C${tot}`, 450);
      await typeInto(c, `C${tot}`, formulaOf(`C${tot}`), 70);
      await sleep(c, 450);
      reveal(`C${tot}`);
      await sleep(c, 350);
      const cols = ['D', 'E', 'F'];
      const boxes = cols.map((k) => rel(cell(`${k}${tot}`)));
      let next = 0;
      await fill(c, a, `C${tot}`, `F${tot}`, 'x', 1300, (x) => {
        while (next < 3 && x >= boxes[next].x + boxes[next].w * 0.5) reveal(`${cols[next++]}${tot}`);
      });
      while (next < 3) reveal(`${cols[next++]}${tot}`);
      await goCell(c, a, `G${tot}`, 400);
      reveal(`G${tot}`);
      await sleep(c, 500);
      clearSel(a);
      log(a, 'finished the totals');
    };

    try {
      log(null, 'Ten agents are filling in the sheet');
      await job(A.sum, headers(A.sum));
      await Promise.all([
        job(A.copy, titles(A.copy)),
        job(A.tags, tags(A.tags)),
        job(A.data, numbers(A.data, 'C', 0, 'tasks')),
        job(A.fetch, numbers(A.fetch, 'D', 250, 'hours planned')),
        job(A.count, numbers(A.count, 'E', 500, 'hours spent')),
        job(A.stats, numbers(A.stats, 'F', 750, 'tasks done')),
        job(A.pixel, heat(A.pixel)),
      ]);
      await Promise.all([job(A.claude, formula(A.claude)), job(A.codex, draw(A.codex)), job(A.copy, chartTitle(A.copy))]);
      await job(A.sum, totals(A.sum));
      await sleep(c, 500);
      for (const d of AGENTS) show(A[d.id], false);
      log(null, 'Done. Click any cell, move the sliders, or scrub the replay.');
      if (ctl === c) finish();
    } catch (e) {
      if (e === STOP) return;
      console.error(e);
      settle(true);
      finish();
    }
  }

  // ---- controls
  const start = () => {
    abortCtl(ctl);
    stopPlay();
    disarmReplay();
    resetWhatIf();
    resetDom();
    setSliders(false);
    interactive = false;
    events = [];
    applied = 0;
    gates = new Map();
    if (!animated) {
      settle(false);
      finish();
      return;
    }
    ctl = { stop: false };
    t0 = performance.now();
    setRunning(true);
    run(ctl);
  };
  const skip = () => {
    epoch++;
    abortCtl(ctl);
    settle(true);
    log(null, 'Skipped to the end');
    finish();
  };
  const rebuild = async () => {
    const e = ++epoch;
    abortCtl(ctl);
    disarmReplay();
    resetWhatIf();
    setSliders(false);
    interactive = false;
    hideMe();
    setRunning(true);
    skipBtn.disabled = true;
    for (const d of AGENTS) {
      apply({ k: 'selx', id: d.id });
      apply({ k: 'show', id: d.id, v: false });
      apply({ k: 'work', id: d.id, v: false });
    }
    chart.removeAttribute('data-on');
    titleEl.removeAttribute('data-on');
    bars.forEach((b) => b.removeAttribute('data-on'));
    // clear from the bottom right
    const cells = allCells().reverse();
    for (let i = 0; i < cells.length; i++) {
      cells[i].removeAttribute('data-on');
      cells[i].removeAttribute('data-hot');
      if (i % 2) await new Promise((r) => setTimeout(r, 18));
      if (e !== epoch) return;
    }
    await new Promise((r) => setTimeout(r, 250));
    if (e !== epoch) return;
    start();
  };

  const onClick = (ev) => {
    if (!interactive) return;
    const td = ev.target.closest('[data-cell]');
    if (!td) return;
    const r = rel(td);
    Object.assign(meBox.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    meBox.dataset.on = '1';
    setFb(td.dataset.cell, td.dataset.f || td.querySelector('[data-v]').dataset.final);
  };
  stage.addEventListener('click', onClick);
  skipBtn.addEventListener('click', skip);
  rebuildBtn.addEventListener('click', rebuild);
  playBtn.addEventListener('click', play);
  scrub.addEventListener('input', onScrub);
  kC.addEventListener('input', onSlider);
  kF.addEventListener('input', onSlider);
  window.addEventListener('resize', hideMe);

  return {
    start,
    destroy() {
      epoch++;
      abortCtl(ctl);
      abortCtl(playCtl);
      cancelAnimationFrame(raf);
      stage.removeEventListener('click', onClick);
      skipBtn.removeEventListener('click', skip);
      rebuildBtn.removeEventListener('click', rebuild);
      playBtn.removeEventListener('click', play);
      scrub.removeEventListener('input', onScrub);
      kC.removeEventListener('input', onSlider);
      kF.removeEventListener('input', onSlider);
      window.removeEventListener('resize', hideMe);
      created.forEach((el) => el.remove());
    },
  };
}
