import { DEFAULT_GOALS, GOAL_SPECS, type Goal } from "../analysis/goals";
import type { MatchRecord } from "./match";

/**
 * Past matches, kept in this browser's IndexedDB. Frames (the per-frame
 * skeletons) are dropped: they're large and only needed next to the video.
 * Every call tolerates storage being unavailable (private mode, blocked site data).
 */
const DB = "padelvision";
const STORE = "matches";
/** Partial analyses of long videos, so they can resume after a reload. */
export const CHECKPOINTS = "checkpoints";

let dbPromise: Promise<IDBDatabase> | null = null;

/** One shared connection for the page's lifetime. */
function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      // v1 had only matches; v2 adds checkpoints. Existing data is kept.
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(CHECKPOINTS)) db.createObjectStore(CHECKPOINTS, { keyPath: "id" });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

/** Resolves when the transaction has committed, not merely when the request succeeded. */
export async function idbTx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error ?? req.error);
    t.onabort = () => reject(t.error ?? new Error("Transaction aborted"));
  });
}

const tx = <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) => idbTx(STORE, mode, fn);

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

const GOALS = "padelvision:goals";
export function loadGoals(): Goal[] {
  try {
    const raw = localStorage.getItem(GOALS);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((g) => g && g.metric in GOAL_SPECS && typeof g.target === "number") : DEFAULT_GOALS;
  } catch {
    return DEFAULT_GOALS;
  }
}
export function saveGoals(goals: Goal[]) {
  try {
    localStorage.setItem(GOALS, JSON.stringify(goals));
  } catch {
    // Ignore: storage unavailable.
  }
}
