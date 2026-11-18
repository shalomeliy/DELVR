import { describe, expect, it } from 'vitest';
import { fitWithin, flushProofs, memoryProofs, type Proof } from '../src/company/courier/proofs';

const proof = (id: string, at: number): Proof => ({ id, companyId: 'c', routeId: 'r', stopId: `s${id}`, photo: new Blob(['x']), at });

describe('door photo queue', () => {
  it('sends oldest first and empties the queue', async () => {
    const store = memoryProofs(); await store.put(proof('b', 2)); await store.put(proof('a', 1));
    const sent: string[] = [];
    expect(await flushProofs(store, async (p) => { sent.push(p.id); })).toEqual({ sent: 2, left: 0 });
    expect(sent).toEqual(['a', 'b']);
    expect(await store.all()).toEqual([]);
  });

  it('keeps a photo that failed and still sends the others', async () => {
    const store = memoryProofs(); await store.put(proof('a', 1)); await store.put(proof('b', 2));
    expect(await flushProofs(store, async (p) => { if (p.id === 'a') throw new Error('offline'); })).toEqual({ sent: 1, left: 1 });
    expect((await store.all()).map((p) => p.id)).toEqual(['a']);
  });

  it('shrinks to 1280 on the long side and never enlarges', () => {
    expect(fitWithin(4032, 3024)).toEqual({ w: 1280, h: 960 });
    expect(fitWithin(3024, 4032)).toEqual({ w: 960, h: 1280 });
    expect(fitWithin(800, 600)).toEqual({ w: 800, h: 600 });
  });
});
