import { useCallback, useEffect, useRef, useState } from 'react';
import { addStops, canOptimize, emptyPlan, endModeOf, findDuplicate, removeStop, startCity, stopsFromText, updateStop } from './domain/plan';
import { parseTranscript } from './domain/parser.js';
import type { Place, Plan, Stop } from './domain/types';
import { MAX_STOPS } from './domain/types';
import { geocode, reverseGeocode } from './services/geocode';
import { buildReport, logError, logInfo, shareReport } from './services/log';
import { hasMapsKey } from './services/maps';
import { optimizePlan } from './services/optimize';
import { isFresh, loadPlan, recall, remember, savePlan } from './store/db';
import { AddStops } from './ui/AddStops';
import { FixList } from './ui/FixList';
import { RouteView } from './ui/RouteView';
import { StartPoint } from './ui/StartPoint';
import { StopList } from './ui/StopList';

export default function App() {
  const [plan, setPlanState] = useState<Plan | null>(null);
  const [error, setErrorState] = useState('');
  const setError = useCallback((msg: string) => { if (msg) logError('shown_error', msg); setErrorState(msg); }, []);
  const [notice, setNotice] = useState('');
  const [optimizing, setOptimizing] = useState(false);
  const [sortError, setSortError] = useState('');
  const planRef = useRef<Plan | null>(null);

  const setPlan = useCallback((fn: (p: Plan) => Plan) => {
    setPlanState((prev) => {
      const next = fn(prev ?? emptyPlan());
      planRef.current = next;
      savePlan(next);
      return next;
    });
  }, []);

  useEffect(() => { loadPlan().then((p) => { const v = p ?? emptyPlan(); planRef.current = v; setPlanState(v); }); }, []);

  // Verify one stop: addresses this phone already knows first (free), then Google.
  const verifyStop = useCallback(async (stop: Stop) => {
    const mem = await recall(stop.input);
    if (mem && isFresh(mem)) { setPlan((p) => updateStop(p, stop.id, { verify: 'ok', address: mem.address, location: mem.location, fixReason: undefined })); return; }
    try {
      // An expired entry still knows which address the courier meant, so Google is asked about that one.
      const r = await geocode(mem?.address ?? stop.input, stop.city);
      setPlan((p) => updateStop(p, stop.id, r.ok
        ? { verify: 'ok', address: r.address, location: r.location, fixReason: undefined }
        : { verify: 'needs_fix', fixReason: r.reason, address: r.address, location: r.location }));
      // Every confirmed address is kept, so a street the courier delivers to again costs no Google call.
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
  const started = useRef(false);
  useEffect(() => {
    if (!plan || started.current) return;
    started.current = true;
    plan.stops.filter((s) => s.verify === 'pending').forEach(verifyStop);
  }, [plan, verifyStop]);

  if (!plan) return <main className="app"><p className="muted">טוען...</p></main>;

  const verifyPlace = async (which: 'start' | 'end', input: string) => {
    setError('');
    try {
      // The start address repeats every day, so it is looked up in the phone's memory first.
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
    setError(''); setNotice('');
    const fresh = stopsFromText(text, startCity(plan));
    logInfo('add_stops', { text, startCity: startCity(plan), parsed: fresh.map((f) => f.input) });
    if (!fresh.length) { setError('לא זיהיתי כתובות בטקסט'); return; }
    const { plan: next, dropped, duplicates } = addStops(plan, fresh);
    setPlan(() => next);
    const notes = [];
    if (duplicates) notes.push(duplicates === 1 ? 'כתובת כפולה אחת לא נוספה' : `${duplicates} כתובות כפולות לא נוספו`);
    if (dropped) notes.push(`${dropped} כתובות לא נוספו: אפשר עד ${MAX_STOPS} עצירות בגרסה הזו`);
    if (notes.length) setNotice(notes.join('. '));
    if (duplicates) logInfo('duplicates_skipped', duplicates);
    next.stops.filter((s) => fresh.some((f) => f.id === s.id) && s.verify === 'pending').forEach(verifyStop);
  };

  const onRetry = (id: string, input: string) => {
    const s = plan.stops.find((x) => x.id === id);
    if (!s) return;
    const city = parseTranscript(input, { defaultCity: startCity(plan) })[0]?.city ?? s.city;
    logInfo('fix_retry', { from: s.input, to: input });
    const updated: Stop = { ...s, input: input.trim(), city, verify: 'pending', fixReason: undefined, address: undefined, location: undefined };
    setPlan((p) => updateStop(p, id, updated));
    verifyStop(updated);
  };

  const onAccept = (id: string) => {
    const s = plan.stops.find((x) => x.id === id);
    if (!s?.address || !s.location) return;
    logInfo('fix_accept', { spoken: s.spoken, address: s.address });
    remember(s.spoken, { address: s.address, location: s.location });
    if (s.input !== s.spoken) remember(s.input, { address: s.address, location: s.location });
    setPlan((p) => updateStop(p, id, { verify: 'ok', fixReason: undefined }));
  };

  const optimize = async () => {
    setError(''); setSortError(''); setOptimizing(true);
    try {
      const current = planRef.current ?? plan;
      const optimized = await optimizePlan(current);
      setPlan((p) => ({ ...p, optimized }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      // Shown next to the button too: the banner at the top is off-screen on a phone.
      setError((e as Error).message); setSortError((e as Error).message);
    }
    finally { setOptimizing(false); }
  };

  const sendLogs = async () => {
    const p = planRef.current ?? plan;
    const report = await buildReport({
      plan: {
        start: p.start, endMode: endModeOf(p), end: p.end, startCity: startCity(p),
        stops: p.stops.map((s) => ({ spoken: s.spoken, input: s.input, city: s.city, verify: s.verify, fixReason: s.fixReason, address: s.address, located: !!s.location, order: s.order, delivery: s.delivery })),
        optimized: p.optimized && { stops: p.optimized.order.length, totalDurationSec: p.optimized.totalDurationSec, totalDistanceM: p.optimized.totalDistanceM, at: new Date(p.optimized.at).toISOString() },
      },
      screenError: error || undefined,
    });
    const how = await shareReport(report);
    logInfo('logs_shared', how);
    if (how === 'downloaded') setNotice('קובץ הלוגים ירד לטלפון (בתיקיית ההורדות). אפשר לצרף אותו בוואטסאפ');
    if (how === 'copied') setNotice('הלוגים הועתקו. הדבק אותם בוואטסאפ');
  };

  const reset = () => { if (confirm('למחוק את כל העצירות ולהתחיל מסלול חדש?')) setPlan((p) => ({ ...emptyPlan(), start: p.start, end: p.end })); };

  const gate = canOptimize(plan);
  const needsFix = plan.stops.filter((s) => s.verify === 'needs_fix' && s.delivery === 'todo');

  return (
    <main className="app">
      <header className="top">
        <h1>Delvr</h1>
        <div>
          <button type="button" className="link" onClick={sendLogs}>שלח לוגים</button>
          {plan.stops.length > 0 && <button type="button" className="link" onClick={reset}>מסלול חדש</button>}
        </div>
      </header>
      {!hasMapsKey() && <div className="banner bad">חסר מפתח Google. הוסף VITE_GOOGLE_MAPS_KEY לקובץ .env.local</div>}
      {error && <div className="banner bad" role="alert">{error}</div>}
      {notice && <div className="banner warn">{notice}</div>}

      {plan.optimized ? (
        <RouteView plan={plan} busy={optimizing} onReoptimize={optimize}
          onDelivery={(id, d) => { logInfo('delivery', { id, status: d }); setPlan((p) => updateStop(p, id, { delivery: d, handledAt: d === 'todo' ? undefined : Date.now() }, true)); }} />
      ) : null}

      {!plan.optimized && <StartPoint start={plan.start} end={plan.end} onVerify={verifyPlace} onHere={useHere}
        onClearEnd={() => setPlan((p) => ({ ...p, end: null, optimized: undefined }))} />}
      <FixList stops={needsFix} onRetry={onRetry} onAccept={onAccept} onRemove={(id) => setPlan((p) => removeStop(p, id))} />
      {!plan.optimized && <StopList stops={plan.stops} onRemove={(id) => setPlan((p) => removeStop(p, id))}
        onOrder={(id, order) => setPlan((p) => updateStop(p, id, { order }))} />}
      <AddStops count={plan.stops.length} max={MAX_STOPS} onAdd={onAdd} />

      {!plan.optimized && plan.stops.length > 0 && (
        <div className="sticky">
          <button type="button" className="primary big" disabled={!gate.ok || optimizing} onClick={optimize}>
            {optimizing ? 'מסדר את המסלול...' : 'סדר מסלול'}
          </button>
          {sortError && <div className="bad small center" role="alert">הסידור נכשל: {sortError}</div>}
          {!gate.ok && <div className="muted small center">{gate.why}</div>}
        </div>
      )}
      <footer className="muted small center">גרסה {import.meta.env.VITE_BUILD ?? 'dev'}</footer>
    </main>
  );
}
