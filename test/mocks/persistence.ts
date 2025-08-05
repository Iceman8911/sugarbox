import { mock } from "bun:test";
import type { PersistenceAdapter } from "../../src/types/adapters";

const persistenceAdapter: () => PersistenceAdapter<string, string> = mock(
	() => {
		const store = new Map<string, string>();

		const adapter: PersistenceAdapter<string, string> = {
			async get(key) {
				return store.get(key);
			},

			async set(key, val) {
				store.set(key, val);
			},

			async delete(key) {
				store.delete(key);
			},
		};

		return adapter;
	},
);

export { persistenceAdapter };
