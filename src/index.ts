import { SugarboxEngine } from "./engine/if-engine";
import type {
	SugarBoxCacheAdapter,
	SugarBoxPersistenceAdapter,
} from "./types/adapters";
import type { SugarBoxConfig } from "./types/if-engine";
import {
	SugarBoxCompatibleClassConstructorCheck,
	SugarBoxCompatibleClassInstance,
} from "./types/userland-classes";

export {
	SugarboxEngine,
	type SugarBoxConfig,
	SugarBoxCompatibleClassConstructorCheck,
	SugarBoxCompatibleClassInstance,
	type SugarBoxCacheAdapter,
	type SugarBoxPersistenceAdapter,
};
