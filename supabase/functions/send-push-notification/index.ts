// Triggered by Supabase Database Webhook on: requests UPDATE
// Dashboard setup: Database → Webhooks → New webhook
//   Table: requests, Events: UPDATE, HTTP method: POST
//   URL: <your project URL>/functions/v1/send-push-notification
//   HTTP headers: Authorization: Bearer <service role key>
//
// Required env vars (set in Supabase dashboard → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_CONTACT_EMAIL
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER  (SMS stubs — optional)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
}

type RequestStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'redeemed' | 'cancelled';

function buildNotification(
  newStatus: RequestStatus,
  oldStatus: RequestStatus,
  record: Record<string, unknown>
): { title: string; body: string; tag: string; requireInteraction: boolean } | null {
  switch (newStatus) {
    case 'accepted':
      return {
        title: 'Walk-in accepted!',
        body: 'Head over — your table is being held.',
        tag: `request-${record.id}`,
        requireInteraction: true,
      };
    case 'declined':
      return {
        title: 'Request declined',
        body: record.decline_comment
          ? `"${record.decline_comment}"`
          : 'The venue couldn\'t accommodate you right now.',
        tag: `request-${record.id}`,
        requireInteraction: false,
      };
    case 'expired':
      return {
        title: 'Request expired',
        body: 'No response in time — try another venue.',
        tag: `request-${record.id}`,
        requireInteraction: false,
      };
    case 'cancelled':
      if (oldStatus === 'accepted') {
        return {
          title: 'Hold expired',
          body: 'Your holding window closed — the venue has been notified.',
          tag: `request-${record.id}`,
          requireInteraction: false,
        };
      }
      return null;
    default:
      return null;
  }
}

async function sendSmsStub(
  toPhone: string,
  message: string,
): Promise<void> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const fromNumber = Deno.env.get('TWILIO_FROM_NUMBER');

  if (!accountSid || !authToken || !fromNumber) {
    console.log('Twilio not configured — SMS skipped:', message);
    return;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const creds = btoa(`${accountSid}:${authToken}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: toPhone, From: fromNumber, Body: message }),
  });

  if (!res.ok) {
    console.error('Twilio error:', await res.text());
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidContact = Deno.env.get('VAPID_CONTACT_EMAIL');

  if (!vapidPublic || !vapidPrivate || !vapidContact) {
    console.error('VAPID env vars not configured');
    return new Response('VAPID not configured', { status: 500 });
  }

  webpush.setVapidDetails(`mailto:${vapidContact}`, vapidPublic, vapidPrivate);

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  if (payload.type !== 'UPDATE' || !payload.record || !payload.old_record) {
    return new Response('Ignored', { status: 200 });
  }

  const record = payload.record;
  const oldRecord = payload.old_record;
  const newStatus = record.status as RequestStatus;
  const oldStatus = oldRecord.status as RequestStatus;

  if (newStatus === oldStatus) {
    return new Response('No status change', { status: 200 });
  }

  const notification = buildNotification(newStatus, oldStatus, record);
  if (!notification) {
    return new Response('No notification for this transition', { status: 200 });
  }

  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const dinerId = record.diner_id as string;

  // Fetch all push subscriptions for this diner
  const { data: subs, error: subsError } = await serviceClient
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', dinerId);

  if (subsError) {
    console.error('Failed to fetch subscriptions:', subsError.message);
    return new Response('DB error', { status: 500 });
  }

  const pushPayload = JSON.stringify({
    title: notification.title,
    body: notification.body,
    tag: notification.tag,
    requireInteraction: notification.requireInteraction,
    url: '/',
  });

  const pushResults = await Promise.allSettled(
    (subs ?? []).map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        pushPayload,
      )
    )
  );

  pushResults.forEach((r, i) => {
    if (r.status === 'rejected') console.error(`Push failed for sub ${i}:`, r.reason);
  });

  // SMS: opt-in only, accepted + 5-min holding warning (holding warning handled by separate cron)
  if (newStatus === 'accepted') {
    const { data: diner } = await serviceClient
      .from('diners')
      .select('phone, sms_opt_in')
      .eq('id', dinerId)
      .single();

    if (diner?.sms_opt_in && diner.phone) {
      await sendSmsStub(diner.phone, `WhatSpot: Your walk-in request was accepted! Head over now.`);
    }
  }

  return new Response(JSON.stringify({ sent: pushResults.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
