// The courier's offline queue. A tap is saved on the phone first, then sent to mark_stop() when there is signal.
// Pure logic: storage, sending and the clock are passed in, so it runs in the browser, in node and in tests.
//
// Each mark gets its client_event_id and the time of the tap when it is queued. The server ignores an id it has
// seen, so a mark whose answer was lost on the way back can be sent again without counting twice.

/** Errors the server will give again however many times we retry: drop the mark and tell the courier. */
const PERMANENT = ['not your route', 'day already paid', 'stop not found', 'bad outcome', 'bad fail reason', 'reason text required', 'check constraint'];
export const isPermanent = (err) => PERMANENT.some((p) => String(err?.message ?? err).includes(p));

/**
 * store: { load(): Promise<array>, save(array): Promise<void> }   (IndexedDB or localStorage in the app)
 * send(mark): Promise<void>   rejects on network or server error
 * onRejected(mark, err): the server refused it for good; show the courier why
 */
export function createOutbox({ store, send, onRejected = () => {}, now = () => Date.now(), newId = () => crypto.randomUUID() }) {
  let flushing = null;

  async function enqueue({ stopId, outcome, code = null, reason = null, lat = null, lng = null }) {
    const mark = { id: newId(), stopId, outcome, code, reason, lat, lng, at: new Date(now()).toISOString() };
    const q = await store.load();
    q.push(mark);
    await store.save(q);
    return mark;
  }

  /** Sends the queue in tap order. Stops at the first network error, so a later undo is never sent before its mark. */
  function flush() {
    flushing ??= (async () => {
      let sent = 0;
      try {
        for (;;) {
          const q = await store.load();
          if (!q.length) return { sent, left: 0 };
          const mark = q[0];
          try {
            await send(mark);
          } catch (err) {
            if (!isPermanent(err)) return { sent, left: q.length, error: err };
            onRejected(mark, err);
          }
          // Removed only after the server answered (or refused for good). A crash before this line resends it, harmlessly.
          const rest = (await store.load()).filter((m) => m.id !== mark.id);
          await store.save(rest);
          sent++;
        }
      } finally { flushing = null; }
    })();
    return flushing;
  }

  const pending = async () => (await store.load()).length;
  return { enqueue, flush, pending };
}

/** Retry schedule while offline: 2s, 4s, 8s ... capped at 60s. The app also flushes on the browser's 'online' event. */
export const backoffMs = (attempt) => Math.min(60_000, 2000 * 2 ** attempt);

/** localStorage store for the app. Small and synchronous: survives a reload or the browser killing the tab. */
export const localStore = (key = 'passit_outbox', ls = globalThis.localStorage) => ({
  load: async () => { try { return JSON.parse(ls.getItem(key) ?? '[]'); } catch { return []; } },
  save: async (q) => ls.setItem(key, JSON.stringify(q)),
});
