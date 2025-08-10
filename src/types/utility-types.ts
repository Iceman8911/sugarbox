/**
 * Custom utility types to replace TypeFest dependency
 * These provide lean implementations of commonly used type transformations
 */

/**
 * Makes all properties of T readonly recursively
 * Equivalent to TypeFest's ReadonlyDeep<T>
 */
export type ReadonlyDeep<T> = T extends (infer U)[]
	? ReadonlyArray<ReadonlyDeep<U>>
	: T extends ReadonlyArray<infer U>
		? ReadonlyArray<ReadonlyDeep<U>>
		: T extends Map<infer K, infer V>
			? ReadonlyMap<ReadonlyDeep<K>, ReadonlyDeep<V>>
			: T extends ReadonlyMap<infer K, infer V>
				? ReadonlyMap<ReadonlyDeep<K>, ReadonlyDeep<V>>
				: T extends WeakMap<infer K, infer V>
					? WeakMap<ReadonlyDeep<K>, ReadonlyDeep<V>>
					: T extends Set<infer U>
						? ReadonlySet<ReadonlyDeep<U>>
						: T extends ReadonlySet<infer U>
							? ReadonlySet<ReadonlyDeep<U>>
							: T extends WeakSet<infer U>
								? WeakSet<ReadonlyDeep<U>>
								: T extends Promise<infer U>
									? Promise<ReadonlyDeep<U>>
									: T extends object
										? { readonly [K in keyof T]: ReadonlyDeep<T[K]> }
										: T;

/**
 * Makes all properties of T writable recursively
 * Equivalent to TypeFest's WritableDeep<T>
 */
export type WritableDeep<T> = T extends ReadonlyArray<infer U>
	? WritableDeep<U>[]
	: T extends ReadonlyMap<infer K, infer V>
		? Map<WritableDeep<K>, WritableDeep<V>>
		: T extends ReadonlySet<infer U>
			? Set<WritableDeep<U>>
			: T extends object
				? { -readonly [K in keyof T]: WritableDeep<T[K]> }
				: T;
