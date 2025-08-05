import { mock } from "bun:test";
import type { PersistenceAdapter } from "../../src/types/adapters";
import type { SugarBoxAnyKey } from "../../src/types/if-engine";

const createPersistenceAdapter: () => PersistenceAdapter<
	SugarBoxAnyKey,
	string
> = mock(() => {
	const store = new Map<SugarBoxAnyKey, string>();

	const adapter: PersistenceAdapter<SugarBoxAnyKey, string> = {
		async get(key) {
			return store.get(key);
		},

		async set(key, val) {
			store.set(key, val);
		},

		async delete(key) {
			store.delete(key);
		},

		async keys() {
			return store.keys();
		},
	};

	return adapter;
});

export { createPersistenceAdapter };
