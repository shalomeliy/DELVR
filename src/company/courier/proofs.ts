// Door photos waiting to upload. A photo is shrunk on the phone, kept in IndexedDB, and sent when there is signal,
// so a courier in a basement with no reception never loses one.
export interface Proof { id: string; companyId: string; routeId: string; stopId: string; photo: Blob; at: number }

export interface ProofStore { all(): Promise<Proof[]>; put(p: Proof): Promise<void>; remove(id: string): Promise<void> }

/** Sends every queued photo, oldest first. One that fails stays for the next try; the rest still go. */
export async function flushProofs(store: ProofStore, send: (p: Proof) => Promise<void>): Promise<{ sent: number; left: number }> {
  const q = (await store.all()).sort((a, b) => a.at - b.at);
  let sent = 0;
  for (const p of q) {
    try { await send(p); await store.remove(p.id); sent++; } catch { /* stays queued */ }
  }
  return { sent, left: q.length - sent };
}

export function memoryProofs(): ProofStore {
  const m = new Map<string, Proof>();
  return { all: async () => [...m.values()], put: async (p) => { m.set(p.id, p); }, remove: async (id) => { m.delete(id); } };
}

/** IndexedDB queue for this phone's courier. Falls back to memory when IndexedDB is blocked (private mode). */
export function idbProofs(owner: string): ProofStore {
  const name = `passit_proofs_${owner}`;
  let fallback: ProofStore | null = null;
  const open = () => new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('q', { keyPath: 'id' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const tx = async <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) => {
    const db = await open();
    return new Promise<T>((res, rej) => { const q = fn(db.transaction('q', mode).objectStore('q')); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); })
      .finally(() => db.close());
  };
  const safe = async <T,>(real: () => Promise<T>, mem: (s: ProofStore) => Promise<T>) => {
    if (fallback) return mem(fallback);
    try { return await real(); } catch { fallback = memoryProofs(); return mem(fallback); }
  };
  return {
    all: () => safe(() => tx('readonly', (s) => s.getAll() as IDBRequest<Proof[]>), (f) => f.all()),
    put: (p) => safe(async () => { await tx('readwrite', (s) => s.put(p)); }, (f) => f.put(p)),
    remove: (id) => safe(async () => { await tx('readwrite', (s) => s.delete(id)); }, (f) => f.remove(id)),
  };
}

/** Longest side of the stored photo. Enough to read a door number, small enough (~150-300 KB) to send on weak signal. */
export const PROOF_MAX = 1280;

export function fitWithin(w: number, h: number, max = PROOF_MAX) {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

/** Shrinks a camera photo to a JPEG. Keeps the original if the browser cannot decode it. */
export async function shrink(file: Blob): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    const { w, h } = fitWithin(bmp.width, bmp.height);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    return await new Promise<Blob>((res) => c.toBlob((b) => res(b ?? file), 'image/jpeg', 0.72));
  } catch { return file; }
}
