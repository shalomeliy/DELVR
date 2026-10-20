import { useEffect, useRef } from 'react';
import type { LatLng } from '../domain/types';
import { loadMaps } from '../services/maps';

interface Props { start?: LatLng; points: LatLng[]; polyline?: string }

export function MapView({ start, points, polyline }: Props) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    const overlays: { setMap(m: google.maps.Map | null): void }[] = [];
    loadMaps().then((maps) => {
      if (cancelled || !el.current) return;
      const map = new maps.Map(el.current, { disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy' });
      const bounds = new maps.LatLngBounds();
      if (start) { overlays.push(new maps.Marker({ map, position: start, label: { text: 'S', color: '#fff' }, title: 'יציאה' })); bounds.extend(start); }
      points.forEach((p, i) => { overlays.push(new maps.Marker({ map, position: p, label: { text: String(i + 1), color: '#fff' } })); bounds.extend(p); });
      if (polyline && maps.geometry) {
        overlays.push(new maps.Polyline({ map, path: maps.geometry.encoding.decodePath(polyline), strokeColor: '#2563eb', strokeWeight: 4 }));
      }
      if (!bounds.isEmpty()) map.fitBounds(bounds, 32);
    }).catch(() => { /* the list still works without the map */ });
    return () => { cancelled = true; overlays.forEach((o) => o.setMap(null)); };
  }, [start, points, polyline]);
  return <div ref={el} className="map" aria-label="מפת המסלול" />;
}
