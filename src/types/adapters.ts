/** Interface that any cache infrastructure must abide to */
type CacheAdapter<TKey, TData> = {
	set(key: TKey, data: TData): unknown;

	get(key: TKey): TData | undefined | null;

	delete(key: TKey): unknown;

	clear(): unknown;
};

/** Interface that any persistence infrastructure must abide to */
type PersistenceAdapter<TKey, TData> = {
	set(key: TKey, data: TData): Promise<unknown>;

	get(key: TKey): Promise<TData | undefined | null>;

	delete(key: TKey): Promise<unknown>;
};

export type { CacheAdapter, PersistenceAdapter };
