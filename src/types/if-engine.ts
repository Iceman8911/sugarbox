import type { CacheAdapter } from "./adapters";

type SugarBoxVariables<
	TStructure extends Record<string, unknown> = Record<string, unknown>,
> = TStructure;

/** Special information attached to every state snapshot */
type SugarBoxMetadata = {
	/** Passage ID for the state snapshot */
	_id: string;
};

type SugarBoxConfig<
	TStructure extends Record<string, unknown> = Record<string, unknown>,
> = {
	/** Maximum number of individual states that will be stored before old ones get merged into each other */
	maxStateCount: number;

	/** Number of individual states that will be merged into one when the state fills up */
	stateMergeCount: number;

	/** Optional cache adapter to use to speed up state fetching */
	cache?: CacheAdapter<
		number,
		SugarBoxVariables<TStructure> & SugarBoxMetadata
	>;
};

export type { SugarBoxVariables, SugarBoxConfig, SugarBoxMetadata };
