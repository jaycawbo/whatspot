const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = 'WhatSpot/1.0';

function buildNominatimLabel(address) {
  if (!address) return 'Current Location';
  const city = address.city || address.town || address.county;
  const state = address.state;
  const country = address.country;
  return [city, state, country].filter(Boolean).join(', ') || 'Current Location';
}

export async function reverseGeocode(lat, lon) {
  const res = await fetch(`${NOMINATIM_URL}?lat=${lat}&lon=${lon}&format=json`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const data = await res.json();
  return buildNominatimLabel(data.address);
}
