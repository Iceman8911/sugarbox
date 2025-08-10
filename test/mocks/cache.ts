import { mock } from "bun:test";
import QuickLru from "quick-lru";
import type { SugarBoxCacheAdapter } from "../../src/types/adapters";

const createCacheAdapter: () => SugarBoxCacheAdapter<string, string> = mock(
	() => {
		const store = new QuickLru<string, string>({ maxSize: 10 });

		const adapter: SugarBoxCacheAdapter<string, string> = {
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
	},
);

export { createCacheAdapter };
