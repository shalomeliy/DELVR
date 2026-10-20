import type { LatLng } from '../domain/types';

export const wazeUrl = (p: LatLng) => `https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes`;
export const googleMapsUrl = (p: LatLng) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=driving`;
