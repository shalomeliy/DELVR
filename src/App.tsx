import { useState } from 'react';
import { canOptimize, editInRoute, setDue, orderedStops, removeFromRoute, emptyPlan, endModeOf, removeStop, startCity, updateStop } from './domain/plan';
import { archiveOf } from './domain/archive';
import { dayKey, routeCsv, withEntry, withoutEntry } from './domain/history';
import { parseTranscript } from './domain/parser.js';
import type { Stop } from './domain/types';
import { MAX_STOPS } from './domain/types';
import { geocode } from './services/geocode';
import { buildReport, logInfo, shareFile, shareReport } from './services/log';
import { hasMapsKey } from './services/maps';
import { isFresh, loadPlan, recall, remember, savePlan, saveRoute, updateDay } from './store/db';
import { AddStops } from './ui/AddStops';
import { Archive } from './ui/Archive';
import { Calendar } from './ui/Calendar';
import { FixList } from './ui/FixList';
import { RouteView } from './ui/RouteView';
import { Settings } from './ui/Settings';
import { StartPoint } from './ui/StartPoint';
import { StopList } from './ui/StopList';
import { usePlanEditor, type PlanStorage } from './ui/usePlanEditor';

const soloStorage: PlanStorage = { load: loadPlan, save: savePlan, empty: emptyPlan };

