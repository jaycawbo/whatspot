Deno.serve(async (req) => {
    try {
        const { address, city_name } = await req.json();
        
        if (!address) {
            return Response.json({ error: 'address is required' }, { status: 400 });
        }
        
        const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
        
        if (!apiKey) {
            return Response.json({ error: 'Google Places API key not configured' }, { status: 500 });
        }

        // Clean up address - remove unit numbers and extra details
        let cleanAddress = address
            .replace(/\s+(Unit|Suite|Ste|Apt|#)\s+[A-Za-z0-9-]+/gi, '')
            .replace(/,\s*(Unit|Suite|Ste|Apt|#)[^,]*/gi, '');
        
        const strategies = [
            cleanAddress,
            cleanAddress.split(',').slice(0, 2).join(','),
            city_name ? `${cleanAddress.split(',')[0]}, ${city_name}` : null
        ].filter(Boolean);
        
        for (const query of strategies) {
            if (!query || query.trim() === '') continue;
            
            console.log(`🔍 Geocoding: "${query}"`);
            
            // Use Google Places Geocoding API (Old API)
            const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`;
            
            const response = await fetch(url);
            
            console.log(`📡 Geocoding API response status: ${response.status}`);
            
            if (!response.ok) {
                console.error(`❌ Google Geocoding API error: ${response.status}`);
                continue;
            }
            
            const data = await response.json();
            
            console.log(`📡 Geocoding API response:`, JSON.stringify(data).substring(0, 500));
            
            if (data.status === 'OK' && data.results && data.results.length > 0) {
                const location = data.results[0].geometry.location;
                console.log(`✅ Geocoded: [${location.lat}, ${location.lng}]`);
                return Response.json({
                    success: true,
                    lat: location.lat,
                    lon: location.lng
                });
            } else {
                console.warn(`⚠️ No results for: ${query}, status: ${data.status}`);
            }
        }
        
        console.warn(`❌ All geocoding strategies failed for: ${address}`);
        return Response.json({ success: false, error: 'Unable to geocode address' });
        
    } catch (error) {
        console.error('Geocoding error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});