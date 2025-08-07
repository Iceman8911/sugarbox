import { mock } from "bun:test";
import type { SugarBoxPersistenceAdapter } from "../../src/types/adapters";
import type { SugarBoxAnyKey } from "../../src/types/if-engine";

const createPersistenceAdapter: () => SugarBoxPersistenceAdapter<
	SugarBoxAnyKey,
	string
> = mock(() => {
	const store = new Map<SugarBoxAnyKey, string>();

	const adapter: SugarBoxPersistenceAdapter<SugarBoxAnyKey, string> = {
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
