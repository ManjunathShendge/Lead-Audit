import { db } from '@/lib/db';
import { configSchema, defaults } from '@/lib/scoring/config';
import { platformNames, platforms, type Platform } from '@/lib/collectors/types';
import { currentMode, liveAvailability } from '@/lib/collectors';
import { SettingsForm, type BenchmarkRow } from '@/components/settings-form';

const SOURCE: Record<Platform, string> = {
  instagram: 'APIFY_ACTOR_INSTAGRAM',
  facebook: 'APIFY_ACTOR_FACEBOOK',
  linkedin: 'APIFY_ACTOR_LINKEDIN',
  youtube: 'YouTube Data API v3',
};

export default async function Settings() {
  const [row, benchmarks] = await Promise.all([
    db.config.findUnique({ where: { id: 'default' } }),
    db.benchmark.findMany({ orderBy: [{ industry: 'asc' }, { platform: 'asc' }] }),
  ]);
  if (!row) return <div className="notice">Configuration not found. Run the database seed.</div>;
  const config = configSchema.parse(row.value);
  const mode = currentMode();
  const availability = liveAvailability();

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">THE FRAMEWORK BEHIND THE SCORE</span>
          <h1>Configuration</h1>
          <p>Editable scoring rules. Each audit keeps its own immutable snapshot.</p>
        </div>
        <span className={mode === 'live' ? 'tag live' : 'tag'}>
          {mode === 'live' ? 'Live mode' : 'Mock mode'}
        </span>
      </div>

      <section className="panel settings-panel">
        <h2>Collector configuration</h2>
        <p className="field-help">
          Actor IDs and keys come from the server environment and are never sent to the browser. Only whether
          a value is set is shown here.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Platform</th>
                <th>Included in audits</th>
                <th>Source</th>
                <th>Live status</th>
              </tr>
            </thead>
            <tbody>
              {platforms.map((p) => (
                <tr key={p}>
                  <td>{platformNames[p]}</td>
                  <td>{config.enabled.includes(p) ? 'Enabled' : 'Disabled'}</td>
                  <td>{p === 'youtube' ? SOURCE[p] : process.env[SOURCE[p]] || `${SOURCE[p]} not set`}</td>
                  <td className={availability[p].ready ? 'target-met' : 'target-missed'}>
                    {availability[p].ready ? 'Configured' : availability[p].reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <SettingsForm
        initialConfig={{ ...defaults, ...config }}
        initialBenchmarks={benchmarks as BenchmarkRow[]}
      />
    </>
  );
}
