// IndexedDB wrapper for the "sets" (training log) and "prs" (recorded PRs) stores.
const DB_NAME = 'gainz';
const DB_VERSION = 2;
const STORE = 'sets';
const PR_STORE = 'prs';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('lift', 'lift', { unique: false });
        store.createIndex('date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains(PR_STORE)) {
        const prStore = db.createObjectStore(PR_STORE, { keyPath: 'id' });
        prStore.createIndex('lift', 'lift', { unique: false });
        prStore.createIndex('date', 'date', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function uuid() {
  return crypto.randomUUID();
}

function getAllFrom(storeName) {
  return tx(storeName, 'readonly').then(
    (store) =>
      new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result.sort((a, b) => a.date.localeCompare(b.date)));
        req.onerror = () => reject(req.error);
      })
  );
}

function deleteFrom(storeName, id) {
  return tx(storeName, 'readwrite').then(
    (store) =>
      new Promise((resolve, reject) => {
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      })
  );
}

function putIn(storeName, entry) {
  return tx(storeName, 'readwrite').then(
    (store) =>
      new Promise((resolve, reject) => {
        const req = store.put(entry);
        req.onsuccess = () => resolve(entry);
        req.onerror = () => reject(req.error);
      })
  );
}

function replaceAllIn(storeName, entries) {
  return tx(storeName, 'readwrite').then(
    (store) =>
      new Promise((resolve, reject) => {
        const clearReq = store.clear();
        clearReq.onerror = () => reject(clearReq.error);
        clearReq.onsuccess = () => {
          let remaining = entries.length;
          if (remaining === 0) return resolve();
          entries.forEach((entry) => {
            const req = store.add(entry);
            req.onsuccess = () => {
              remaining -= 1;
              if (remaining === 0) resolve();
            };
            req.onerror = () => reject(req.error);
          });
        };
      })
  );
}

const DB = {
  async addSet({ lift, date, weight, reps, notes, isTopSet }) {
    const entry = {
      id: uuid(),
      lift,
      date,
      weight: Number(weight),
      reps: Number(reps),
      notes: notes || '',
      isTopSet: !!isTopSet,
      createdAt: Date.now(),
    };
    return putIn(STORE, entry);
  },
  updateSet(entry) {
    return putIn(STORE, entry);
  },
  deleteSet(id) {
    return deleteFrom(STORE, id);
  },
  getAll() {
    return getAllFrom(STORE);
  },
  async getByLift(lift) {
    const all = await this.getAll();
    return all.filter((s) => s.lift === lift);
  },
  replaceAll(entries) {
    return replaceAllIn(STORE, entries);
  },

  async addPR({ lift, date, weight, reps, notes }) {
    const entry = {
      id: uuid(),
      lift,
      date,
      weight: Number(weight),
      reps: Number(reps),
      notes: notes || '',
      createdAt: Date.now(),
    };
    return putIn(PR_STORE, entry);
  },
  updatePR(entry) {
    return putIn(PR_STORE, entry);
  },
  deletePR(id) {
    return deleteFrom(PR_STORE, id);
  },
  getAllPRs() {
    return getAllFrom(PR_STORE);
  },
  async getPRsByLift(lift) {
    const all = await this.getAllPRs();
    return all.filter((p) => p.lift === lift);
  },
  replaceAllPRs(entries) {
    return replaceAllIn(PR_STORE, entries);
  },
};
