import { supabase } from '@/integrations/supabase/client';
import { routeVenueRequest } from '@/services/venueDataRouter';

function readAndClearBypass() {
  try {
    const val = sessionStorage.getItem('ws_bypass_correction') === 'true';
    if (val) sessionStorage.removeItem('ws_bypass_correction');
    return val;
  } catch {
    return false;
  }
}

function writeCorrectionInfo(info) {
  try {
    if (info?.correctionApplied) {
      sessionStorage.setItem('ws_correction_info', JSON.stringify(info));
    } else {
      sessionStorage.removeItem('ws_correction_info');
    }
  } catch {}
}

export async function recommend(params) {
  const bypassCorrection = readAndClearBypass();

  // Route through data router first.
  // In db_only mode this returns a DB result with correction_info; in live_fallback it returns null.
  const routed = await routeVenueRequest({ ...params, bypassCorrection });
  if (routed !== null) {
    writeCorrectionInfo(routed.correction_info);
    return routed;
  }

  // live_fallback: call refine-query pre-flight for autocorrect, then hit the recommend edge function.
  let queryToUse = params.query;
  if (params.query && !bypassCorrection) {
    try {
      const { data: corrData } = await supabase.functions.invoke('refine-query', {
        body: { query: params.query, locationName: params.location_name || '' },
      });
      if (corrData?.correction_applied && corrData?.corrected_query) {
        queryToUse = corrData.corrected_query;
        writeCorrectionInfo({
          correctedQuery: corrData.corrected_query,
          rawQuery: params.query,
          correctionApplied: true,
        });
      } else {
        writeCorrectionInfo(null);
      }
    } catch {
      writeCorrectionInfo(null);
    }
  } else {
    writeCorrectionInfo(null);
  }

  const { session_context, ...rest } = { ...params, query: queryToUse };
  const { data, error } = await supabase.functions.invoke('recommend', {
    body: { ...rest, session_context: session_context || [] },
  });
  if (error) throw error;
  return data;
}

export async function recommendPage() {
  return { results: [], pagination: { has_more: false } };
}
