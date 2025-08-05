import { mock } from "bun:test";
import QuickLru from "quick-lru";
import type { CacheAdapter } from "../../src/types/adapters";

const createCacheAdapter: () => CacheAdapter<string, string> = mock(() => {
	const store = new QuickLru<string, string>({ maxSize: 10 });

	const adapter: CacheAdapter<string, string> = {
		get(key) {
			return store.get(key);
		},

		set(key, val) {
			store.set(key, val);
		},

		delete(key) {
			store.delete(key);
		},

		clear() {
			store.clear();
		},
	};

	return adapter;
});

export { createCacheAdapter };
