// Offline check of the spike with a fake Google: `node selftest.mjs`.
import { addresses, geocodeOne, routeByAddress, report } from './run.mjs';
const list = addresses();
const pt = (i) => ({ lat: 31.8 + i / 1000, lng: 34.75 });
const fakeGeo = async (url) => {
  const q = decodeURIComponent(url.match(/address=([^&]+)/)[1]); const i = list.indexOf(q);
  const noNum = !/\d/.test(q.split(',')[0]);
  return { json: async () => ({ status: 'OK', results: [{ formatted_address: q, partial_match: false, geometry: { location: pt(i) },
    address_components: [...(noNum ? [] : [{ long_name: '3', types: ['street_number'] }]), { long_name: q.split(',').at(-1).trim(), types: ['locality'] }] }] }) };
};
const fakeRoutes = async (_u, init) => {
  const b = JSON.parse(init.body); const n = b.intermediates.length; const order = [...Array(n).keys()].reverse();
  return { ok: true, json: async () => ({
    routes: [{ optimizedIntermediateWaypointIndex: order, duration: '1800s', distanceMeters: 9000, legs: [...order.map((i) => ({ endLocation: { latLng: { latitude: pt(i + 1).lat + 0.0002, longitude: pt(i + 1).lng } } })), {}] }],
    geocodingResults: { intermediates: b.intermediates.map((w, i) => ({ intermediateWaypointRequestIndex: i, type: /\d/.test(w.address.split(',')[0]) ? ['street_address'] : ['route'], partialMatch: false })) },
  }) };
};
const A = []; for (const q of list) A.push(await geocodeOne(q, 'x', fakeGeo));
const B = await routeByAddress(list, 'x', fakeRoutes);
const md = report(list, A, B, list.length);
console.log(md.split('\n').slice(0, 14).join('\n'));
if (!md.includes('הסכמה')) process.exit(1);
