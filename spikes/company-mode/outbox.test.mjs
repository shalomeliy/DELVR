// node --test outbox.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOutbox, localStore, backoffMs } from '../../public/spike/outbox.mjs';

const memStore = () => { let q = []; return { load: async () => structuredClone(q), save: async (v) => { q = structuredClone(v); } }; };
const fakeLs = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

/** Server stand-in with the same rule as mark_stop(): an event id it has seen is a no-op. */
function fakeServer() {
  const seen = new Set(), applied = [];
  let online = true, loseAnswers = 0, refuse = null;
  return {
    applied,
    set online(v) { online = v; }, loseNextAnswers(n) { loseAnswers = n; }, refuse(fn) { refuse = fn; },
    async send(m) {
      if (!online) throw new Error('Failed to fetch');
      const r = refuse?.(m); if (r) throw new Error(r);
      if (!seen.has(m.id)) { seen.add(m.id); applied.push(`${m.stopId}:${m.outcome}`); }
      if (loseAnswers > 0) { loseAnswers--; throw new Error('network timeout'); }
    },
  };
}
let n = 0; const ids = () => `ev-${++n}`;

test('marks made offline are sent in tap order once signal returns', async () => {
  const srv = fakeServer(); srv.online = false;
  const ob = createOutbox({ store: memStore(), send: srv.send, newId: ids });
  await ob.enqueue({ stopId: 's1', outcome: 'delivered' });
  await ob.enqueue({ stopId: 's2', outcome: 'failed', reason: 'לא ענה' });
  await ob.enqueue({ stopId: 's2', outcome: 'todo' });
  await ob.enqueue({ stopId: 's2', outcome: 'pasted' });
  const r1 = await ob.flush();
  assert.equal(r1.sent, 0); assert.equal(r1.left, 4);
  srv.online = true;
  const r2 = await ob.flush();
  assert.deepEqual(srv.applied, ['s1:delivered', 's2:failed', 's2:todo', 's2:pasted']);
  assert.equal(r2.left, 0);
});

test('an answer lost on the way back: resent, applied once', async () => {
  const srv = fakeServer(); srv.loseNextAnswers(1);
  const ob = createOutbox({ store: memStore(), send: srv.send, newId: ids });
  await ob.enqueue({ stopId: 's1', outcome: 'delivered' });
  assert.equal((await ob.flush()).left, 1);
  assert.equal((await ob.flush()).left, 0);
  assert.deepEqual(srv.applied, ['s1:delivered']);
});

test('the queue survives a reload (new outbox, same storage)', async () => {
  const srv = fakeServer(); srv.online = false; const ls = fakeLs();
  const a = createOutbox({ store: localStore('k', ls), send: srv.send, newId: ids });
  await a.enqueue({ stopId: 's1', outcome: 'pasted' });
  await a.flush();
  srv.online = true;
  const b = createOutbox({ store: localStore('k', ls), send: srv.send, newId: ids });
  assert.equal(await b.pending(), 1);
  await b.flush();
  assert.deepEqual(srv.applied, ['s1:pasted']);
});

test('a mark the server refuses for good is dropped and reported, the rest still go', async () => {
  const srv = fakeServer(); srv.refuse((m) => (m.stopId === 'paid' ? 'day already paid' : null));
  const rejected = [];
  const ob = createOutbox({ store: memStore(), send: srv.send, newId: ids, onRejected: (m) => rejected.push(m.stopId) });
  await ob.enqueue({ stopId: 'paid', outcome: 'todo' });
  await ob.enqueue({ stopId: 's9', outcome: 'delivered' });
  await ob.flush();
  assert.deepEqual(rejected, ['paid']);
  assert.deepEqual(srv.applied, ['s9:delivered']);
});

test('two flushes at once (online event + timer) do not double send', async () => {
  const srv = fakeServer(); let calls = 0;
  const send = async (m) => { calls++; await new Promise((r) => setTimeout(r, 5)); return srv.send(m); };
  const ob = createOutbox({ store: memStore(), send, newId: ids });
  await ob.enqueue({ stopId: 's1', outcome: 'delivered' });
  await ob.enqueue({ stopId: 's2', outcome: 'delivered' });
  await Promise.all([ob.flush(), ob.flush(), ob.flush()]);
  assert.equal(calls, 2);
});

test('the time of the tap is kept, not the time it was sent', async () => {
  const srv = fakeServer(); srv.online = false; let t = Date.parse('2026-11-17T07:00:00Z');
  const got = [];
  const ob = createOutbox({ store: memStore(), send: async (m) => { await srv.send(m); got.push(m.at); }, now: () => t, newId: ids });
  await ob.enqueue({ stopId: 's1', outcome: 'delivered' });
  t += 3600_000; srv.online = true; await ob.flush();
  assert.deepEqual(got, ['2026-11-17T07:00:00.000Z']);
});

test('backoff grows and caps at a minute', () => {
  assert.deepEqual([0, 1, 2, 5, 10].map(backoffMs), [2000, 4000, 8000, 60000, 60000]);
});
