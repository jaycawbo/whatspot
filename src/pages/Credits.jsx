import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

const fmt = (val) =>
  val == null ? '—' : `$${Number(val).toFixed(2)}`;

export default function Credits() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const fetchBillingData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: result, error: fnError } = await supabase.functions.invoke('get-billing-data');
      if (fnError) throw new Error(fnError.message);
      setData(result);
      setLastRefreshed(new Date());
    } catch (err) {
      setError(err.message ?? 'Failed to fetch billing data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBillingData(); }, [fetchBillingData]);

  const totalMtd = data?.total_mtd_spend_usd ?? 0;
  const budget = data?.budget_usd ?? 20;
  const remaining = data?.total_remaining_usd ?? budget;
  const pctUsed = budget > 0 ? Math.min((totalMtd / budget) * 100, 100) : 0;

  return (
    <div style={{ padding: '32px', maxWidth: '680px', margin: '0 auto', fontFamily: 'ui-monospace, monospace', fontSize: '14px' }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <h1 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>Cloud Spend</h1>
        <button
          onClick={fetchBillingData}
          disabled={loading}
          style={{ padding: '5px 12px', fontSize: '13px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1 }}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {lastRefreshed && (
        <p style={{ fontSize: '12px', color: '#888', marginBottom: '20px' }}>
          Last refreshed: {lastRefreshed.toLocaleTimeString()}
          {data?.period && ` · Period: ${data.period.start} → ${data.period.end}`}
          {data?.days_elapsed != null && ` · Day ${data.days_elapsed} of ${data.days_in_month}`}
        </p>
      )}

      {error && (
        <div style={{ padding: '10px 14px', background: '#fff0f0', border: '1px solid #ffcccc', borderRadius: '4px', marginBottom: '20px', color: '#990000' }}>
          Error: {error}
        </div>
      )}

      {loading && !data && (
        <p style={{ color: '#666' }}>Loading billing data…</p>
      )}

      {data && (
        <>
          {/* Budget summary bar */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span>Monthly budget: <strong>{fmt(budget)}</strong></span>
              <span>Remaining: <strong style={{ color: remaining < 5 ? '#cc0000' : 'inherit' }}>{fmt(remaining)}</strong></span>
            </div>
            <div style={{ height: '8px', background: '#eee', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${pctUsed}%`,
                  background: pctUsed > 80 ? '#cc0000' : pctUsed > 50 ? '#e6a817' : '#2a7a2a',
                  borderRadius: '4px',
                  transition: 'width 0.3s',
                }}
              />
            </div>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              {fmt(totalMtd)} spent ({pctUsed.toFixed(1)}% of budget)
            </div>
          </div>

          {/* Per-service table */}
          {data.services && data.services.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left', color: '#555' }}>
                  <th style={{ padding: '6px 8px 6px 0' }}>Service</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>MTD Spend</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Daily Avg</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Projected</th>
                </tr>
              </thead>
              <tbody>
                {data.services.map((svc, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '8px 8px 8px 0' }}>{svc.service_name}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{fmt(svc.mtd_spend_usd)}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{fmt(svc.daily_average_usd)}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{fmt(svc.projected_month_end_usd)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid #ddd', fontWeight: '600' }}>
                  <td style={{ padding: '8px 8px 8px 0' }}>Total</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{fmt(data.total_mtd_spend_usd)}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>—</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <div style={{ padding: '16px', background: '#f8f8f8', borderRadius: '4px', color: '#555' }}>
              <p style={{ margin: 0 }}>No spend data found for tracked services.</p>
              {data.raw_sku_count != null && (
                <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#888' }}>
                  {data.raw_sku_count} SKUs returned by API — none matched Maps Platform or Vertex AI/Gemini.
                  {data.raw_sku_count === 0 && ' The SKUs endpoint may require additional API permissions.'}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
