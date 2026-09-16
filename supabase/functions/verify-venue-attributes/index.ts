/**
 * verify-venue-attributes
 *
 * Gemini Flash verification pass for attributes Places/Supabase data doesn't reliably
 * tag (byob, dog-friendly, wifi, outlets, quiet, "hidden gem" — see
 * _shared/obscureAttributes.ts). Called by searchOrchestrator.js after DB + Places
 * candidates are merged, only when the query's parsed constraints/vibe actually mention
 * one of these attributes — most searches never call this. Always a single batched call
 * covering every candidate venue, never one call per venue. See issue #331.
 *
 * Request:  { venues: Array<{ place_id: string, name: string, types?: string[], ai_description?: string | null }>, attributes: string[] }
 * Response: { verdicts: Array<{ place_id: string, matches: string[], unsure: string[] }> }
 */

import { corsHeaders, jsonResponse, errorResponse } from '../_shared/types.ts';
import { OBSCURE_ATTRIBUTES } from '../_shared/obscureAttributes.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const MAX_VENUES = 20;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { venues, attributes } = await req.json();

    const attributeKeys = (Array.isArray(attributes) ? attributes : []).filter((a: string) => OBSCURE_ATTRIBUTES[a]);
    const candidateVenues = (Array.isArray(venues) ? venues : []).slice(0, MAX_VENUES);

    // Cost safeguard: no attributes to check or nothing to check them against — skip
    // the Gemini call entirely rather than firing a no-op request.
    if (attributeKeys.length === 0 || candidateVenues.length === 0) {
      return jsonResponse({ verdicts: [] });
    }

    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');

    const attributeList = attributeKeys.map((key) => `- "${key}": ${OBSCURE_ATTRIBUTES[key]}`).join('\n');
    const venueList = candidateVenues
      .map((v: any, i: number) => `${i + 1}. place_id="${v.place_id}" name="${v.name}" types=${JSON.stringify(v.types ?? [])} description="${v.ai_description ?? ''}"`)
      .join('\n');

    const systemPrompt = `You verify specific attributes of venues for a local discovery app, using what you know about these real-world venues plus the details given.

For EVERY venue listed, and for EACH attribute below, decide:
- "match" — you're reasonably confident the venue has this attribute
- "no" — you're reasonably confident it does NOT
- "unsure" — you don't have enough reliable information either way

Attributes to check:
${attributeList}

Only mark "match" or "no" when you have real signal (the venue's known reputation, type, or description clearly supports it) — for anything you'd be guessing on, mark "unsure". Do not fabricate specifics.

Return a JSON object: { "verdicts": [ { "place_id": string, "matches": string[] (attribute keys marked "match"), "unsure": string[] (attribute keys marked "unsure") } ] } — one entry per venue, using the exact place_id given. Omit an attribute key entirely from both arrays only if you're marking it "no".`;

    const body = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: `Venues:\n${venueList}` }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 2000,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            verdicts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  place_id: { type: 'string' },
                  matches: { type: 'array', items: { type: 'string' } },
                  unsure: { type: 'array', items: { type: 'string' } },
                },
                required: ['place_id', 'matches', 'unsure'],
              },
            },
          },
          required: ['verdicts'],
        },
      },
    };

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    );

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`LLM error ${resp.status}: ${txt}`);
    }

    const data = await resp.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const parsed = JSON.parse(rawText);
    const verdicts = Array.isArray(parsed.verdicts) ? parsed.verdicts : [];

    console.log(`🔎 verify-venue-attributes: [${attributeKeys.join(', ')}] across ${candidateVenues.length} venues → ${verdicts.length} verdicts`);

    return jsonResponse({ verdicts });
  } catch (error: any) {
    console.error('❌ verify-venue-attributes error:', error);
    // Best-effort — callers treat a failure the same as "no verdicts" (keep venues as-is).
    return jsonResponse({ verdicts: [] });
  }
});
