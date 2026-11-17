// The courier's offline queue. A tap is saved on the phone first, then sent to mark_stop() when there is signal.
// Pure logic: storage, sending and the clock are passed in, so it runs in the browser and in tests.
//
// Each mark gets its client_event_id and the time of the tap when it is queued. The server ignores an id it has
// seen, so a mark whose answer was lost on the way back can be sent again without counting twice.

export type Outcome = 'todo' | 'delivered' | 'pasted' | 'failed';

export interface Mark {
  id: string;
  stopId: string;
  outcome: Outcome;
  code: string | null;
  reason: string | null;
  lat: number | null;
  lng: number | null;
  /** ISO time of the tap. */
  at: string;
}

export interface OutboxStore {
  load(): Promise<Mark[]>;
  save(q: Mark[]): Promise<void>;
}

export interface FlushResult { sent: number; left: number; error?: unknown }

/** Errors the server will give again however many times we retry: drop the mark and tell the courier. */
const PERMANENT = ['not your route', 'day already paid', 'stop not found', 'bad outcome', 'bad fail reason', 'reason text required', 'check constraint'];
const message = (err: unknown) => String((err as { message?: unknown } | null)?.message ?? err);
export const isPermanent = (err: unknown) => PERMANENT.some((p) => message(err).includes(p));

export function createOutbox(opts: {
  store: OutboxStore;
  /** Rejects on a network or server error. */
  send: (mark: Mark) => Promise<void>;
  /** The server refused it for good; show the courier why. */
  onRejected?: (mark: Mark, err: unknown) => void;
  now?: () => number;
  newId?: () => string;
}) {
  const { store, send, onRejected = () => {}, now = () => Date.now(), newId = () => crypto.randomUUID() } = opts;
  let flushing: Promise<FlushResult> | null = null;

  async function enqueue(m: { stopId: string; outcome: Outcome; code?: string | null; reason?: string | null; lat?: number | null; lng?: number | null }) {
    const mark: Mark = { id: newId(), stopId: m.stopId, outcome: m.outcome, code: m.code ?? null, reason: m.reason ?? null,
      lat: m.lat ?? null, lng: m.lng ?? null, at: new Date(now()).toISOString() };
    const q = await store.load();
    q.push(mark);
    await store.save(q);
    return mark;
  }

  /** Sends the queue in tap order. Stops at the first network error, so a later undo is never sent before its mark. */
  function flush(): Promise<FlushResult> {
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
          await store.save((await store.load()).filter((x) => x.id !== mark.id));
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
export const backoffMs = (attempt: number) => Math.min(60_000, 2000 * 2 ** attempt);

type KV = Pick<Storage, 'getItem' | 'setItem'>;
/** localStorage store: small and synchronous, survives a reload or the browser killing the tab. */
export const localStore = (key = 'passit_outbox', ls: KV = globalThis.localStorage): OutboxStore => ({
  load: async () => { try { return JSON.parse(ls.getItem(key) ?? '[]') as Mark[]; } catch { return []; } },
  save: async (q) => ls.setItem(key, JSON.stringify(q)),
});
