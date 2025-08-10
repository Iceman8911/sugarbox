import { mock } from "bun:test";
import type { GenericPersistenceAdapter } from "../../src/types/adapters";
import type { SugarBoxAnyKey } from "../../src/types/if-engine";

const createPersistenceAdapter: () => GenericPersistenceAdapter<
	SugarBoxAnyKey,
	string
> = mock(() => {
	const store = new Map<SugarBoxAnyKey, string>();

	const adapter: GenericPersistenceAdapter<SugarBoxAnyKey, string> = {
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
