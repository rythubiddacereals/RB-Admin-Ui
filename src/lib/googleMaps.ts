/**
 * Google Maps JavaScript API loader.
 *
 * Returns a singleton Promise that resolves to `google.maps` after the
 * Google Maps + Places library has finished loading. Subsequent calls
 * reuse the same Promise — the script is appended to <head> exactly
 * ONCE per page lifetime, even when many components ask for it.
 *
 * Failure modes surfaced:
 *   • Key missing in env (`VITE_GOOGLE_MAPS_API_KEY`) → rejects with a
 *     clear message so the caller can hide the picker UI.
 *   • Network / script-load failure → rejects with the error event.
 *   • `gm_authFailure` (Google rejected the key — wrong referrer
 *     restriction, billing missing, API not enabled) → rejects via the
 *     same singleton so retries don't pile up.
 *
 * Usage:
 *   const maps = await loadGoogleMaps();
 *   const map = new maps.Map(canvasEl, { center, zoom: 14 });
 */

// Minimal ambient declarations so we don't need @types/google.maps as a
// build dep. The actual maps SDK provides the real typings at runtime.
declare global {
  interface Window {
    google?: {
      maps?: unknown;
    };
    gm_authFailure?: () => void;
    __rythuMapsReady?: () => void;
  }
}

let mapsPromise: Promise<unknown> | null = null;

export function loadGoogleMaps(): Promise<unknown> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('loadGoogleMaps must be called in a browser context'));
  }
  if (window.google?.maps) {
    return Promise.resolve(window.google.maps);
  }
  if (mapsPromise) return mapsPromise;

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return Promise.reject(
      new Error(
        'VITE_GOOGLE_MAPS_API_KEY is not set. Add it to your .env file and restart the dev server.',
      ),
    );
  }

  mapsPromise = new Promise((resolve, reject) => {
    const settle = (kind: 'ok' | 'err', payloadOrErr?: unknown) => {
      // Detach the global hooks so a later success/error doesn't fire a
      // dead resolver/rejecter (and so a new singleton can replace this
      // one if needed).
      delete window.__rythuMapsReady;
      delete window.gm_authFailure;
      if (kind === 'ok') resolve(window.google?.maps);
      else reject(payloadOrErr instanceof Error ? payloadOrErr : new Error(String(payloadOrErr)));
    };

    window.__rythuMapsReady = () => settle('ok');
    window.gm_authFailure = () =>
      settle(
        'err',
        new Error(
          "Google rejected the Maps key. Check the GCP console: key is valid, " +
          'Maps JavaScript API + Places API are enabled, billing is on, and your host is in the HTTP-referrer restriction.',
        ),
      );

    const script = document.createElement('script');
    script.src =
      'https://maps.googleapis.com/maps/api/js' +
      `?key=${encodeURIComponent(apiKey)}` +
      '&libraries=places' +
      '&loading=async' +
      '&callback=__rythuMapsReady';
    script.async = true;
    script.defer = true;
    script.onerror = () =>
      settle(
        'err',
        new Error(
          'Failed to load the Google Maps script. Check the network connection and CSP rules.',
        ),
      );
    document.head.appendChild(script);
  });

  // If the singleton rejects, drop the cached Promise so subsequent
  // openings of the picker can retry (the user may have fixed their
  // env / restriction in the meantime).
  mapsPromise.catch(() => {
    mapsPromise = null;
  });

  return mapsPromise;
}

/** Convenience: true if the user has bothered to configure a key. */
export function isMapsKeyConfigured(): boolean {
  return Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim());
}
