import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const CENSUS_TARGET_TYPES = [
  'cafe', 'bakery', 'night_club', 'comedy_club', 'sandwich_shop',
  'food_court', 'fast_food_restaurant', 'wine_bar', 'cocktail_bar', 'coffee_shop',
];

const TOTAL_GRID_CELLS = 2888; // 0.005° grid over Toronto bounds

export default function EnrichmentDashboard() {
  // ── Enrichment state ───────────────────────────────────────────────────────
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [batchSize, setBatchSize] = useState(50);
  const [enrichRunning, setEnrichRunning] = useState(false);
  const [enrichResult, setEnrichResult] = useState(null);
  const [enrichError, setEnrichError] = useState(null);

  // ── Census sweep state ─────────────────────────────────────────────────────
  const [batchCells, setBatchCells] = useState(10);
  const [startCell, setStartCell] = useState(0);
  const [sweepRunning, setSweepRunning] = useState(false);
  const [sweepResult, setSweepResult] = useState(null);
  const [sweepError, setSweepError] = useState(null);

  useEffect(() => { loadStats(); }, []);

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
      setEnrichError('Failed to load stats: ' + err.message);
    } finally {
      setStatsLoading(false);
    }
  }

  // ── Enrichment handlers ────────────────────────────────────────────────────
  async function handleEnrichDryRun() {
    setEnrichRunning(true);
    setEnrichResult(null);
    setEnrichError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('enrich-venues', {
        body: { dry_run: true, batch_size: batchSize },
      });
      if (fnError) throw fnError;
      setEnrichResult(data);
    } catch (err) {
      setEnrichError(err.message);
    } finally {
      setEnrichRunning(false);
    }
  }

  async function handleEnrichRun() {
    setEnrichRunning(true);
    setEnrichResult(null);
    setEnrichError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('enrich-venues', {
        body: { dry_run: false, batch_size: batchSize },
      });
      if (fnError) throw fnError;
      setEnrichResult(data);
      loadStats();
    } catch (err) {
      setEnrichError(err.message);
    } finally {
      setEnrichRunning(false);
    }
  }

  // ── Census sweep handlers ──────────────────────────────────────────────────
  async function handleSweepDryRun() {
    setSweepRunning(true);
    setSweepResult(null);
    setSweepError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('census-sweep', {
        body: { dry_run: true, batch_cells: batchCells, start_cell: startCell },
      });
      if (fnError) throw fnError;
      setSweepResult(data);
    } catch (err) {
      setSweepError(err.message);
    } finally {
      setSweepRunning(false);
    }
  }

  async function handleSweepRun() {
    setSweepRunning(true);
    setSweepResult(null);
    setSweepError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('census-sweep', {
        body: { dry_run: false, batch_cells: batchCells, start_cell: startCell },
      });
      if (fnError) throw fnError;
      setSweepResult(data);
      if (data?.next_cell_offset != null) setStartCell(data.next_cell_offset);
      loadStats();
    } catch (err) {
      setSweepError(err.message);
    } finally {
      setSweepRunning(false);
    }
  }

  const clampedBatchSize  = Math.min(Math.max(1, batchSize), 200);
  const clampedBatchCells = Math.min(Math.max(1, batchCells), 200);
  const sweepComplete     = startCell >= TOTAL_GRID_CELLS;

  return (
    <div style={{ fontFamily: 'monospace', padding: '2rem', maxWidth: '640px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.2rem', marginBottom: '2rem' }}>Venue Enrichment Dashboard</h1>

      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      <section style={{ marginBottom: '2rem' }}>
        <strong>Stats</strong>
        {statsLoading ? (
          <p>Loading...</p>
        ) : stats ? (
          <pre style={{ background: '#f4f4f4', padding: '0.75rem', borderRadius: '4px', marginTop: '0.5rem' }}>
{`Total venues:        ${stats.total}
Unenriched:          ${stats.unenriched}
Est. months @ 1k/mo: ${stats.estimatedMonths}`}
          </pre>
        ) : null}
      </section>

      <hr style={{ marginBottom: '2rem', border: 'none', borderTop: '1px solid #ddd' }} />

      {/* ── Enrichment section ────────────────────────────────────────────── */}
      <section style={{ marginBottom: '2rem' }}>
        <strong>Enrich Venues</strong>
        <p style={{ color: '#666', fontSize: '0.85rem', margin: '0.25rem 0 0.75rem' }}>
          Fetches phone, website, hours &amp; photos for unenriched venues. Most popular first.
        </p>

        <div style={{ marginBottom: '0.75rem' }}>
          <label style={{ fontSize: '0.85rem' }}>Batch size&nbsp;</label>
          <input
            type="number"
            min={1}
            max={200}
            value={batchSize}
            onChange={(e) => setBatchSize(parseInt(e.target.value, 10) || 1)}
            style={{ width: '80px', padding: '0.25rem', marginRight: '0.5rem', fontFamily: 'monospace' }}
          />
          <span style={{ color: '#888', fontSize: '0.85rem' }}>
            max 200 — est. ${(clampedBatchSize * 0.017).toFixed(2)}/run
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <button onClick={handleEnrichDryRun} disabled={enrichRunning}
            style={{ padding: '0.5rem 1rem', cursor: enrichRunning ? 'not-allowed' : 'pointer', fontFamily: 'monospace' }}>
            {enrichRunning ? 'Running...' : 'Dry Run'}
          </button>
          <button onClick={handleEnrichRun} disabled={enrichRunning}
            style={{ padding: '0.5rem 1rem', cursor: enrichRunning ? 'not-allowed' : 'pointer',
              fontFamily: 'monospace', background: '#1a1a1a', color: '#fff', border: '1px solid #1a1a1a' }}>
            {enrichRunning ? 'Running...' : 'Run'}
          </button>
        </div>

        {enrichError && (
          <pre style={{ color: 'red', background: '#fff0f0', padding: '0.75rem', borderRadius: '4px' }}>
            {enrichError}
          </pre>
        )}
        {enrichResult && (
          <pre style={{ background: '#f4f4f4', padding: '0.75rem', borderRadius: '4px' }}>
            {JSON.stringify(enrichResult, null, 2)}
          </pre>
        )}
      </section>

      <hr style={{ marginBottom: '2rem', border: 'none', borderTop: '1px solid #ddd' }} />

      {/* ── Census sweep section ──────────────────────────────────────────── */}
      <section style={{ marginBottom: '2rem' }}>
        <strong>Census Sweep</strong>
        <p style={{ color: '#666', fontSize: '0.85rem', margin: '0.25rem 0 0.75rem' }}>
          Supplemental grid sweep for venue types missed by the original census.
          Uses 0.005° grid (~{TOTAL_GRID_CELLS.toLocaleString()} cells total).
        </p>

        <pre style={{ background: '#f4f4f4', padding: '0.75rem', borderRadius: '4px', marginBottom: '0.75rem', fontSize: '0.8rem' }}>
{`Target types: ${CENSUS_TARGET_TYPES.join(', ')}`}
        </pre>

        <div style={{ marginBottom: '0.5rem' }}>
          <label style={{ fontSize: '0.85rem' }}>Batch cells&nbsp;</label>
          <input
            type="number"
            min={1}
            max={200}
            value={batchCells}
            onChange={(e) => setBatchCells(parseInt(e.target.value, 10) || 1)}
            style={{ width: '80px', padding: '0.25rem', marginRight: '0.5rem', fontFamily: 'monospace' }}
          />
          <span style={{ color: '#888', fontSize: '0.85rem' }}>
            max 200 — {clampedBatchCells * CENSUS_TARGET_TYPES.length} calls / ${(clampedBatchCells * CENSUS_TARGET_TYPES.length * 0.032).toFixed(2)} per run
          </span>
        </div>

        <div style={{ marginBottom: '0.75rem' }}>
          <label style={{ fontSize: '0.85rem' }}>Start cell&nbsp;</label>
          <input
            type="number"
            min={0}
            value={startCell}
            onChange={(e) => setStartCell(parseInt(e.target.value, 10) || 0)}
            style={{ width: '80px', padding: '0.25rem', marginRight: '0.5rem', fontFamily: 'monospace' }}
          />
          <span style={{ color: '#888', fontSize: '0.85rem' }}>
            of {TOTAL_GRID_CELLS.toLocaleString()} — auto-advances after each run
          </span>
        </div>

        {sweepComplete && (
          <p style={{ color: 'green', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            Sweep complete — all cells processed. Reset start cell to 0 to re-run.
          </p>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <button onClick={handleSweepDryRun} disabled={sweepRunning}
            style={{ padding: '0.5rem 1rem', cursor: sweepRunning ? 'not-allowed' : 'pointer', fontFamily: 'monospace' }}>
            {sweepRunning ? 'Running...' : 'Dry Run'}
          </button>
          <button onClick={handleSweepRun} disabled={sweepRunning || sweepComplete}
            style={{ padding: '0.5rem 1rem', cursor: (sweepRunning || sweepComplete) ? 'not-allowed' : 'pointer',
              fontFamily: 'monospace', background: sweepComplete ? '#888' : '#1a1a1a',
              color: '#fff', border: '1px solid #1a1a1a' }}>
            {sweepRunning ? 'Running...' : 'Sweep'}
          </button>
        </div>

        {sweepError && (
          <pre style={{ color: 'red', background: '#fff0f0', padding: '0.75rem', borderRadius: '4px' }}>
            {sweepError}
          </pre>
        )}
        {sweepResult && (
          <pre style={{ background: '#f4f4f4', padding: '0.75rem', borderRadius: '4px' }}>
            {JSON.stringify(sweepResult, null, 2)}
          </pre>
        )}
      </section>
    </div>
  );
}
