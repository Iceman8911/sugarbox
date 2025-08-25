import { SugarboxEngine } from "./engine/if-engine";
import type {
	SugarBoxCacheAdapter,
	SugarBoxPersistenceAdapter,
} from "./types/adapters";
import type {
	SugarBoxAnyKey,
	SugarBoxConfig,
	SugarBoxExportData,
	SugarBoxSaveData,
} from "./types/if-engine";
import type {
	SugarBoxCompatibleClassConstructorCheck,
	SugarBoxCompatibleClassInstance,
} from "./types/userland-classes";

export {
	SugarboxEngine,
	type SugarBoxConfig,
	type SugarBoxCompatibleClassConstructorCheck,
	type SugarBoxCompatibleClassInstance,
	type SugarBoxAnyKey,
	type SugarBoxPersistenceAdapter,
	type SugarBoxCacheAdapter,
	type SugarBoxExportData,
	type SugarBoxSaveData,
};
