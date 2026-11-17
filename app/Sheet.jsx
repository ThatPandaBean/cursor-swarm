'use client';
import { useEffect, useRef } from 'react';
import s from './Sheet.module.css';
import { AGENTS, COLS, fmt, pct } from './shared';
import { createEngine } from './engine';

function Face({ color }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill={color} />
      <circle cx="11.5" cy="13" r="2" fill="#fff" />
      <circle cx="20.5" cy="13" r="2" fill="#fff" />
      <path d="M10.5 20c2.2 2.6 8.8 2.6 11 0" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export default function Sheet({ rows, title, note }) {
  const root = useRef(null);
  const n = rows.length;
  const t = n + 2; // totals row number

  useEffect(() => {
    const engine = createEngine({ root: root.current, styles: s, n });
    engine.start();
    return () => engine.destroy();
  }, [n]);

  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  const maxDone = Math.max(...rows.map((r) => r.done));
  const maxTasks = Math.max(...rows.map((r) => r.tasks));
  const tot = { C: sum('tasks'), D: sum('planned'), E: sum('spent'), F: sum('done') };
  const cls = (c, extra) => [extra, c.hm && s.hm].filter(Boolean).join(' ');

  return (
    <main className={s.page} ref={root}>
      <header className={s.head}>
        <h1>Cursor Swarm</h1>
        <p>Ten agents fill in this sheet together. The table is plain HTML first, so the values are all there before any script runs.</p>
      </header>

      <div className={s.toolbar}>
        <ul className={s.faces} aria-label="Agents">
          {AGENTS.map((a) => (
            <li key={a.id} className={s.face} data-agent={a.id} data-working="0" title={a.name}>
              <Face color={a.color} />
              <span>{a.name}</span>
            </li>
          ))}
        </ul>
        <div className={s.buttons}>
          <button type="button" data-role="skip" disabled>Skip</button>
          <button type="button" data-role="rebuild">Rebuild</button>
        </div>
      </div>

      <div className={s.fb} aria-label="Formula bar">
        <span className={s.fbRef} data-role="fbref">A1</span>
        <span className={s.fx}>fx</span>
        <span className={s.fbText} data-role="fbtext" />
      </div>

      <div className={s.stage} data-role="stage">
        <div className={s.sheet}>
          <table>
            <colgroup>
              {COLS.map((c) => (
                <col key={c.k} className={cls(c, s['c' + c.k])} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {COLS.map((c) => (
                  <th key={c.k} scope="col" className={cls(c)} data-cell={`${c.k}1`}>
                    <span className={s.v} data-v>{c.h}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const n2 = i + 2;
                return (
                  <tr key={r.title}>
                    <td data-cell={`A${n2}`}><span className={s.v} data-v>{r.title}</span></td>
                    <td className={s.hm} data-cell={`B${n2}`} data-cat={r.category}><span className={s.v} data-v>{r.category}</span></td>
                    <td className={s.num} data-cell={`C${n2}`} data-n={r.tasks}><span className={s.v} data-v>{fmt(r.tasks)}</span></td>
                    <td className={`${s.num} ${s.hm}`} data-cell={`D${n2}`} data-n={r.planned}><span className={s.v} data-v>{fmt(r.planned)}</span></td>
                    <td className={`${s.num} ${s.hm}`} data-cell={`E${n2}`} data-n={r.spent}><span className={s.v} data-v>{fmt(r.spent)}</span></td>
                    <td className={s.num} data-cell={`F${n2}`} data-n={r.done} data-h style={{ '--h': r.done / maxDone }}><span className={s.v} data-v>{fmt(r.done)}</span></td>
                    <td className={s.num} data-cell={`G${n2}`} data-f={`=F${n2}/C${n2}`}><span className={s.v} data-v>{pct(r.done / r.tasks)}</span></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className={s.totals}>
                <td data-cell={`A${t}`}><span className={s.v} data-v>Total</span></td>
                <td className={s.hm} data-cell={`B${t}`}><span className={s.v} data-v /></td>
                {['C', 'D', 'E', 'F'].map((k) => (
                  <td key={k} className={`${s.num} ${['D', 'E'].includes(k) ? s.hm : ''}`} data-cell={`${k}${t}`} data-f={`=SUM(${k}2:${k}${n + 1})`}>
                    <span className={s.v} data-v>{fmt(tot[k])}</span>
                  </td>
                ))}
                <td className={s.num} data-cell={`G${t}`} data-f={`=F${t}/C${t}`}><span className={s.v} data-v>{pct(tot.F / tot.C)}</span></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <aside className={s.chart} data-role="chart" aria-label="Tasks per item">
          <h2 className={s.chartTitle} data-role="charttitle" data-v>{title}</h2>
          <ul className={s.bars}>
            {rows.map((r) => (
              <li key={r.title} className={s.bar} data-role="bar" data-cat={r.category} style={{ '--w': r.tasks / maxTasks }}>
                <span className={s.barLabel}>{r.title}</span>
                <span className={s.track}><i className={s.fill} /></span>
                <b>{r.tasks}</b>
              </li>
            ))}
          </ul>
        </aside>

        <div className={s.overlay} data-role="overlay" aria-hidden="true" />
      </div>

      <section className={s.tools}>
        <div className={s.tool}>
          <h2>What if</h2>
          <label>
            <span>Tasks</span>
            <input type="range" data-role="kC" min="50" max="150" step="5" defaultValue="100" disabled />
            <output data-role="kCv">100%</output>
          </label>
          <label>
            <span>Tasks done</span>
            <input type="range" data-role="kF" min="50" max="150" step="5" defaultValue="100" disabled />
            <output data-role="kFv">100%</output>
          </label>
        </div>
        <div className={s.tool}>
          <h2>Replay</h2>
          <div className={s.replay}>
            <button type="button" data-role="play" disabled>Play ×2</button>
            <input type="range" data-role="scrub" min="0" max="1000" step="any" defaultValue="0" disabled aria-label="Replay position" />
            <output data-role="clock" />
          </div>
        </div>
      </section>

      <section className={s.logWrap}>
        <h2>Activity</h2>
        <ol className={s.log} data-role="log" />
      </section>
      <p className={s.note}>{note}</p>
    </main>
  );
}
