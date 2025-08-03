import type { CacheAdapter, PersistenceAdapter } from "./adapters";

type SugarBoxVariables<
	TStructure extends Record<string, unknown> = Record<string, unknown>,
> = TStructure;

/** Special information attached to every state snapshot */
type SugarBoxMetadata = {
	/** Passage ID for the state snapshot */
	_id: string;
};

/** Keys used for indexing save data
 *
 * Consists of the engine's name and save slot number
 */
type SugarBoxSaveKey = `sugarbox-${string}-${number}`;

type SugarBoxAchievementsKey = `sugarbox-${string}-achievements`;

type SugarBoxSettingsKey = `sugarbox-${string}-settings`;

/** Data structure used for saving the state of the engine
 *
 * Contains initial state, snapshots, and current story index
 */
type SugarBoxSaveData<
	TStructure extends Record<string, unknown> = Record<string, unknown>,
> = {
	intialState: SugarBoxVariables<TStructure> & SugarBoxMetadata;
	snapshots: Partial<SugarBoxVariables<TStructure> & SugarBoxMetadata>[];
	storyIndex: number;
};

/** Export data structure used for saving the state of the engine to disk.
 *
 * Contains save data, settings, and achievements
 */
type SugarBoxExportData<
	TSaveData extends Record<string, unknown> = Record<string, unknown>,
	TSettingsData extends Record<string, unknown> = Record<string, unknown>,
	TAchievementData extends Record<string, boolean> = Record<string, boolean>,
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
	 */
	saveSlots: number;

	/** Optional cache adapter to use to speed up state fetching */
	cache?: CacheAdapter<
		number,
		SugarBoxVariables<TStructure> & SugarBoxMetadata
	>;

	/** Optional persistence adapter for saving support */
	persistence?: PersistenceAdapter<
		SugarBoxSaveKey | SugarBoxAchievementsKey | SugarBoxSettingsKey,
		string
	>;
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
	SugarBoxSaveKey,
	SugarBoxSaveData,
	SugarBoxExportData,
	SugarBoxAchievementsKey,
	SugarBoxSettingsKey,
	SugarBoxPassage,
};
