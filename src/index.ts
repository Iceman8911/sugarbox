import { SugarboxEngine } from "./engine/if-engine";
import type {
	SugarBoxCacheAdapter,
	SugarBoxPersistenceAdapter,
} from "./types/adapters";
import type { SugarBoxAnyKey, SugarBoxConfig } from "./types/if-engine";
import type {
	SugarBoxCompatibleClassConstructorCheck,
	SugarBoxCompatibleClassInstance,
} from "./types/userland-classes";

export {
	SugarboxEngine,
	type SugarBoxConfig,
	type SugarBoxCompatibleClassConstructorCheck,
	type SugarBoxCompatibleClassInstance,
	type SugarBoxCacheAdapter,
	type SugarBoxPersistenceAdapter,
	type SugarBoxAnyKey,
};
