import type { SugarBoxAnyKey, SugarBoxMetadata } from "./if-engine";

/** Interface that any cache infrastructure must abide to */
type CacheAdapter<TKey, TData> = {
	set(key: TKey, data: TData): unknown;

	get(key: TKey): TData | undefined | null;

	delete(key: TKey): unknown;

	clear(): unknown;
};

/** Cache Adapter specifically for caching the state of variables */
type SugarBoxCacheAdapter<TStateVariables extends Record<string, unknown>> =
	CacheAdapter<number, TStateVariables & SugarBoxMetadata>;

/** Interface that any persistence infrastructure must abide to */
type PersistenceAdapter<TKey, TData> = {
	set(key: TKey, data: TData): Promise<unknown>;

	get(key: TKey): Promise<TData | undefined | null>;

	delete(key: TKey): Promise<unknown>;

	/** If provided, makes returning an iterable / list of used save slots more efficient. Otherwise, `get()` will be used as a workaround */
	keys?(): Promise<Iterable<TKey>>;
};

/** Persistence Adapter specifically for saving the state of variables */
type SugarBoxPersistenceAdapter = PersistenceAdapter<SugarBoxAnyKey, string>;

export type {
	CacheAdapter as GenericCacheAdapter,
	PersistenceAdapter as GenericPersistenceAdapter,
	SugarBoxPersistenceAdapter,
	SugarBoxCacheAdapter,
};
