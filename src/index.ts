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
import type { ReadonlyDeep, WritableDeep } from "./types/utility-types";

export {
	SugarboxEngine,
	type SugarBoxConfig,
	type SugarBoxCompatibleClassConstructorCheck,
	type SugarBoxCompatibleClassInstance,
	type SugarBoxAnyKey,
	type SugarBoxPersistenceAdapter,
	type SugarBoxCacheAdapter,
	type ReadonlyDeep,
	type WritableDeep,
};
