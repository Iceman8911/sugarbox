/** All userland custom classes need to implement this if they must be part of the story's state */
type SugarBoxCompatibleClassInstance<TClassInstance> = {
	/** Must return a deeply-cloned copy of the class.
	 *
	 * Used to copy over classes into the current state.
	 */
	__clone: () => TClassInstance;

	/** Must return a string that when deserialized, can be reinitialized into an identical clone of the class.
	 *
	 * Is required for persistence.
	 */
	__toJSON: () => string;
};

type SugarBoxCompatibleClassConstructor<TClassInstance, TSerializedData> = {
	new (...args: unknown[]): SugarBoxCompatibleClassInstance<TClassInstance>;

	/** Immutable id that must be stable (i.e never ever change if you wish to keep current saves compatible) since it is used to index registered classes in the engine */
	readonly __classId: string;

	/** Static method for reviving the class */
	__fromJSON(
		serializedData: TSerializedData,
	): SugarBoxCompatibleClassInstance<TClassInstance>;

	prototype: SugarBoxCompatibleClassInstance<TClassInstance>;
};

export type {
	SugarBoxCompatibleClassInstance,
	SugarBoxCompatibleClassConstructor,
};
