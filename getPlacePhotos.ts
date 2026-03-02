import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Concurrency control helper
async function fetchWithConcurrency(items, fn, limit = 3) {
    const results = [];
    const queue = [...items];
    
    async function processNext() {
        if (queue.length === 0) return;
        const item = queue.shift();
        const result = await fn(item);
        results.push(result);
        await processNext();
    }
    
    await Promise.all(Array(limit).fill(null).map(() => processNext()));
    return results;
}

Deno.serve(async (req) => {
    const { place_id, max_photos = 4, debug = false } = await req.json();
    
    if (!place_id) {
        return Response.json({ error: 'place_id is required' }, { status: 400 });
    }
    
    // Debug data collection
    const debugInfo = {
        placeId: place_id,
        placeDetailsUrl: null,
        placeDetailsStatus: null,
        placeDetailsBodySnippet: null,
        photoMediaUrl: null,
        photoMediaStatus: null,
        photoMediaLocation: null
    };
    
    try {
        const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
        
        if (!apiKey) {
            return Response.json({ error: 'Google Places API key not configured' }, { status: 500 });
        }
        
        // Use place_id as-is (already in "places/ChIJ..." format)
        const placeResourceName = place_id;
        
        console.log('📸 GETPLACEPHOTOS - Incoming place_id:', place_id);
        
        // STEP A: Fetch Place Details (New) using GET with photos field
        const detailsUrl = `https://places.googleapis.com/v1/${placeResourceName}?fields=photos`;
        console.log('📸 GETPLACEPHOTOS - Place Details URL:', detailsUrl);
        debugInfo.placeDetailsUrl = detailsUrl;

        const detailsResponse = await fetch(detailsUrl, {
            method: 'GET',
            headers: {
                'X-Goog-Api-Key': apiKey
            }
        });

        console.log('📸 GETPLACEPHOTOS - Place Details Response Status:', detailsResponse.status);
        debugInfo.placeDetailsStatus = detailsResponse.status;

        const responseText = await detailsResponse.text();
        const bodySnippet = responseText.substring(0, 300);
        console.log('📸 GETPLACEPHOTOS - Response Body (first 300 chars):', bodySnippet);
        debugInfo.placeDetailsBodySnippet = bodySnippet;

        if (!detailsResponse.ok) {
            console.error('❌ GETPLACEPHOTOS - Place Details Error:', responseText);

            // Always return debug info on errors
            const errorResponse = {
                success: false,
                error: "Google Places API error",
                debug: {
                    googleRequestUrl: detailsUrl,
                    httpMethod: "GET",
                    status: detailsResponse.status,
                    responseBodySnippet: bodySnippet
                }
            };

            console.error('🐛 DEBUG INFO:', JSON.stringify(errorResponse.debug, null, 2));

            return Response.json(errorResponse, { status: 200 });
        }
        
        const data = JSON.parse(responseText);
        
        if (!data.photos || data.photos.length === 0) {
            console.log('⚠️ GETPLACEPHOTOS - No photos found for place');
            return Response.json({ success: true, photo_urls: [] });
        }
        
        console.log('📸 GETPLACEPHOTOS - Found', data.photos.length, 'photos');
        
        // STEP B: Extract Photo Resource Names (places/PLACE_ID/photos/PHOTO_ID)
        const photoResources = data.photos.slice(0, max_photos);
        if (photoResources.length > 0) {
            console.log('📸 GETPLACEPHOTOS - First photoName:', photoResources[0].name);
        }
        
        // STEP C: Fetch Photo Media (New) with concurrency control
        let isFirstPhoto = true;
        const photoUrls = await fetchWithConcurrency(
            photoResources,
            async (photo) => {
                const photoName = photo.name;
                const mediaUrl = `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=800`;
                
                // Log first photo details
                if (isFirstPhoto) {
                    console.log('📸 GETPLACEPHOTOS - First Photo Media URL:', mediaUrl);
                    debugInfo.photoMediaUrl = mediaUrl;
                    isFirstPhoto = false;
                }
                
                try {
                    const mediaResponse = await fetch(mediaUrl, {
                        method: 'GET',
                        headers: {
                            'X-Goog-Api-Key': apiKey
                        },
                        redirect: 'manual' // Handle 302 redirects manually
                    });
                    
                    // Log first photo media status
                    if (debugInfo.photoMediaStatus === null) {
                        console.log('📸 GETPLACEPHOTOS - First Photo Media Response Status:', mediaResponse.status);
                        debugInfo.photoMediaStatus = mediaResponse.status;
                    }
                    
                    // Handle 302 redirect - extract Location header
                    if (mediaResponse.status === 302 || mediaResponse.status === 301) {
                        const locationHeader = mediaResponse.headers.get('Location');
                        
                        // Log first photo location
                        if (debugInfo.photoMediaLocation === null) {
                            console.log('📸 GETPLACEPHOTOS - First Photo 302 Redirect Location:', locationHeader);
                            debugInfo.photoMediaLocation = locationHeader;
                        }
                        
                        if (locationHeader) {
                            return locationHeader;
                        }
                    }
                    
                    // Handle direct success
                    if (mediaResponse.ok) {
                        const imageUrl = mediaResponse.url;
                        return imageUrl;
                    }
                    
                    console.warn('⚠️ GETPLACEPHOTOS - Failed to fetch photo media:', mediaResponse.status);
                    return null;
                } catch (error) {
                    console.error('❌ GETPLACEPHOTOS - Error fetching photo media:', error.message);
                    return null;
                }
            },
            3 // Concurrency limit of 3
        );
        
        // Filter out any null results from failed photo fetches
        const validPhotoUrls = photoUrls.filter(url => url !== null);
        
        console.log('✅ GETPLACEPHOTOS - Successfully fetched', validPhotoUrls.length, 'photo URLs');
        
        return Response.json({ 
            success: true, 
            photo_urls: validPhotoUrls,
            ...(debug && { debug: debugInfo })
        });
        
    } catch (error) {
        console.error('❌ GETPLACEPHOTOS - Error fetching place photos:', error);
        
        const errorResponse = {
            success: false,
            error: "Google Places API error",
            debug: {
                googleRequestUrl: debugInfo.placeDetailsUrl || 'N/A',
                httpMethod: "GET",
                status: debugInfo.placeDetailsStatus || 'N/A',
                responseBodySnippet: debugInfo.placeDetailsBodySnippet || error.message,
                exceptionMessage: error.message
            }
        };
        
        console.error('🐛 DEBUG INFO:', JSON.stringify(errorResponse.debug, null, 2));
        
        return Response.json(errorResponse, { status: 200 });
    }
});