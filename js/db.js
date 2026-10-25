// IndexedDB wrapper for the "sets" (training log), "prs" (recorded PRs),
// "foodLog" (nutrition log), and "customFoods" (user-added food items) stores.
const DB_NAME = 'gainz';
const DB_VERSION = 3;
const STORE = 'sets';
const PR_STORE = 'prs';
const FOOD_LOG_STORE = 'foodLog';
const CUSTOM_FOODS_STORE = 'customFoods';

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
      if (!db.objectStoreNames.contains(FOOD_LOG_STORE)) {
        const foodLogStore = db.createObjectStore(FOOD_LOG_STORE, { keyPath: 'id' });
        foodLogStore.createIndex('date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains(CUSTOM_FOODS_STORE)) {
        db.createObjectStore(CUSTOM_FOODS_STORE, { keyPath: 'id' });
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

function getAllFrom(storeName, sortFn = (a, b) => a.date.localeCompare(b.date)) {
  return tx(storeName, 'readonly').then(
    (store) =>
      new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result.sort(sortFn));
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

  // grams/kcal/protein/carbs/fat are all optional — a bare food-name-only
  // entry (no amount, no macros) is a valid diary record, not an error.
  // Missing values are stored as null (unknown), not 0, so totals/display can
  // tell "logged as zero" apart from "wasn't recorded."
  async addFoodLogEntry({ date, name, grams, kcal, protein, carbs, fat, source, notes }) {
    const numOrNull = (v) => (v === '' || v === undefined || v === null ? null : Number(v));
    const entry = {
      id: uuid(),
      date,
      name,
      grams: numOrNull(grams),
      kcal: numOrNull(kcal),
      protein: numOrNull(protein),
      carbs: numOrNull(carbs),
      fat: numOrNull(fat),
      source: source || 'manual',
      notes: notes || '',
      createdAt: Date.now(),
    };
    return putIn(FOOD_LOG_STORE, entry);
  },
  updateFoodLogEntry(entry) {
    return putIn(FOOD_LOG_STORE, entry);
  },
  deleteFoodLogEntry(id) {
    return deleteFrom(FOOD_LOG_STORE, id);
  },
  getAllFoodLog() {
    return getAllFrom(FOOD_LOG_STORE);
  },
  replaceAllFoodLog(entries) {
    return replaceAllIn(FOOD_LOG_STORE, entries);
  },

  async addCustomFood({ name, kcal, protein, carbs, fat }) {
    const entry = {
      id: uuid(),
      name,
      kcal: Number(kcal),
      protein: Number(protein),
      carbs: Number(carbs),
      fat: Number(fat),
      createdAt: Date.now(),
    };
    return putIn(CUSTOM_FOODS_STORE, entry);
  },
  deleteCustomFood(id) {
    return deleteFrom(CUSTOM_FOODS_STORE, id);
  },
  getAllCustomFoods() {
    return getAllFrom(CUSTOM_FOODS_STORE, (a, b) => a.name.localeCompare(b.name));
  },
  replaceAllCustomFoods(entries) {
    return replaceAllIn(CUSTOM_FOODS_STORE, entries);
  },
};

// Small key-value settings (API key, daily nutrition targets) — plain
// localStorage is enough here, no need for IndexedDB transactions.
const SETTINGS_KEY = 'gainz-settings';

const Settings = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    } catch {
      return {};
    }
  },
  set(patch) {
    const current = Settings.get();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...current, ...patch }));
  },
};
