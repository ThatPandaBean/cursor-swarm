export const AGENTS = [
  { id: 'sum', name: 'Sum', color: '#dc2626' },
  { id: 'copy', name: 'Copy', color: '#2563eb' },
  { id: 'tags', name: 'Tags', color: '#ca8a04' },
  { id: 'data', name: 'Data', color: '#16a34a' },
  { id: 'fetch', name: 'Fetch', color: '#0891b2' },
  { id: 'count', name: 'Count', color: '#7c3aed' },
  { id: 'stats', name: 'Stats', color: '#db2777' },
  { id: 'claude', name: 'Claude', color: '#ea580c' },
  { id: 'pixel', name: 'Pixel', color: '#65a30d' },
  { id: 'codex', name: 'Codex', color: '#475569' },
];

// hm = dropped on phones; the agents still fill those cells, just without a cursor
export const COLS = [
  { k: 'A', h: 'Item' },
  { k: 'B', h: 'Type', hm: true },
  { k: 'C', h: 'Tasks' },
  { k: 'D', h: 'Planned hrs', hm: true },
  { k: 'E', h: 'Spent hrs', hm: true },
  { k: 'F', h: 'Tasks done' },
  { k: 'G', h: 'Done rate' },
];

export const fmt = (n) => n.toLocaleString('en-US');
export const pct = (x) => `${Math.round(x * 100)}%`;
