// Building a route before it is sorted: adding stops, checking them with Google, fixing them, the start and end,
// and the sort itself. Shared by the solo app and the company admin's planner, so both behave the same.
import { useCallback, useEffect, useRef, useState } from 'react';
import { addStops, findDuplicate, startCity, stopsFromText, updateStop } from '../domain/plan';
import { parseTranscript } from '../domain/parser.js';
import type { Place, Plan, Stop } from '../domain/types';
import { MAX_STOPS } from '../domain/types';
import { geocode, reverseGeocode } from '../services/geocode';
import { logError, logInfo } from '../services/log';
import { optimizePlan, type OptimizeOptions } from '../services/optimize';
import { isFresh, recall, remember } from '../store/db';

export interface PlanStorage {
  load: () => Promise<Plan | undefined>;
  save: (plan: Plan) => unknown;
  empty: () => Plan;
}

export function usePlanEditor(storage: PlanStorage, optimizeOptions?: () => OptimizeOptions) {
  const [plan, setPlanState] = useState<Plan | null>(null);
  const [error, setErrorState] = useState('');
  const setError = useCallback((msg: string) => { if (msg) logError('shown_error', msg); setErrorState(msg); }, []);
  const [notice, setNotice] = useState('');
  const [optimizing, setOptimizing] = useState(false);
  const [sortError, setSortError] = useState('');
  const planRef = useRef<Plan | null>(null);
  const started = useRef(false);
  const store = useRef(storage);
  store.current = storage;

  const setPlan = useCallback((fn: (p: Plan) => Plan) => {
    setPlanState((prev) => {
      const next = fn(prev ?? store.current.empty());
      planRef.current = next;
      store.current.save(next);
      return next;
    });
  }, []);

  // A new storage (the admin picked another courier or day) loads that plan.
  const { load } = storage;
  useEffect(() => {
    let live = true;
    setPlanState(null); planRef.current = null; started.current = false;
    load().then((p) => { if (!live) return; const v = p ?? store.current.empty(); planRef.current = v; setPlanState(v); });
    return () => { live = false; };
  }, [load]);

  // Verify one stop: addresses this device already knows first (free), then Google.
  const verifyStop = useCallback(async (stop: Stop) => {
    const mem = await recall(stop.input);
    if (mem && isFresh(mem)) { setPlan((p) => updateStop(p, stop.id, { verify: 'ok', address: mem.address, location: mem.location, fixReason: undefined })); return; }
    try {
      // An expired entry still knows which address was meant, so Google is asked about that one.
      const r = await geocode(mem?.address ?? stop.input, stop.city);
      setPlan((p) => updateStop(p, stop.id, r.ok
        ? { verify: 'ok', address: r.address, location: r.location, fixReason: undefined }
        : { verify: 'needs_fix', fixReason: r.reason, address: r.address, location: r.location }));
      // Every confirmed address is kept, so a street delivered to again costs no Google call.
      if (r.ok) {
        remember(stop.input, { address: r.address, location: r.location });
        if (stop.spoken !== stop.input) remember(stop.spoken, { address: r.address, location: r.location });
      }
    } catch (e) {
      setPlan((p) => updateStop(p, stop.id, { verify: 'needs_fix', fixReason: (e as Error).message }));
      setError((e as Error).message);
    }
  }, [setPlan, setError]);

  // Two stops Google placed at the same spot are one delivery: keep the first, drop the rest.
  useEffect(() => {
    if (!plan) return;
    const dups = plan.stops.filter((s) => s.verify === 'ok' && findDuplicate({ ...plan, stops: plan.stops.slice(0, plan.stops.indexOf(s)) }, s));
    if (!dups.length) return;
    const ids = new Set(dups.map((d) => d.id));
    setPlan((p) => ({ ...p, stops: p.stops.filter((s) => !ids.has(s.id)), optimized: undefined }));
    setNotice(`${dups.length === 1 ? 'כתובת כפולה הוסרה' : `${dups.length} כתובות כפולות הוסרו`}: ${dups.map((d) => d.address ?? d.input).join(', ')}`);
    logInfo('duplicates_removed', dups.map((d) => d.address ?? d.input));
  }, [plan, setPlan]);

  // Re-check anything left pending (for example after a reload mid-verification).
  useEffect(() => {
    if (!plan || started.current) return;
    started.current = true;
    plan.stops.filter((s) => s.verify === 'pending').forEach(verifyStop);
  }, [plan, verifyStop]);

  const verifyPlace = async (which: 'start' | 'end', input: string) => {
    setError('');
    try {
      // The start address repeats every day, so it is looked up in this device's memory first.
      const mem = await recall(input);
      const city = parseTranscript(input)[0]?.city ?? null;
      const r = mem && isFresh(mem) ? { ok: true, ...mem } : await geocode(input, city);
      if (!r.location) { setError(`לא מצאתי את "${input}". נסה לכתוב רחוב, מספר ועיר`); return; }
      if (r.ok && r.address && !(mem && isFresh(mem))) remember(input, { address: r.address, location: r.location });
      const place: Place = { input, address: r.address, location: r.location };
      logInfo('place_set', { which, input, address: r.address });
      setPlan((p) => (which === 'start' ? { ...p, start: place, optimized: undefined } : { ...p, end: place, optimized: undefined }));
    } catch (e) { setError((e as Error).message); }
  };

  const useHere = () => new Promise<void>((resolve) => {
    setError('');
    if (!navigator.geolocation) { setError('הדפדפן לא תומך באיתור מיקום'); resolve(); return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const address = await reverseGeocode(location).catch(() => undefined);
      setPlan((p) => ({ ...p, start: { input: address ?? 'המיקום שלי', address: address ?? 'המיקום שלי', location }, optimized: undefined }));
      resolve();
    }, (err) => { setError(err.code === 1 ? 'אין הרשאה למיקום. אשר גישה בדפדפן' : 'לא הצלחתי לאתר מיקום'); resolve(); }, { enableHighAccuracy: true, timeout: 15000 });
  });

  const onAdd = (text: string) => {
    const current = planRef.current;
    if (!current) return;
    setError(''); setNotice('');
    const fresh = stopsFromText(text, startCity(current));
    logInfo('add_stops', { text, startCity: startCity(current), parsed: fresh.map((f) => f.input) });
    if (!fresh.length) { setError('לא זיהיתי כתובות בטקסט'); return; }
    const { plan: next, dropped, duplicates, droppedInputs, duplicateInputs } = addStops(current, fresh);
    setPlan(() => next);
    const notes = [];
    if (duplicates) notes.push(`${duplicates === 1 ? 'כתובת אחת לא נוספה כי היא כבר ברשימה' : `${duplicates} כתובות לא נוספו כי הן כבר ברשימה`}: ${duplicateInputs.join(' · ')}`);
    if (dropped) notes.push(`${dropped === 1 ? 'כתובת אחת לא נוספה' : `${dropped} כתובות לא נוספו`} כי אפשר עד ${MAX_STOPS} עצירות בגרסה הזו: ${droppedInputs.join(' · ')}`);
    if (notes.length) setNotice(notes.join('. '));
    if (duplicates) logInfo('duplicates_skipped', duplicateInputs);
    next.stops.filter((s) => fresh.some((f) => f.id === s.id) && s.verify === 'pending').forEach(verifyStop);
  };

  const onRetry = (id: string, input: string) => {
    const current = planRef.current;
    const s = current?.stops.find((x) => x.id === id);
    if (!current || !s) return;
    const city = parseTranscript(input, { defaultCity: startCity(current) })[0]?.city ?? s.city;
    logInfo('fix_retry', { from: s.input, to: input });
    const updated: Stop = { ...s, input: input.trim(), city, verify: 'pending', fixReason: undefined, address: undefined, location: undefined };
    setPlan((p) => updateStop(p, id, updated));
    verifyStop(updated);
  };

  const onAccept = (id: string) => {
    const s = planRef.current?.stops.find((x) => x.id === id);
    if (!s?.address || !s.location) return;
    logInfo('fix_accept', { spoken: s.spoken, address: s.address });
    remember(s.spoken, { address: s.address, location: s.location });
    if (s.input !== s.spoken) remember(s.input, { address: s.address, location: s.location });
    setPlan((p) => updateStop(p, id, { verify: 'ok', fixReason: undefined }));
  };

  const optimize = async () => {
    const current = planRef.current;
    if (!current) return;
    setError(''); setSortError(''); setOptimizing(true);
    try {
      const optimized = await optimizePlan(current, undefined, optimizeOptions?.());
      setPlan((p) => ({ ...p, optimized }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      // Shown next to the button too: the banner at the top is off-screen on a phone.
      setError((e as Error).message); setSortError((e as Error).message);
    }
    finally { setOptimizing(false); }
  };

  return { plan, setPlan, planRef, error, setError, notice, setNotice, optimizing, sortError, verifyPlace, useHere, onAdd, onRetry, onAccept, optimize };
}
