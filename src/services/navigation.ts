import type { LatLng } from '../domain/types';

const ANDROID = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
const fixed = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

/** Web link: opens the Waze app (or site) on the exact point, with the address as the search text. */
export const wazeWebUrl = (p: LatLng, address?: string) =>
  `https://waze.com/ul?ll=${encodeURIComponent(fixed(p))}&navigate=yes&zoom=17${address ? `&q=${encodeURIComponent(address)}` : ''}`;

/**
 * On Android the web link can land on Waze's empty "לאן?" search screen. An intent link hands the
 * point straight to the Waze app and starts navigating; without Waze installed it falls back to the web link.
 */
export const wazeUrl = (p: LatLng, address?: string) => ANDROID
  ? `intent://?ll=${encodeURIComponent(fixed(p))}&navigate=yes#Intent;scheme=waze;package=com.waze;S.browser_fallback_url=${encodeURIComponent(wazeWebUrl(p, address))};end`
  : wazeWebUrl(p, address);

export const googleMapsUrl = (p: LatLng) => `https://www.google.com/maps/dir/?api=1&destination=${fixed(p)}&travelmode=driving`;
