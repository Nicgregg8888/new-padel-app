import type { MatchRecord } from "./match";

/**
 * Past matches, kept in this browser's IndexedDB. Frames (the per-frame
 * skeletons) are dropped: they're large and only needed next to the video.
 * Every call tolerates storage being unavailable (private mode, blocked site data).
 */
const DB = "padelvision";
const STORE = "matches";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function stripFrames(m: MatchRecord): MatchRecord {
  const ball = m.result.ball ? { track: [], events: m.result.ball.events } : undefined;
  return { ...m, result: { ...m.result, frames: [], ball } };
}

export async function saveMatch(m: MatchRecord): Promise<boolean> {
  try {
    await tx("readwrite", (s) => s.put(stripFrames(m)));
    return true;
  } catch {
    return false;
  }
}

export async function listMatches(): Promise<MatchRecord[]> {
  try {
    const all = await tx<MatchRecord[]>("readonly", (s) => s.getAll());
    return all.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function deleteMatch(id: string): Promise<void> {
  try {
    await tx("readwrite", (s) => s.delete(id));
  } catch {
    // Nothing to do: storage unavailable.
  }
}

const PREFS = "padelvision:players";
/** Remember names / "me" between matches so the user sets them once. */
export function loadPlayerPrefs(): Pick<MatchRecord, "names" | "me"> | undefined {
  try {
    const raw = localStorage.getItem(PREFS);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}
export function savePlayerPrefs(p: Pick<MatchRecord, "names" | "me">) {
  try {
    localStorage.setItem(PREFS, JSON.stringify(p));
  } catch {
    // Ignore: storage unavailable.
  }
}
