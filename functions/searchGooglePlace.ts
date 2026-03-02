import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    const { venue_name, lat, lon, city_name } = await req.json();
    
    if (!venue_name) {
        return Response.json({ error: 'venue_name is required' }, { status: 400 });
    }
    
    try {
        const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
        
        if (!apiKey) {
            return Response.json({ error: 'Google Places API key not configured' }, { status: 500 });
        }
        
        // Using Google Places API (New) - Text Search to find place_id
        const url = 'https://places.googleapis.com/v1/places:searchText';
        
        const requestBody = {
            textQuery: city_name ? `${venue_name} in ${city_name}` : venue_name,
            maxResultCount: 1
        };
        
        // Add location bias if coordinates are provided
        if (lat && lon) {
            requestBody.locationBias = {
                circle: {
                    center: {
                        latitude: lat,
                        longitude: lon
                    },
                    radius: 5000.0 // Search within 5km
                }
            };
        }
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.types'
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            const errorData = await response.text();
            console.error('Google Places Search API error:', errorData);
            return Response.json({ error: `Google Places Search API error: ${response.status}` }, { status: response.status });
        }
        
        const data = await response.json();
        
        if (!data.places || data.places.length === 0) {
            return Response.json({ error: 'Place not found' }, { status: 404 });
        }
        
        const place = data.places[0];
        
        // Ensure place_id is in full resource name format (places/PLACE_ID)
        let placeId = place.name;
        if (!placeId && place.id) {
            placeId = place.id.startsWith('places/') ? place.id : `places/${place.id}`;
        }
        
        return Response.json({ 
            success: true, 
            place_id: placeId,
            name: place.displayName?.text || venue_name,
            lat: place.location?.latitude || null,
            lon: place.location?.longitude || null,
            types: place.types || []
        });
        
    } catch (error) {
        console.error('Error searching for place:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});