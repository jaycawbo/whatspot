import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Share2, MapPin, Star, Phone, Globe, Clock, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import HeartButton from '@/components/spots/HeartButton';
import { getAnonId } from '@/lib/identity';
import VenueImageCarousel from '@/components/venue/VenueImageCarousel';
import { supabase } from '@/integrations/supabase/client';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import { createPillMarker } from '@/components/map/createPillMarker';
import { useSpots } from '@/hooks/useSpots';
import 'leaflet/dist/leaflet.css';

export default function VenueDetails() {
  const { placeId } = useParams();
  const { spots } = useSpots();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  // Initial venue data from navigation state or URL params
  const navVenue = location.state?.venue;
  const initialVenue = navVenue || {
    name: searchParams.get('name') || '',
    address: searchParams.get('address') || '',
    lat: searchParams.get('lat') ? parseFloat(searchParams.get('lat')) : null,
    lon: searchParams.get('lon') ? parseFloat(searchParams.get('lon')) : null,
    lng: searchParams.get('lon') ? parseFloat(searchParams.get('lon')) : null,
    rating: searchParams.get('rating') ? parseFloat(searchParams.get('rating')) : null,
    place_id: placeId,
    google_place_id: placeId,
  };

  const [venue] = useState(initialVenue);
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [detailsError, setDetailsError] = useState(false);
  const [aiInsights, setAiInsights] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiFetched, setAiFetched] = useState(false);
  const aiTriggerRef = useRef(null);

  const [walkinScore, setWalkinScore] = useState(null);
  const [walkinLoading, setWalkinLoading] = useState(true);
  const [walkinReported, setWalkinReported] = useState(false);


  // Images: from nav state (image_urls) or single photo_url, or fetched
  const images = venue.image_urls?.length
    ? venue.image_urls
    : venue.photo_url
      ? [venue.photo_url]
      : [];

  const [photoUrls, setPhotoUrls] = useState(images);

  // Coordinates
  const lat = venue.lat || venue.latitude;
  const lon = venue.lon || venue.lng || venue.longitude;

  // Reasoning from recommend results
  const reasoning = venue.reasoning_explanation || venue.reasoning;

  // Descriptors
  const descriptors = venue.descriptors || [];

  // Fetch detailed info from google-places-details
  useEffect(() => {
    if (!placeId) return;
    const fetchDetails = async () => {
      setDetailsLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke('google-places-details', {
          body: { place_id: placeId },
        });
        if (error) throw error;
        if (data?.success) {
          setDetails(data.data);
          // TEMPORARILY DISABLED — get-place-photos triggers Enterprise photo SKU
          // if (photoUrls.length === 0) {
          //   fetchPhotos();
          // }
        }
      } catch (err) {
        console.error('Failed to fetch venue details:', err);
        setDetailsError(true);
      } finally {
        setDetailsLoading(false);
      }
    };

    // TEMPORARILY DISABLED — get-place-photos triggers Enterprise photo SKU
    // const fetchPhotos = async () => {
    //   try {
    //     const { data, error } = await supabase.functions.invoke('get-place-photos', {
    //       body: { place_id: placeId },
    //     });
    //     if (!error && data?.photo_urls?.length) {
    //       setPhotoUrls(data.photo_urls);
    //     }
    //   } catch (err) {
    //     console.error('Failed to fetch photos:', err);
    //   }
    // };

    fetchDetails();
  }, [placeId]);

  // Walk-in score fetch + already-reported check
  useEffect(() => {
    try {
      if (sessionStorage.getItem(`walkin_reported_${placeId}`) === 'true') setWalkinReported(true);
    } catch {}
    if (!placeId) { setWalkinLoading(false); return; }
    supabase.functions.invoke('get-walkin-score', { body: { placeId } })
      .then(({ data, error }) => {
        if (!error && data?.score != null) setWalkinScore(data);
      })
      .catch(() => {})
      .finally(() => setWalkinLoading(false));
  }, [placeId]);

  const handleWalkinReport = async (signalType) => {
    try {
      await supabase.from('walkin_signals').insert({
        venue_id: placeId,
        signal_type: signalType,
        anonymous_id: getAnonId(),
      });
    } catch (err) {
      console.error('Failed to submit walkin signal:', err);
    }
    setWalkinReported(true);
    try { sessionStorage.setItem(`walkin_reported_${placeId}`, 'true'); } catch {}
  };


  // Intersection Observer for AI insights lazy load
  useEffect(() => {
    if (!aiTriggerRef.current || aiFetched) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && details?.reviews?.length > 0 && !aiFetched) {
          setAiFetched(true);
          fetchAiInsights(details.reviews);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(aiTriggerRef.current);
    return () => observer.disconnect();
  }, [details, aiFetched]);

  const fetchAiInsights = async (reviews) => {
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('venue-ai-insights', {
        body: {
          place_id: placeId,
          venue_name: venue.name || details?.name || '',
          reviews: reviews.map(r => r.text).filter(Boolean),
        },
      });
      if (error) throw error;
      if (data) setAiInsights(data);
    } catch (err) {
      console.error('Failed to fetch AI insights:', err);
    } finally {
      setAiLoading(false);
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/venue/${placeId}?name=${encodeURIComponent(venue.name || '')}&lat=${lat || ''}&lon=${lon || ''}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copied!', description: 'Shareable link copied to clipboard.' });
    } catch {
      toast({ title: 'Could not copy link', variant: 'destructive' });
    }
  };

  const displayName = venue.name || details?.name || '';
  const displayAddress = venue.address || details?.address || '';
  const displayRating = venue.rating || details?.rating;
  const reviewCount = venue.review_count || details?.review_count;
  const priceLevel = venue.price_level || details?.price_level;
  const cuisineType = venue.cuisine_type;

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-50 flex items-center justify-between px-3 py-2 bg-background/90 backdrop-blur-sm border-b border-border">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={handleShare}>
            <Share2 className="h-4 w-4" />
          </Button>
          <HeartButton venue={{ ...venue, place_id: placeId, google_place_id: placeId }} size="md" />
        </div>
      </div>

      {/* Image carousel */}
      <VenueImageCarousel images={photoUrls} />

      {/* Core info */}
      <div className="px-4 pt-4 space-y-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">{displayName}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {displayRating && (
              <span className="flex items-center gap-0.5 text-sm font-medium text-foreground">
                <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                {displayRating}
                {reviewCount && <span className="text-muted-foreground font-normal">({reviewCount})</span>}
              </span>
            )}
            {priceLevel && <span className="text-sm text-muted-foreground">{priceLevel}</span>}
            {cuisineType && (
              <Badge variant="secondary" className="text-xs">{cuisineType}</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            {displayAddress}
          </p>
        </div>

        {/* Why this? */}
        {reasoning && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-3">
              <p className="text-xs font-semibold text-primary mb-1">💡 Why this?</p>
              <p className="text-sm text-foreground leading-relaxed">{reasoning}</p>
            </CardContent>
          </Card>
        )}

        {/* Descriptors */}
        {descriptors.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {descriptors.map((d) => (
              <Badge key={d} variant="secondary" className="text-xs">{d}</Badge>
            ))}
          </div>
        )}

        {/* Walk-In Friendly */}
        {walkinLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-2 w-full rounded-full" />
            <Skeleton className="h-4 w-40" />
          </div>
        ) : walkinScore ? (
          <Card>
            <CardContent className="p-3 space-y-2">
              <p className="text-xs font-semibold text-foreground">🚶 Walk-In Friendly</p>
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className="h-2 rounded-full transition-all"
                  style={{
                    width: `${walkinScore.score}%`,
                    background: walkinScore.score >= 70 ? '#22c55e' : walkinScore.score >= 40 ? '#f59e0b' : '#ef4444',
                  }}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{walkinScore.label}</span>
                <span className="text-xs text-muted-foreground">{walkinScore.score} / 100</span>
              </div>
              {walkinScore.signal_count > 0 && (
                <p className="text-xs text-muted-foreground">
                  Based on {walkinScore.signal_count} recent report{walkinScore.signal_count !== 1 ? 's' : ''}
                </p>
              )}
              {walkinReported ? (
                <p className="text-xs text-muted-foreground text-center pt-1">Thanks for the report</p>
              ) : (
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => handleWalkinReport('got_in')}>
                    Got in ✓
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => handleWalkinReport('turned_away')}>
                    Turned away ✗
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}


        {/* Contact & hours — progressive load */}
        <div className="space-y-2">
          {detailsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-56" />
            </div>
          ) : detailsError ? (
            <p className="text-sm text-muted-foreground">Hours and contact info unavailable right now.</p>
          ) : details ? (
            <>
              {details.phone && (
                <a href={`tel:${details.phone}`} className="flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  {details.phone}
                </a>
              )}
              {details.website && (
                <a href={details.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  Visit website
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {details.opening_hours?.length > 0 && (
                <details className="group">
                  <summary className="flex items-center gap-2 text-sm text-foreground cursor-pointer list-none">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>Opening hours</span>
                    <span className="text-xs text-muted-foreground group-open:hidden">▸</span>
                    <span className="text-xs text-muted-foreground hidden group-open:inline">▾</span>
                  </summary>
                  <ul className="mt-1 ml-6 space-y-0.5">
                    {details.opening_hours.map((line, i) => (
                      <li key={i} className="text-xs text-muted-foreground">{line}</li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          ) : null}
        </div>

        {/* Leaflet Map */}
        {lat && lon && (
          <div className="rounded-xl overflow-hidden border border-border" style={{ height: 200 }}>
            <MapContainer
              center={[lat, lon]}
              zoom={15}
              scrollWheelZoom={false}
              dragging={false}
              style={{ height: '100%', width: '100%' }}
              attributionControl={false}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              />
              <Marker position={[lat, lon]} icon={createPillMarker(venue, {
                spotsIds: new Set(spots.map(s => s.google_place_id)),
                favIds: new Set(spots.filter(s => s.labels?.includes('Favourites')).map(s => s.google_place_id)),
              })} />
            </MapContainer>
          </div>
        )}

        {/* Google Reviews */}
        {!detailsLoading && details?.reviews?.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">Reviews</h2>
            {details.reviews.slice(0, 5).map((review, i) => (
              <Card key={i}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-foreground">{review.author}</span>
                    <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      {review.rating}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">{review.text}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* AI Insights trigger + sections */}
        <div ref={aiTriggerRef} className="pt-2">
          {(aiLoading || aiInsights) && (
            <div className="space-y-4">
              {/* What People Say */}
              <div>
                <h2 className="text-base font-semibold text-foreground mb-2">💬 What People Say</h2>
                {aiLoading && !aiInsights ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-4/6" />
                  </div>
                ) : aiInsights?.review_summary ? (
                  <Card>
                    <CardContent className="p-3">
                      <p className="text-sm text-foreground leading-relaxed">{aiInsights.review_summary}</p>
                    </CardContent>
                  </Card>
                ) : null}
              </div>

              {/* What to Order */}
              <div>
                <h2 className="text-base font-semibold text-foreground mb-2">🍽️ What to Order</h2>
                {aiLoading && !aiInsights ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-44" />
                  </div>
                ) : aiInsights?.recommended_items?.length > 0 ? (
                  <Card>
                    <CardContent className="p-3">
                      <ul className="space-y-1.5">
                        {aiInsights.recommended_items.map((item, i) => (
                          <li key={i} className="text-sm text-foreground flex items-start gap-2">
                            <span className="text-muted-foreground">•</span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
