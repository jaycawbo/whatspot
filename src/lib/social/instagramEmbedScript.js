// Loads Instagram's official embed.js at most once per session.
// The cached promise makes repeat calls (StrictMode double effects, route
// changes, several sections) share one <script> tag. A failure is cached
// too, so a blocked script never triggers a retry loop.

export const INSTAGRAM_EMBED_SCRIPT_SRC = 'https://www.instagram.com/embed.js';
const LOAD_TIMEOUT_MS = 8000;

let loadPromise = null;

function hasInstgrm() {
  return typeof window !== 'undefined' && typeof window.instgrm?.Embeds?.process === 'function';
}

export function loadInstagramEmbedScript() {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('No document'));
      return;
    }
    if (hasInstgrm()) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = INSTAGRAM_EMBED_SCRIPT_SRC;
    script.async = true;

    const timer = setTimeout(() => reject(new Error('Instagram embed script timed out')), LOAD_TIMEOUT_MS);

    script.onload = () => {
      clearTimeout(timer);
      // Content blockers sometimes serve an empty stub that "loads" fine
      if (hasInstgrm()) resolve();
      else reject(new Error('Instagram embed script loaded without instgrm'));
    };
    script.onerror = () => {
      clearTimeout(timer);
      reject(new Error('Instagram embed script failed to load'));
    };

    document.body.appendChild(script);
  });

  return loadPromise;
}

// Turns any unprocessed blockquote.instagram-media on the page into an iframe.
export function processInstagramEmbeds() {
  try {
    if (hasInstgrm()) window.instgrm.Embeds.process();
  } catch (err) {
    console.error('Instagram embed processing failed:', err);
  }
}

// Test-only: reset the cached promise between tests
export function __resetInstagramEmbedScriptForTests() {
  loadPromise = null;
}
