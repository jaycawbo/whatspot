const corsHeaders = {
  'Access-Control-Allow-Origin': 'http://localhost:8081',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MONTHLY_BUDGET_USD = 20;

const SERVICE_FILTERS: Record<string, string> = {
  'Maps Platform': 'Google Maps Platform',
  'Vertex AI': 'Vertex AI',
  'Gemini': 'Gemini',
};

async function getAccessToken(serviceAccount: Record<string, string>): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-billing.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const signingInput = `${encode(header)}.${encode(payload)}`;

  const pemContents = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '');

  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${signingInput}.${signatureB64}`;
}

async function exchangeJwtForToken(jwt: string): Promise<string> {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`OAuth token exchange failed: ${err}`);
  }

  const { access_token } = await tokenRes.json();
  return access_token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const credentialsRaw = Deno.env.get('GOOGLE_BILLING_SERVICE_ACCOUNT');
    if (!credentialsRaw) {
      return new Response(JSON.stringify({ error: 'Billing credentials not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const billingAccountId = Deno.env.get('GOOGLE_BILLING_ACCOUNT_ID');
    if (!billingAccountId) {
      return new Response(JSON.stringify({ error: 'GOOGLE_BILLING_ACCOUNT_ID not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceAccount = JSON.parse(credentialsRaw);
    const jwt = await getAccessToken(serviceAccount);
    const accessToken = await exchangeJwtForToken(jwt);

    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const day = now.getUTCDate();
    const daysInMonth = new Date(year, month, 0).getDate();

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // Fetch spend data from Cloud Billing API v1beta
    const url = `https://cloudbilling.googleapis.com/v1beta/billingAccounts/${billingAccountId}/skus`;
    const skusRes = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!skusRes.ok) {
      const err = await skusRes.text();
      console.error('Cloud Billing API error:', skusRes.status, err);
      return new Response(
        JSON.stringify({
          error: `Cloud Billing API error: ${skusRes.status}`,
          detail: err,
        }),
        { status: skusRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const skusData = await skusRes.json();
    const skus: Array<Record<string, unknown>> = skusData.skus ?? [];

    // Group SKUs by service and sum any cost data present
    const serviceSpend: Record<string, number> = {};

    for (const sku of skus) {
      const serviceDisplay = String((sku.category as Record<string, unknown>)?.serviceDisplayName ?? '');
      const matchedLabel = Object.keys(SERVICE_FILTERS).find((label) =>
        serviceDisplay.includes(SERVICE_FILTERS[label]) || serviceDisplay.includes(label),
      );
      if (!matchedLabel) continue;

      // Extract cost units if present (v1beta may include cost data per SKU)
      const cost = (sku.cost as Record<string, unknown>);
      const units = Number(cost?.units ?? 0);
      const nanos = Number((cost as Record<string, unknown>)?.nanos ?? 0);
      const totalUsd = units + nanos / 1e9;

      serviceSpend[matchedLabel] = (serviceSpend[matchedLabel] ?? 0) + totalUsd;
    }

    // Build per-service rows with computed fields
    const services = Object.entries(serviceSpend).map(([label, mtd]) => {
      const dailyAvg = day > 0 ? mtd / day : 0;
      const projected = dailyAvg * daysInMonth;
      return {
        service_name: label,
        mtd_spend_usd: Number(mtd.toFixed(4)),
        currency: 'USD',
        budget_usd: MONTHLY_BUDGET_USD,
        remaining_usd: Number((MONTHLY_BUDGET_USD - mtd).toFixed(4)),
        days_elapsed: day,
        daily_average_usd: Number(dailyAvg.toFixed(4)),
        projected_month_end_usd: Number(projected.toFixed(4)),
      };
    });

    const totalMtd = services.reduce((sum, s) => sum + s.mtd_spend_usd, 0);

    return new Response(
      JSON.stringify({
        status: 'ok',
        billing_account: billingAccountId,
        period: { start: startDate, end: endDate },
        budget_usd: MONTHLY_BUDGET_USD,
        total_mtd_spend_usd: Number(totalMtd.toFixed(4)),
        total_remaining_usd: Number((MONTHLY_BUDGET_USD - totalMtd).toFixed(4)),
        days_elapsed: day,
        days_in_month: daysInMonth,
        services,
        raw_sku_count: skus.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('get-billing-data error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
