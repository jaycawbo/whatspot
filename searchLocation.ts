import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { query } = await req.json();
        
        if (!query || query.length < 2) {
            return Response.json({ success: true, suggestions: [] });
        }
        
        const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
        
        if (!apiKey) {
            return Response.json({ error: 'Google Places API key not configured' }, { status: 500 });
        }

        // Use Google Places (New) Autocomplete API
        const autocompleteUrl = `https://places.googleapis.com/v1/places:autocomplete`;
        
        const autocompleteResponse = await fetch(autocompleteUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat'
            },
            body: JSON.stringify({
                input: query,
                languageCode: 'en'
            })
        });
        
        if (!autocompleteResponse.ok) {
            const errorText = await autocompleteResponse.text();
            console.error(`❌ Google Places Autocomplete API error: ${autocompleteResponse.status}`, errorText);
            return Response.json({ error: 'Failed to fetch location suggestions' }, { status: autocompleteResponse.status });
        }
        
        const autocompleteData = await autocompleteResponse.json();

        // Return suggestions with place_id - lat/lon will be fetched only for the selected suggestion
        const suggestions = (autocompleteData.suggestions || []).slice(0, 5).map(s => ({
            display_name: s.placePrediction.text.text,
            full_name: s.placePrediction.structuredFormat.mainText.text + 
                              (s.placePrediction.structuredFormat.secondaryText?.text 
                                ? ', ' + s.placePrediction.structuredFormat.secondaryText.text 
                                : ''),
            place_id: s.placePrediction.placeId,
            lat: null,
            lon: null
        }));
        
        return Response.json({ success: true, suggestions });
        
    } catch (error) {
        console.error('Location search error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});