import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

const PLACES_CAP = 4000;
const GCP_BUDGET  = 20;

const fmt = (val) =>
  val == null ? '—' : `$${Number(val).toFixed(2)}`;

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

const CALL_TYPE_LABELS = {
  enrich: 'Enrich venues',
  photos: 'Get photos',
  hours:  'Hours recovery',
  weekly: 'Weekly refresh',
};

const mono = { fontFamily: 'ui-monospace, monospace', fontSize: '14px' };
const divider = { border: 'none', borderTop: '1px solid #ddd', margin: '28px 0' };

export default function Credits() {
  // ── Places API state ────────────────────────────────────────────────────────
  const [callRows, setCallRows]     = useState([]);
  const [callLoading, setCallLoading] = useState(true);
  const [callError, setCallError]   = useState(null);

  // ── GCP billing state ───────────────────────────────────────────────────────
  const [billingData, setBillingData]       = useState(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError]     = useState(null);
  const [lastRefreshed, setLastRefreshed]   = useState(null);

  const monthKey    = currentMonthKey();
  const today       = new Date();
  const dayOfMonth  = today.getDate();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

  // ── Load Places API call log ────────────────────────────────────────────────
  useEffect(() => {
    supabase
      .from('api_call_log')
      .select('call_type, called_at, month_key')
      .eq('service', 'google_places')
      .order('called_at', { ascending: false })
      .limit(5000)
      .then(({ data, error }) => {
        if (error) setCallError(error.message);
        else setCallRows(data || []);
        setCallLoading(false);
      });
  }, []);

  // Aggregate call log by month
  const byMonth = {};
  callRows.forEach((r) => {
    if (!byMonth[r.month_key]) byMonth[r.month_key] = { total: 0, types: {} };
    byMonth[r.month_key].total++;
    byMonth[r.month_key].types[r.call_type] = (byMonth[r.month_key].types[r.call_type] || 0) + 1;
  });
  const currentCalls  = byMonth[monthKey] || { total: 0, types: {} };
  const callPct       = Math.min(100, Math.round((currentCalls.total / PLACES_CAP) * 100));
  const callBarColor  = callPct >= 85 ? '#cc0000' : callPct >= 60 ? '#e6a817' : '#2a7a2a';
  const sortedMonths  = Object.keys(byMonth).sort().reverse();
  const priorMonths   = sortedMonths.filter((m) => m !== monthKey);

  // ── Load GCP billing ────────────────────────────────────────────────────────
  const fetchBillingData = useCallback(async () => {
    setBillingLoading(true);
    setBillingError(null);
    try {
      const { data: result, error: fnError } = await supabase.functions.invoke('get-billing-data');
      if (fnError) throw new Error(fnError.message);
      setBillingData(result);
      setLastRefreshed(new Date());
    } catch (err) {
      setBillingError(err.message ?? 'Failed to fetch billing data');
    } finally {
      setBillingLoading(false);
    }
  }, []);

  useEffect(() => { fetchBillingData(); }, [fetchBillingData]);

  const totalMtd  = billingData?.services?.reduce((sum, s) => sum + (s.mtd_spend ?? 0), 0) ?? 0;
  const remaining = GCP_BUDGET - totalMtd;
  const dailyAvg  = dayOfMonth > 0 ? totalMtd / dayOfMonth : 0;
  const pctUsed   = GCP_BUDGET > 0 ? Math.min((totalMtd / GCP_BUDGET) * 100, 100) : 0;

  return (
    <div style={{ padding: '32px', maxWidth: '680px', margin: '0 auto', ...mono }}>

      {/* ── Section 1: Places API Usage ────────────────────────────────────── */}
      <h1 style={{ fontSize: '18px', fontWeight: '600', margin: '0 0 4px' }}>Places API Usage</h1>
      <p style={{ fontSize: '12px', color: '#888', margin: '0 0 20px' }}>
        Hard cap: {PLACES_CAP.toLocaleString()} calls / month · {monthKey}
      </p>

      {callLoading && <p style={{ color: '#666' }}>Loading call log…</p>}

      {callError && (
        <div style={{ padding: '10px 14px', background: '#fff0f0', border: '1px solid #ffcccc', borderRadius: '4px', marginBottom: '16px', color: '#990000' }}>
          Error: {callError}
        </div>
      )}

      {!callLoading && !callError && (
        <>
          {/* Current month */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span>{monthKey} (current)</span>
              <strong>{currentCalls.total.toLocaleString()} / {PLACES_CAP.toLocaleString()}</strong>
            </div>
            <div style={{ height: '8px', background: '#eee', borderRadius: '4px', overflow: 'hidden', marginBottom: '10px' }}>
              <div style={{ height: '100%', width: `${callPct}%`, background: callBarColor, borderRadius: '4px', transition: 'width 0.3s' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px' }}>
              {Object.entries(CALL_TYPE_LABELS).map(([type, label]) => (
                <div key={type} style={{ display: 'flex', justifyContent: 'space-between', color: '#555' }}>
                  <span>{label}</span>
                  <span>{(currentCalls.types[type] || 0).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Prior months history */}
          {priorMonths.length > 0 && (
            <div>
              <p style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>History</p>
              {priorMonths.map((m) => {
                const month = byMonth[m];
                const mPct  = Math.min(100, Math.round((month.total / PLACES_CAP) * 100));
                return (
                  <div key={m} style={{ marginBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '13px' }}>
                      <span>{m}</span>
                      <span style={{ color: '#888' }}>{month.total.toLocaleString()} / {PLACES_CAP.toLocaleString()}</span>
                    </div>
                    <div style={{ height: '4px', background: '#eee', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${mPct}%`, background: '#999', borderRadius: '4px' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {sortedMonths.length === 0 && (
            <p style={{ color: '#888', fontSize: '13px' }}>No API calls logged yet.</p>
          )}
        </>
      )}

      <hr style={divider} />

      {/* ── Section 2: Google Cloud Billing ───────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>Cloud Spend</h2>
        <button
          onClick={fetchBillingData}
          disabled={billingLoading}
          style={{ padding: '5px 12px', fontSize: '13px', cursor: billingLoading ? 'not-allowed' : 'pointer', opacity: billingLoading ? 0.5 : 1, ...mono }}
        >
          {billingLoading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {lastRefreshed && (
        <p style={{ fontSize: '12px', color: '#888', marginBottom: '20px' }}>
          Last refreshed: {lastRefreshed.toLocaleTimeString()} · Day {dayOfMonth} of {daysInMonth}
        </p>
      )}

      {billingError && (
        <div style={{ padding: '10px 14px', background: '#fff0f0', border: '1px solid #ffcccc', borderRadius: '4px', marginBottom: '20px', color: '#990000' }}>
          Error: {billingError}
        </div>
      )}

      {billingLoading && !billingData && (
        <p style={{ color: '#666' }}>Loading billing data…</p>
      )}

      {billingData && (
        <>
          {/* Budget summary bar */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span>Monthly budget: <strong>{fmt(GCP_BUDGET)}</strong></span>
              <span>Remaining: <strong style={{ color: remaining < 5 ? '#cc0000' : 'inherit' }}>{fmt(remaining)}</strong></span>
            </div>
            <div style={{ height: '8px', background: '#eee', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${pctUsed}%`,
                background: pctUsed > 80 ? '#cc0000' : pctUsed > 50 ? '#e6a817' : '#2a7a2a',
                borderRadius: '4px',
                transition: 'width 0.3s',
              }} />
            </div>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              {fmt(totalMtd)} spent ({pctUsed.toFixed(1)}% of budget)
            </div>
          </div>

          {/* Per-service table */}
          {billingData.services && billingData.services.length > 0 ? (
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
                {billingData.services.map((svc, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '8px 8px 8px 0' }}>{svc.service}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{fmt(svc.mtd_spend)}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{fmt(dayOfMonth > 0 ? svc.mtd_spend / dayOfMonth : 0)}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{fmt(dayOfMonth > 0 ? (svc.mtd_spend / dayOfMonth) * daysInMonth : 0)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid #ddd', fontWeight: '600' }}>
                  <td style={{ padding: '8px 8px 8px 0' }}>Total</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{fmt(totalMtd)}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>—</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <div style={{ padding: '16px', background: '#f8f8f8', borderRadius: '4px', color: '#555' }}>
              <p style={{ margin: 0 }}>No spend data found for tracked services.</p>
              {billingData.raw_sku_count != null && (
                <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#888' }}>
                  {billingData.raw_sku_count} SKUs returned by API — none matched Maps Platform or Vertex AI/Gemini.
                  {billingData.raw_sku_count === 0 && ' The SKUs endpoint may require additional API permissions.'}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
