import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/integrations/supabase/client';

const ALLOWED_EMAILS = ['jake.k.shipman@gmail.com', 'jshipper2@gmail.com'];

export default function Credits() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const isAllowed = user && ALLOWED_EMAILS.includes(user.email);

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

  useEffect(() => {
    if (isAllowed) fetchBillingData();
  }, [isAllowed, fetchBillingData]);

  if (!isAllowed) return null;

  return (
    <div style={{ padding: '32px', maxWidth: '640px', margin: '0 auto', fontFamily: 'monospace' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: '600', margin: 0 }}>Cloud Spend</h1>
        <button
          onClick={fetchBillingData}
          disabled={loading}
          style={{
            padding: '6px 14px',
            fontSize: '13px',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {lastRefreshed && (
        <p style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>
          Last refreshed: {lastRefreshed.toLocaleTimeString()}
        </p>
      )}

      {error && (
        <div style={{ padding: '12px', background: '#fee', border: '1px solid #fcc', borderRadius: '4px', marginBottom: '16px', fontSize: '13px', color: '#900' }}>
          Error: {error}
        </div>
      )}

      {loading && !data && (
        <p style={{ fontSize: '14px', color: '#666' }}>Loading billing data...</p>
      )}

      {data && (
        <>
          <p style={{ fontSize: '12px', color: '#888', marginBottom: '12px' }}>
            Billing account: {data.billing_account} &nbsp;|&nbsp; Period: {data.period?.start} to {data.period?.end}
          </p>

          {data.services && data.services.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left' }}>
                  <th style={{ padding: '8px 4px' }}>Service</th>
                  <th style={{ padding: '8px 4px', textAlign: 'right' }}>MTD Spend</th>
                </tr>
              </thead>
              <tbody>
                {data.services.map((svc, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '8px 4px' }}>{svc.service}</td>
                    <td style={{ padding: '8px 4px', textAlign: 'right' }}>
                      {svc.last_period_spend
                        ? `${svc.currency ?? 'USD'} ${Number(svc.last_period_spend?.units ?? 0).toFixed(2)}`
                        : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ fontSize: '14px', color: '#666' }}>
              {data.message ?? 'No tracked services found. Ensure billing budgets are configured in Google Cloud Console.'}
            </p>
          )}

          {data.status === 'auth_ok' && (
            <p style={{ fontSize: '12px', color: '#888', marginTop: '12px' }}>
              Service account authenticated successfully. Raw budgets found: {data.raw_budget_count ?? 0}
            </p>
          )}
        </>
      )}
    </div>
  );
}
