import { useEffect, useRef } from 'react';
import type { LatLng } from '../domain/types';
import { loadMaps } from '../services/maps';

export interface MapPoint extends LatLng { label: string; status: 'todo' | 'delivered' | 'pasted' | 'failed' }
interface Props { start?: LatLng; points: MapPoint[]; polyline?: string }

const COLOR = { todo: '#1d4ed8', delivered: '#15803d', pasted: '#b45309', failed: '#b91c1c' };

export function MapView({ start, points, polyline }: Props) {
  const el = useRef<HTMLDivElement>(null);
  // Google bills every new Map as a map load, so the screen keeps one map and only redraws its overlays.
  const map = useRef<google.maps.Map | null>(null);
  // The props are fresh arrays on every render (a delivery tap, a notice). Compare by value so those
  // renders do not redraw the map or reset the courier's zoom.
  const drawn = JSON.stringify([start, points, polyline]);
  useEffect(() => {
    const [s, pts, line] = JSON.parse(drawn) as [LatLng | undefined, MapPoint[], string | undefined];
    let cancelled = false;
    const overlays: { setMap(m: google.maps.Map | null): void }[] = [];
    loadMaps().then((maps) => {
      if (cancelled || !el.current) return;
      map.current ??= new maps.Map(el.current, { disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy' });
      const m = map.current;
      const bounds = new maps.LatLngBounds();
      const pin = (color: string) => ({ path: maps.SymbolPath.CIRCLE, scale: 13, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 });
      if (s) { overlays.push(new maps.Marker({ map: m, position: s, icon: pin('#111827'), label: { text: 'S', color: '#fff', fontWeight: '700' }, title: 'יציאה', zIndex: 1 })); bounds.extend(s); }
      // Each stop shows its number in the list, colored by what happened there.
      pts.forEach((p) => {
        overlays.push(new maps.Marker({ map: m, position: { lat: p.lat, lng: p.lng }, icon: pin(COLOR[p.status]), label: { text: p.label, color: '#fff', fontWeight: '700' }, zIndex: p.status === 'todo' ? 3 : 2 }));
        bounds.extend(p);
      });
      if (line && maps.geometry) {
        overlays.push(new maps.Polyline({ map: m, path: maps.geometry.encoding.decodePath(line), strokeColor: '#2563eb', strokeWeight: 4 }));
      }
      if (!bounds.isEmpty()) m.fitBounds(bounds, 32);
    }).catch(() => { /* the list still works without the map */ });
    return () => { cancelled = true; overlays.forEach((o) => o.setMap(null)); };
  }, [drawn]);
  return <div ref={el} className="map" aria-label="מפת המסלול" />;
}
