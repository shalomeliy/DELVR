import { useEffect, useRef } from 'react';
import type { LatLng } from '../domain/types';
import { loadMaps } from '../services/maps';

export interface MapPoint extends LatLng { label: string; status: 'todo' | 'delivered' | 'pasted' | 'failed' }
interface Props {
  start?: LatLng; points: MapPoint[]; polyline?: string;
  /** Company mode: the dark design and its status colors. */
  dark?: boolean;
  /** Where the courier made the last mark, shown as a lime dot. */
  here?: LatLng;
}

// Dark map for company mode, matching the design: navy land, muted roads, no business pins.
const DARK: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#0F1522' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8B97AD' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0A0E17' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1F2838' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2B3850' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#070A12' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#2B3850' }] },
];
const DARK_COLOR = { todo: '#2B3850', delivered: '#34D399', pasted: '#FBBF24', failed: '#FB7185' };
const DARK_TEXT = { todo: '#EEF2F8', delivered: '#052E1C', pasted: '#3A2A02', failed: '#3B0712' };
/** Shown until there is a point to fit: central Israel. */
const HOME = { lat: 31.95, lng: 34.8 };

const COLOR = { todo: '#1d4ed8', delivered: '#15803d', pasted: '#b45309', failed: '#b91c1c' };

export function MapView({ start, points, polyline, dark, here }: Props) {
  const el = useRef<HTMLDivElement>(null);
  // Google bills every new Map as a map load, so the screen keeps one map and only redraws its overlays.
  const map = useRef<google.maps.Map | null>(null);
  // The props are fresh arrays on every render (a delivery tap, a notice). Compare by value so those
  // renders do not redraw the map or reset the courier's zoom.
  const drawn = JSON.stringify([start, points, polyline, !!dark, here]);
  useEffect(() => {
    const [s, pts, line, dk, me] = JSON.parse(drawn) as [LatLng | undefined, MapPoint[], string | undefined, boolean, LatLng | undefined];
    let cancelled = false;
    const overlays: { setMap(m: google.maps.Map | null): void }[] = [];
    loadMaps().then((maps) => {
      if (cancelled || !el.current) return;
      map.current ??= new maps.Map(el.current, { disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy', center: HOME, zoom: 10, ...(dk ? { styles: DARK, backgroundColor: '#0F1522' } : {}) });
      const m = map.current;
      const bounds = new maps.LatLngBounds();
      const pin = (color: string) => ({ path: maps.SymbolPath.CIRCLE, scale: 13, fillColor: color, fillOpacity: 1, strokeColor: dk ? '#0A0E17' : '#fff', strokeWeight: 2 });
      if (s) { overlays.push(new maps.Marker({ map: m, position: s, icon: pin(dk ? '#EEF2F8' : '#111827'), label: { text: 'S', color: dk ? '#0A0E17' : '#fff', fontWeight: '700' }, title: 'יציאה', zIndex: 1 })); bounds.extend(s); }
      // Each stop shows its number in the list, colored by what happened there.
      pts.forEach((p) => {
        overlays.push(new maps.Marker({ map: m, position: { lat: p.lat, lng: p.lng }, icon: pin((dk ? DARK_COLOR : COLOR)[p.status]), label: { text: p.label, color: dk ? DARK_TEXT[p.status] : '#fff', fontWeight: '700' }, zIndex: p.status === 'todo' ? 3 : 2 }));
        bounds.extend(p);
      });
      if (line && maps.geometry) {
        overlays.push(new maps.Polyline({ map: m, path: maps.geometry.encoding.decodePath(line), strokeColor: dk ? '#C8F560' : '#2563eb', strokeOpacity: dk ? 0.85 : 1, strokeWeight: dk ? 5 : 4 }));
      }
      if (me) overlays.push(new maps.Marker({ map: m, position: me, title: 'הסימון האחרון', zIndex: 5,
        icon: { path: maps.SymbolPath.CIRCLE, scale: 9, fillColor: '#C8F560', fillOpacity: 1, strokeColor: '#0A0E17', strokeWeight: 4 } }));
      if (!bounds.isEmpty()) m.fitBounds(bounds, 32);
    }).catch(() => { /* the list still works without the map */ });
    return () => { cancelled = true; overlays.forEach((o) => o.setMap(null)); };
  }, [drawn]);
  return <div ref={el} className="map" aria-label="מפת המסלול" />;
}
