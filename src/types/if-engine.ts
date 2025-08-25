import type { SugarBoxSemanticVersionString } from "../utils/version";
import type {
	SugarBoxCacheAdapter,
	SugarBoxPersistenceAdapter,
} from "./adapters";

type SugarBoxVariables<
	TStructure extends Record<string, unknown> = Record<string, unknown>,
> = TStructure;

/** Special information attached to every state snapshot */
type SugarBoxMetadata = {
	/** Passage ID for the state snapshot */
	__id: string;

	/** Current seed of the state at the moment.
	 *
	 * **Is a number between 0 and 2^32 - 1 (inclusive).**
	 */
	__seed: number;
};

/** Keys used for indexing save data
 *
 * Consists of the engine's name and save slot number
 */
type SugarBoxNormalSaveKey = `sugarbox-${string}-slot${number}`;

type SugarBoxAutoSaveKey = `sugarbox-${string}-autosave`;

type SugarBoxAchievementsKey = `sugarbox-${string}-achievements`;

type SugarBoxSettingsKey = `sugarbox-${string}-settings`;

type SugarBoxSaveKey = SugarBoxAutoSaveKey | SugarBoxNormalSaveKey;

type SugarBoxAnyKey =
	| SugarBoxSaveKey
	| SugarBoxAchievementsKey
	| SugarBoxSettingsKey;

/** Data structure used for saving the state of the engine
 *
 * Contains initial state, snapshots, current story index and other relevant metadata
 */
type SugarBoxSaveData<
	TStructure extends Record<string, unknown> = Record<string, unknown>,
> = Readonly<{
	intialState: SugarBoxVariables<TStructure> & SugarBoxMetadata;

	snapshots: Partial<SugarBoxVariables<TStructure> & SugarBoxMetadata>[];

	storyIndex: number;

	// Save metadata
	/** When the save was created */
	savedOn: Date;

	/** ID of the last passage that was navigated to */
	lastPassageId: string;

	/** A user-provided description for the save. TODO */
	// description?: string;

	/** Total play time in seconds. TODO */
	// playtimeInSeconds: number;

	/** The version of the story associated with this save */
	saveVersion: SugarBoxSemanticVersionString;
}>;

/** Export data structure used for saving the state of the engine to disk.
 *
 * Contains save data, settings, and achievements
 */
type SugarBoxExportData<
	TSaveData extends Record<string, unknown> = Record<string, unknown>,
	TSettingsData extends Record<string, unknown> = Record<string, unknown>,
	TAchievementData extends Record<string, unknown> = Record<string, boolean>,
> = {
	saveData: SugarBoxSaveData<TSaveData>;

	/** Story specific settings that shouldn't be tied to save data like audio volume, font size, etc */
	settings: TSettingsData;

	/** Achievements data that is not tied to save data.
	 *
	 * So it can persist across saves and be used to track achievements.
	 */
	achievements: TAchievementData;
};

/**
 * Decides how the compability of saves and the engine is calculated
 */
type SugarBoxSaveVersionCompatiblityMode = "strict" | "liberal";

type SugarBoxConfig<
	TStructure extends Record<string, unknown> = Record<string, unknown>,
> = {
	/** Maximum number of individual states that will be stored before old ones get merged into each other */
	maxStateCount: number;

	/** Number of individual states that will be merged into one when the state fills up */
	stateMergeCount: number;

	/** Maximum amount of saves at any given time.
	 *
	 * Must not be less than 1
	 *
	 * @default 20
	 */
	saveSlots: number;

	/** Semantic version to use for all newly created saves by the engine. Also acts as a reference point for the engine to determine if a previous save is compatible with the current version of the story.
	 *
	 */
	saveVersion: SugarBoxSemanticVersionString;

	/**
	 * Determines how strict the engine will be when deciding if a save is compatible the the current engine's version.
	 *
	 * If set to `strict`, the engine will only consider saves that only differ by the `patch` version as the current engine's version as compatible.
	 *
	 * If set to `liberal`, the engine will only consider saves that differ by the `patch` version, and have a lower or equal `minor` version as compatible.
	 *
	 * @default "strict"
	 */
	saveCompatibilityMode: SugarBoxSaveVersionCompatiblityMode;

	/** If set to `passage`, the story variables are saved on every passage navigation to a special save slot
	 *
	 * If set to `state`, the story variables are saved on every state change (i.e when a variable is changed) to a special save slot
	 *
	 * @default false
	 */
	autoSave: "passage" | "state" | false;

	/**
	 * If `true`, the most recent save (if any) will be loaded when the engine is initialized
	 *
	 * @default true
	 */
	loadOnStart: boolean;

	/** Determines whether or not save data will be compresses.
	 *
	 * @default true
	 */
	compressSave: boolean;

	/** Intial seed for predictable rng.
	 *
	 * **Must be a number between 0 and 2^32 - 1 (inclusive).**
	 *
	 * @default a random number between 0 and 2^32 - 1
	 */
	initialSeed?: number;

	/** Determines if and when the prng seed will be regenerated.
	 *
	 * If set to `passage`, the seed will be regenerated on every passage navigation.
	 *
	 * If set to `eachCall`, the seed will be regenerated on every call to the `random` getter.
	 *
	 * If set to `false`, the seed will not be regenerated at all. Essentially, the engine will use the initial seed for all random number generation.
	 *
	 * @default "passage"
	 */
	regenSeed: "passage" | "eachCall" | false;

	/** Optional cache adapter to use to speed up state fetching */
	cache?: SugarBoxCacheAdapter<SugarBoxVariables<TStructure>>;

	/** Optional persistence adapter for saving support */
	persistence?: SugarBoxPersistenceAdapter;

	/** Optimization strategy for state change events.
	 *
	 * This setting controls how the engine handles state snapshots when emitting
	 * `:stateChange` events, balancing between performance and data accuracy.
	 *
	 * **Performance Impact:**
	 * - `accuracy`: Deep clones the old state before modifications, ensuring complete
	 *   isolation between `oldState` and `newState` objects. Use when you need
	 *   guaranteed data integrity but may impact performance with large state objects.
	 *
	 * - `performance`: Avoids deep cloning for better performance. In rare edge cases
	 *   with complex state caching scenarios, `oldState` and `newState` might reference
	 *   the same object, but provides significant performance benefits for large states.
	 *
	 * @default "accuracy"
	 */
	eventOptimization?: "performance" | "accuracy";
};

type SugarBoxPassage<TPassageType> = {
	/** Must be unique across all passages */
	name: string;
	passage: TPassageType;
};

export type {
	SugarBoxVariables,
	SugarBoxConfig,
	SugarBoxMetadata,
	SugarBoxNormalSaveKey,
	SugarBoxAnyKey,
	SugarBoxSaveKey,
	SugarBoxSaveData,
	SugarBoxExportData,
	SugarBoxAchievementsKey,
	SugarBoxSettingsKey,
	SugarBoxPassage,
	SugarBoxAutoSaveKey,
	SugarBoxSaveVersionCompatiblityMode,
};
