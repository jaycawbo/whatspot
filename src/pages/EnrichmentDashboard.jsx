import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export default function EnrichmentDashboard() {
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [batchSize, setBatchSize] = useState(33);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    setStatsLoading(true);
    try {
      const [{ count: total }, { count: unenriched }] = await Promise.all([
        supabase.from('venues').select('*', { count: 'exact', head: true }),
        supabase.from('venues').select('*', { count: 'exact', head: true }).or('enriched.is.null,enriched.eq.false'),
      ]);
      const estimatedMonths = unenriched > 0 ? (unenriched / 1000).toFixed(1) : '0';
      setStats({ total: total ?? 0, unenriched: unenriched ?? 0, estimatedMonths });
    } catch (err) {
      setError('Failed to load stats: ' + err.message);
    } finally {
      setStatsLoading(false);
    }
  }

  async function handleDryRun() {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('enrich-venues', {
        body: { dry_run: true, batch_size: batchSize },
      });
      if (fnError) throw fnError;
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  async function handleRun() {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('enrich-venues', {
        body: { dry_run: false, batch_size: batchSize },
      });
      if (fnError) throw fnError;
      setResult(data);
      loadStats();
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  const clampedBatchSize = Math.min(Math.max(1, batchSize), 100);

  return (
    <div style={{ fontFamily: 'monospace', padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.2rem', marginBottom: '1.5rem' }}>Venue Enrichment Dashboard</h1>

      <section style={{ marginBottom: '1.5rem' }}>
        <strong>Stats</strong>
        {statsLoading ? (
          <p>Loading...</p>
        ) : stats ? (
          <pre style={{ background: '#f4f4f4', padding: '0.75rem', borderRadius: '4px' }}>
{`Total venues:       ${stats.total}
Unenriched:         ${stats.unenriched}
Est. months @ 1k/mo: ${stats.estimatedMonths}`}
          </pre>
        ) : null}
      </section>

      <section style={{ marginBottom: '1.5rem' }}>
        <strong>Batch size</strong>
        <div style={{ marginTop: '0.5rem' }}>
          <input
            type="number"
            min={1}
            max={100}
            value={batchSize}
            onChange={(e) => setBatchSize(parseInt(e.target.value, 10) || 1)}
            style={{ width: '80px', padding: '0.25rem', marginRight: '0.5rem', fontFamily: 'monospace' }}
          />
          <span style={{ color: '#888', fontSize: '0.85rem' }}>
            max 100 — est. cost ${(clampedBatchSize * 0.017).toFixed(2)}
          </span>
        </div>
      </section>

      <section style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.75rem' }}>
        <button
          onClick={handleDryRun}
          disabled={running}
          style={{ padding: '0.5rem 1rem', cursor: running ? 'not-allowed' : 'pointer', fontFamily: 'monospace' }}
        >
          {running ? 'Running...' : 'Dry Run'}
        </button>
        <button
          onClick={handleRun}
          disabled={running}
          style={{
            padding: '0.5rem 1rem',
            cursor: running ? 'not-allowed' : 'pointer',
            fontFamily: 'monospace',
            background: '#1a1a1a',
            color: '#fff',
            border: '1px solid #1a1a1a',
          }}
        >
          {running ? 'Running...' : 'Run'}
        </button>
      </section>

      {error && (
        <pre style={{ color: 'red', background: '#fff0f0', padding: '0.75rem', borderRadius: '4px' }}>
          {error}
        </pre>
      )}

      {result && (
        <pre style={{ background: '#f4f4f4', padding: '0.75rem', borderRadius: '4px' }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
