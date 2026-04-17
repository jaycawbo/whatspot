import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

// crypto.randomUUID() is unavailable on HTTP (non-secure context) — polyfill for local dev on mobile
if (!crypto.randomUUID) {
  crypto.randomUUID = () =>
    ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
      (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
    );
}

// Clear stale PWA/service worker caches so the current discovery-first app is served.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));

    if ('caches' in window) {
      const cacheKeys = await caches.keys();
      await Promise.all(
        cacheKeys
          .filter((key) => /workbox|vite-pwa|whatspot/i.test(key))
          .map((key) => caches.delete(key))
      );
    }
  });
}

// Persistent anonymous ID — survives across sessions until user signs in
const ANON_ID_KEY = 'whatspot_anon_id';
if (!localStorage.getItem(ANON_ID_KEY)) {
  const newId = crypto.randomUUID
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
  localStorage.setItem(ANON_ID_KEY, newId);
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
