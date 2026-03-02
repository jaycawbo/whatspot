import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const { query, lat, lon, radius_km } = await req.json();

        if (!query || !lat || !lon) {
            return Response.json({ 
                error: 'Missing required parameters: query, lat, lon' 
            }, { status: 400 });
        }

        const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
        if (!apiKey) {
            return Response.json({ 
                error: 'Google Places API key not configured' 
            }, { status: 500 });
        }

        const radius = (radius_km || 5) * 1000; // Convert km to meters
        
        // Use Text Search (New) for broader, more flexible query matching
        const url = 'https://places.googleapis.com/v1/places:searchText';
        
        const requestBody = {
            textQuery: query,
            maxResultCount: 20,
            locationBias: {
                circle: {
                    center: {
                        latitude: lat,
                        longitude: lon
                    },
                    radius: radius
                }
            }
        };

        console.log(`🔍 Google Places Text Search (New): "${query}" at (${lat}, ${lon}), radius: ${radius_km}km`);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask': 'places.id,places.name,places.displayName,places.formattedAddress,places.types,places.location,places.rating,places.userRatingCount,places.priceLevel,places.businessStatus'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('Google Places API (New) error:', errorData);
            return Response.json({ 
                success: false,
                error: `Google Places API error: ${response.status}` 
            }, { status: response.status });
        }

        const data = await response.json();

        const results = (data.places || []).map(place => {
            // Ensure place_id is always in full resource name format (places/PLACE_ID)
            let placeId = place.name;
            if (!placeId && place.id) {
                placeId = place.id.startsWith('places/') ? place.id : `places/${place.id}`;
            }
            
            return {
                place_id: placeId,
                name: place.displayName?.text || '',
                address: place.formattedAddress || '',
                types: place.types || [],
                lat: place.location?.latitude,
                lon: place.location?.longitude,
                rating: place.rating,
                user_ratings_total: place.userRatingCount,
                price_level: place.priceLevel,
                business_status: place.businessStatus
            };
        });

        console.log(`✅ Found ${results.length} venues from Google Places`);

        return Response.json({ 
            success: true,
            results: results,
            query: query
        });

    } catch (error) {
        console.error('Broad search error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});