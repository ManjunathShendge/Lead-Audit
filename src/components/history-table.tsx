'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowUpRight, RotateCcw, Trash2, Search } from 'lucide-react';
export interface HistoryItem {
  id: string;
  brand: string;
  website: string | null;
  industry: string;
  state: string;
  createdAt: string;
  score: number | null;
  band: string;
  cost: number | null;
}
export function HistoryTable({ audits }: { audits: HistoryItem[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const filtered = audits.filter((a) =>
    `${a.brand} ${a.website ?? ''} ${a.industry}`.toLowerCase().includes(filter.toLowerCase()),
  );
  return (
    <section className="panel history-panel">
      <div className="section-heading">
        <h2>
          All audits <span className="tag">{audits.length}</span>
        </h2>
        <div className="table-search">
          <Search size={14} />
          <input
            aria-label="Search audits"
            placeholder="Search brands…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>
      {pending && (
        <div role="alert" className="notice delete-prompt">
          <span>Delete this audit and its stored source data permanently?</span>
          <button
            className="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                const res = await fetch(`/api/audits/${pending}`, { method: 'DELETE' });
                if (!res.ok) throw new Error('Unable to delete audit.');
                setPending(null);
                router.refresh();
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Delete failed.');
              } finally {
                setBusy(false);
              }
            }}
          >
            Delete audit
          </button>
          <button className="button" onClick={() => setPending(null)}>
            Keep audit
          </button>
        </div>
      )}
      <p role="alert" className="error">
        {error}
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Brand</th>
              <th>Industry</th>
              <th>Presence score</th>
              <th>Status</th>
              <th>Audited on</th>
              <th>Cost</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => (
              <tr key={a.id}>
                <td>
                  <Link className="brand-cell" href={`/audits/${a.id}`}>
                    <span
                      className={`brand-avatar avatar-${a.id.endsWith('strong') ? 'strong' : a.id.endsWith('weak') ? 'weak' : 'average'}`}
                    >
                      {a.brand
                        .split(' ')
                        .map((s) => s[0])
                        .slice(0, 2)
                        .join('')}
                    </span>
                    <span>
                      <strong>{a.brand}</strong>
                      <small>{a.website ? new URL(a.website).hostname : 'Social handles only'}</small>
                    </span>
                  </Link>
                </td>
                <td>
                  <span className="tag">{a.industry}</span>
                </td>
                <td>
                  <span className="table-score">{a.score === null ? '—' : Math.round(a.score)}</span>
                  <span className="score-description">{a.band}</span>
                </td>
                <td>
                  <span className={`tag ${a.state === 'complete' ? 'good' : ''}`}>
                    {a.state === 'complete' ? 'Complete' : a.state}
                  </span>
                </td>
                <td>
                  {new Date(a.createdAt).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    timeZone: 'Asia/Kolkata',
                  })}
                </td>
                <td>{a.cost === null ? 'Not measured' : `$${a.cost.toFixed(2)}`}</td>
                <td>
                  <div className="actions">
                    <Link className="icon-button" href={`/audits/${a.id}`} aria-label={`View ${a.brand}`}>
                      <ArrowUpRight size={16} />
                    </Link>
                    <Link
                      className="icon-button"
                      href={`/audits/new?from=${a.id}`}
                      aria-label={`Re-run ${a.brand}`}
                    >
                      <RotateCcw size={14} />
                    </Link>
                    <button
                      className="icon-button"
                      aria-label={`Delete ${a.brand}`}
                      onClick={() => setPending(a.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <div className="empty">
            <h2>{filter ? 'No matching brands' : 'A fresh start for better insights.'}</h2>
            <p>
              {filter ? 'Try a different search.' : 'Run your first audit to start building your library.'}
            </p>
            {!filter && (
              <Link className="button primary" href="/audits/new">
                Create an audit
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
