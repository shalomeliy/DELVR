import type { LatLng } from '../domain/types';

const ANDROID = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
const fixed = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

/** "רחוב זאב ז'בוטינסקי 3, רמת גן, 5252005" -> "זאב ז'בוטינסקי 3, רמת גן": what a person would type into Waze. */
export const wazeQuery = (address: string) => address
  .replace(/,\s*\d{5,7}\b/g, '').replace(/,\s*ישראל$/, '').replace(/^רחוב\s+/, '').replace(/\s+/g, ' ').trim();

// With both q and ll, Waze searches the address next to the point and navigates to it, so the arrival
// screen shows the street name. With ll alone it shows whatever road the point falls on ("כביש ללא שם").
const params = (p: LatLng, address?: string) =>
  `${address ? `q=${encodeURIComponent(wazeQuery(address))}&` : ''}ll=${encodeURIComponent(fixed(p))}&navigate=yes`;

/** Web link: opens the Waze app (or site) on the exact point, with the address as the search text. */
export const wazeWebUrl = (p: LatLng, address?: string) =>
  `https://waze.com/ul?${params(p, address)}&zoom=17`;

/**
 * On Android the web link can land on Waze's empty "לאן?" search screen. An intent link hands the
 * point straight to the Waze app and starts navigating; without Waze installed it falls back to the web link.
 */
export const wazeUrl = (p: LatLng, address?: string) => ANDROID
  ? `intent://?${params(p, address)}#Intent;scheme=waze;package=com.waze;S.browser_fallback_url=${encodeURIComponent(wazeWebUrl(p, address))};end`
  : wazeWebUrl(p, address);

export const googleMapsUrl = (p: LatLng) => `https://www.google.com/maps/dir/?api=1&destination=${fixed(p)}&travelmode=driving`;
