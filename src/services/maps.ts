// Loads the Maps JavaScript API once, in Hebrew, for geocoding and the map view.
const KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined;

let loading: Promise<typeof google.maps> | null = null;

export const hasMapsKey = () => !!KEY;

export function loadMaps(): Promise<typeof google.maps> {
  if (window.google?.maps?.Geocoder) return Promise.resolve(window.google.maps);
  if (!KEY) return Promise.reject(new Error('חסר מפתח Google (VITE_GOOGLE_MAPS_KEY)'));
  loading ??= new Promise((resolve, reject) => {
    const w = window as unknown as Record<string, unknown>;
    w.__delvrMapsReady = () => resolve(window.google.maps);
    w.gm_authFailure = () => reject(new Error('Google דחה את המפתח'));
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}&language=he&region=IL&libraries=geometry&loading=async&callback=__delvrMapsReady`;
    s.async = true;
    s.onerror = () => { loading = null; reject(new Error('טעינת Google Maps נכשלה. בדוק את החיבור לאינטרנט')); };
    document.head.appendChild(s);
  });
  return loading;
}
