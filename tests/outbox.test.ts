import { describe, expect, it } from 'vitest';
import { backoffMs, createOutbox, localStore, type Mark, type OutboxStore } from '../src/company/outbox';

const memStore = (): OutboxStore => { let q: Mark[] = []; return { load: async () => structuredClone(q), save: async (v) => { q = structuredClone(v); } }; };
const fakeLs = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };

/** Server stand-in with the same rule as mark_stop(): an event id it has seen is a no-op. */
function fakeServer() {
  const seen = new Set<string>(), applied: string[] = [];
  const s = {
    applied, online: true, loseAnswers: 0, refuse: null as null | ((m: Mark) => string | null),
    send: async (m: Mark) => {
      if (!s.online) throw new Error('Failed to fetch');
      const r = s.refuse?.(m); if (r) throw new Error(r);
      if (!seen.has(m.id)) { seen.add(m.id); applied.push(`${m.stopId}:${m.outcome}`); }
      if (s.loseAnswers > 0) { s.loseAnswers--; throw new Error('network timeout'); }
    },
  };
  return s;
}
let n = 0; const ids = () => `ev-${++n}`;

describe('courier outbox', () => {
  it('marks made offline are sent in tap order once signal returns', async () => {
    const srv = fakeServer(); srv.online = false;
    const ob = createOutbox({ store: memStore(), send: srv.send, newId: ids });
    await ob.enqueue({ stopId: 's1', outcome: 'delivered' });
    await ob.enqueue({ stopId: 's2', outcome: 'failed', code: 'moved' });
    await ob.enqueue({ stopId: 's2', outcome: 'todo' });
    await ob.enqueue({ stopId: 's2', outcome: 'pasted' });
    expect(await ob.flush()).toMatchObject({ sent: 0, left: 4 });
    srv.online = true;
    expect((await ob.flush()).left).toBe(0);
    expect(srv.applied).toEqual(['s1:delivered', 's2:failed', 's2:todo', 's2:pasted']);
  });

  it('an answer lost on the way back is resent and applied once', async () => {
    const srv = fakeServer(); srv.loseAnswers = 1;
    const ob = createOutbox({ store: memStore(), send: srv.send, newId: ids });
    await ob.enqueue({ stopId: 's1', outcome: 'delivered' });
    expect((await ob.flush()).left).toBe(1);
    expect((await ob.flush()).left).toBe(0);
    expect(srv.applied).toEqual(['s1:delivered']);
  });

  it('the queue survives a reload (new outbox, same storage)', async () => {
    const srv = fakeServer(); srv.online = false; const ls = fakeLs();
    const a = createOutbox({ store: localStore('k', ls), send: srv.send, newId: ids });
    await a.enqueue({ stopId: 's1', outcome: 'pasted' });
    await a.flush();
    srv.online = true;
    const b = createOutbox({ store: localStore('k', ls), send: srv.send, newId: ids });
    expect(await b.pending()).toBe(1);
    await b.flush();
    expect(srv.applied).toEqual(['s1:pasted']);
  });

  it('a mark the server refuses for good is dropped and reported, the rest still go', async () => {
    const srv = fakeServer(); srv.refuse = (m) => (m.stopId === 'paid' ? 'day already paid' : null);
    const rejected: string[] = [];
    const ob = createOutbox({ store: memStore(), send: srv.send, newId: ids, onRejected: (m) => rejected.push(m.stopId) });
    await ob.enqueue({ stopId: 'paid', outcome: 'todo' });
    await ob.enqueue({ stopId: 's9', outcome: 'delivered' });
    await ob.flush();
    expect(rejected).toEqual(['paid']);
    expect(srv.applied).toEqual(['s9:delivered']);
  });

  it('two flushes at once (online event + timer) do not double send', async () => {
    const srv = fakeServer(); let calls = 0;
    const send = async (m: Mark) => { calls++; await new Promise((r) => setTimeout(r, 5)); return srv.send(m); };
    const ob = createOutbox({ store: memStore(), send, newId: ids });
    await ob.enqueue({ stopId: 's1', outcome: 'delivered' });
    await ob.enqueue({ stopId: 's2', outcome: 'delivered' });
    await Promise.all([ob.flush(), ob.flush(), ob.flush()]);
    expect(calls).toBe(2);
  });

  it('keeps the time of the tap, not the time it was sent', async () => {
    const srv = fakeServer(); srv.online = false; let t = Date.parse('2026-11-17T07:00:00Z');
    const got: string[] = [];
    const ob = createOutbox({ store: memStore(), send: async (m) => { await srv.send(m); got.push(m.at); }, now: () => t, newId: ids });
    await ob.enqueue({ stopId: 's1', outcome: 'delivered' });
    t += 3_600_000; srv.online = true; await ob.flush();
    expect(got).toEqual(['2026-11-17T07:00:00.000Z']);
  });

  it('backoff grows and caps at a minute', () => {
    expect([0, 1, 2, 5, 10].map(backoffMs)).toEqual([2000, 4000, 8000, 60000, 60000]);
  });
});
