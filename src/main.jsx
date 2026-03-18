import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

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
  const newId = crypto.randomUUID();
  localStorage.setItem(ANON_ID_KEY, newId);
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
