import data from '../data/items.json';
import Sheet from './Sheet';

export default function Page() {
  const rows = [...data.rows].sort((a, b) => b.tasks - a.tasks);
  const total = rows.reduce((n, r) => n + r.tasks, 0);
  const top3 = rows.slice(0, 3).reduce((n, r) => n + r.tasks, 0);
  const title = `The top three items hold ${Math.round((top3 / total) * 100)}% of all tasks`;
  return <Sheet rows={rows} title={title} note={data.note} />;
}
