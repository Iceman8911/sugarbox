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
		SugarBoxSaveKey,
		/** Make the inital state and snapshots a serialized string */
		{
			intialState: SugarBoxVariables<TStructure> & SugarBoxMetadata;
			snapshots: Partial<SugarBoxVariables<TStructure> & SugarBoxMetadata>[];
			storyIndex: number;
		}
	>;
};

export type {
	SugarBoxVariables,
	SugarBoxConfig,
	SugarBoxMetadata,
	SugarBoxSaveKey,
};
