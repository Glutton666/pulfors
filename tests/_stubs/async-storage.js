const store = new Map();
const AsyncStorage = {
  getItem: async (k) => (store.has(k) ? store.get(k) : null),
  setItem: async (k, v) => { store.set(k, String(v)); },
  removeItem: async (k) => { store.delete(k); },
  clear: async () => { store.clear(); },
  getAllKeys: async () => Array.from(store.keys()),
  multiGet: async (keys) => keys.map((k) => [k, store.has(k) ? store.get(k) : null]),
  multiSet: async (pairs) => { for (const [k, v] of pairs) store.set(k, String(v)); },
  multiRemove: async (keys) => { for (const k of keys) store.delete(k); },
  __reset: () => { store.clear(); },
};
module.exports = AsyncStorage;
module.exports.default = AsyncStorage;
