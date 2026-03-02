import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Allow both authenticated and guest users for venue details
        const isAuthenticated = await base44.auth.isAuthenticated();

        const { place_id, fields } = await req.json();
        
        if (!place_id) {
            return Response.json({ error: 'place_id is required' }, { status: 400 });
        }
        
        // Default fields if none specified - optimized for cost
        // Note: 'id' is automatically included and shouldn't be in the field mask
        const requestedFields = fields || [
            'displayName',
            'formattedAddress',
            'location',
            'rating',
            'userRatingCount',
            'websiteUri',
            'nationalPhoneNumber',
            'currentOpeningHours',
            'priceLevel',
            'reviews'
        ];
        
        const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
        
        if (!apiKey) {
            return Response.json({ error: 'Google Places API key not configured' }, { status: 500 });
        }
        
        // Using Google Places API (New) - Place Details
        // Place ID format: places/ChIJ... (need to add 'places/' prefix if not present)
        const placeIdFormatted = place_id.startsWith('places/') ? place_id : `places/${place_id}`;
        const url = `https://places.googleapis.com/v1/${placeIdFormatted}`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask': requestedFields.map(f => f).join(',')
            }
        });
        
        if (!response.ok) {
            const errorData = await response.text();
            console.error('Google Places API error:', response.status, errorData);
            console.error('Requested fields:', requestedFields.join(','));
            console.error('Place ID:', place_id);
            return Response.json({ 
                error: `Google Places API error: ${response.status}`,
                details: errorData,
                requested_fields: requestedFields
            }, { status: response.status });
        }
        
        const data = await response.json();
        
        // Transform to match our existing data structure
        const transformed = {
            name: data.displayName?.text || '',
            address: data.formattedAddress || '',
            rating: data.rating || 0,
            review_count: data.userRatingCount || 0,
            website: data.websiteUri || null,
            phone: data.nationalPhoneNumber || null,
            price_level: data.priceLevel ? '$'.repeat(Math.min(data.priceLevel, 4)) : null,
            business_status: data.businessStatus || null,
            lat: data.location?.latitude || null,
            lon: data.location?.longitude || null,
            is_open_now: data.currentOpeningHours?.openNow || null,
            opening_hours: data.currentOpeningHours?.weekdayDescriptions || [],
            description: data.editorialSummary?.text || null,
            reviews: data.reviews ? data.reviews.map(review => ({
                author: review.authorAttribution?.displayName || 'Anonymous',
                rating: review.rating || 0,
                text: review.text?.text || '',
                time: review.publishTime || null
            })) : []
        };
        
        return Response.json({ success: true, data: transformed });
        
    } catch (error) {
        console.error('Error fetching place details:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});