export default function App() {
  const { plan, setPlan, planRef, error, notice, setNotice, optimizing, sortError, verifyPlace, useHere, onAdd, onRetry, onAccept, optimize } = usePlanEditor(soloStorage);
  const [view, setView] = useState<'route' | 'calendar' | 'archive'>('route');

  if (!plan) return <main className="app"><p className="muted">טוען...</p></main>;

  const sendLogs = async () => {
    const p = planRef.current ?? plan;
    const report = await buildReport({
      plan: {
        start: p.start, endMode: endModeOf(p), end: p.end, startCity: startCity(p),
        stops: p.stops.map((s) => ({ spoken: s.spoken, input: s.input, city: s.city, verify: s.verify, fixReason: s.fixReason, address: s.address, located: !!s.location, order: s.order, dueAt: s.dueAt, delivery: s.delivery, failReason: s.failReason })),
        optimized: p.optimized && { stops: p.optimized.order.length, totalDurationSec: p.optimized.totalDurationSec, totalDistanceM: p.optimized.totalDistanceM, at: new Date(p.optimized.at).toISOString() },
      },
      screenError: error || undefined,
    });
    const how = await shareReport(report);
    logInfo('logs_shared', how);
    if (how === 'downloaded') setNotice('קובץ הלוגים ירד לטלפון (בתיקיית ההורדות). אפשר לצרף אותו בוואטסאפ');
    if (how === 'copied') setNotice('הלוגים הועתקו. הדבק אותם בוואטסאפ');
  };

  // Every outcome also goes into that day's history, which the calendar and the reports read.
  const onDelivery = (id: string, d: Stop['delivery'], reason?: string) => {
    const s = (planRef.current ?? plan).stops.find((x) => x.id === id);
    if (!s) return;
    // Editing the reason of a stop that already failed keeps its time, so it stays on the same day.
    const at = d === 'todo' ? undefined : s.delivery === d && s.handledAt ? s.handledAt : Date.now();
    const failReason = d === 'failed' ? reason?.trim() || undefined : undefined;
    logInfo('delivery', { id, status: d, reason: failReason });
    setPlan((p) => updateStop(p, id, { delivery: d, handledAt: at, failReason }, true));
    if (s.handledAt && (!at || dayKey(s.handledAt) !== dayKey(at))) { const day = dayKey(s.handledAt); updateDay(day, (log) => withoutEntry(log, day, id)); }
    if (at && d !== 'todo') {
      const day = dayKey(at);
      updateDay(day, (log) => withEntry(log, day, { stopId: id, address: s.address ?? s.input, outcome: d, reason: failReason, at }));
    }
  };

  // Fix an address on a route that is already sorted: one lookup (free when this phone knows it), no re-sort.
  const editRouteStop = async (id: string, text: string): Promise<string | null> => {
    const s = (planRef.current ?? plan).stops.find((x) => x.id === id);
    if (!s) return null;
    const parsed = parseTranscript(text, { defaultCity: startCity(planRef.current ?? plan) })[0];
    const query = parsed?.geocodeQuery ?? text.trim();
    const city = parsed?.city ?? s.city;
    try {
      const mem = await recall(query);
      const r = mem && isFresh(mem) ? { ok: true as const, address: mem.address, location: mem.location } : await geocode(query, city);
      logInfo('route_edit', { from: s.address ?? s.input, to: query, ok: r.ok, google: r.address });
      if (!r.ok) return `${r.reason}. נסה לכתוב רחוב, מספר ועיר`;
      if (!(mem && isFresh(mem))) remember(query, { address: r.address, location: r.location });
      setPlan((p) => editInRoute(p, id, { input: query, city, address: r.address, location: r.location }));
      return null;
    } catch (e) { return (e as Error).message; }
  };

  // One tap: every stop of the current route with its status and failure reason, and the totals.
  const exportRoute = async () => {
    const p = planRef.current ?? plan;
    const rows = orderedStops(p).map((s) => ({ address: s.address ?? s.input, status: s.delivery, reason: s.failReason, at: s.handledAt }));
    const now = Date.now();
    const how = await shareFile(routeCsv(rows, now, p.startedAt), `passit-route-${dayKey(now)}.csv`, 'text/csv', 'דוח מסלול');
    logInfo('report_route', { stops: rows.length, how });
    if (how === 'downloaded') setNotice('הדוח ירד לטלפון (בתיקיית ההורדות). אפשר לפתוח אותו ב-Excel או לצרף בוואטסאפ');
    if (how === 'copied') setNotice('הדוח הועתק. הדבק אותו בוואטסאפ או במייל');
  };

  // What was done on the old route goes to the archive first; the daily history already has every status.
  const reset = async () => {
    const old = planRef.current ?? plan;
    const snapshot = archiveOf(old);
    if (!confirm(snapshot ? 'המסלול הנוכחי יישמר בארכיון. להתחיל מסלול חדש?' : 'למחוק את כל העצירות ולהתחיל מסלול חדש?')) return;
    if (snapshot) { await saveRoute(snapshot); logInfo('route_archived', { stops: snapshot.stops.length }); }
    setPlan((p) => ({ ...emptyPlan(), start: p.start, end: p.end }));
  };

  const gate = canOptimize(plan);
  const needsFix = plan.stops.filter((s) => s.verify === 'needs_fix' && s.delivery === 'todo');

  return (
    <main className="app">
      <header className="top">
        <h1>PassIT</h1>
        <Settings view={view} canReset={plan.stops.length > 0 && view === 'route'} routeSorted={!!plan.optimized}
          onView={setView} onReset={reset} onLogs={sendLogs} />
      </header>
      {!hasMapsKey() && <div className="banner bad">חסר מפתח Google. הוסף VITE_GOOGLE_MAPS_KEY לקובץ .env.local</div>}
      {error && <div className="banner bad" role="alert">{error}</div>}
      {notice && <div className="banner warn">{notice}</div>}

      {view === 'calendar' ? <Calendar onClose={() => setView('route')} onNotice={setNotice} />
        : view === 'archive' ? <Archive onClose={() => setView('route')} onNotice={setNotice} /> : <>

      {plan.optimized ? (
        <RouteView plan={plan} busy={optimizing} onReoptimize={optimize}
          onDelivery={onDelivery} onReport={exportRoute} onEdit={editRouteStop}
          onNavigate={() => { if (!planRef.current?.startedAt) { logInfo('route_started'); setPlan((p) => (p.startedAt ? p : { ...p, startedAt: Date.now() })); } }}
          onRemove={(id) => { logInfo('route_remove', id); setPlan((p) => removeFromRoute(p, id)); }}
          onDue={(id, due) => { logInfo('due_set', { id, due, sorted: true }); setPlan((p) => setDue(p, id, due)); }} />
      ) : null}

      {!plan.optimized && <StartPoint start={plan.start} end={plan.end} onVerify={verifyPlace} onHere={useHere}
        onClearEnd={() => setPlan((p) => ({ ...p, end: null, optimized: undefined }))} />}
      <FixList stops={needsFix} onRetry={onRetry} onAccept={onAccept} onRemove={(id) => setPlan((p) => removeStop(p, id))} />
      {!plan.optimized && <StopList stops={plan.stops} onRemove={(id) => setPlan((p) => removeStop(p, id))}
        onOrder={(id, order) => setPlan((p) => updateStop(p, id, { order }))}
        onDue={(id, due) => { logInfo('due_set', { id, due }); setPlan((p) => setDue(p, id, due)); }} />}
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
      </>}
      <footer className="muted small center">גרסה {import.meta.env.VITE_BUILD ?? 'dev'}</footer>
    </main>
  );
}
