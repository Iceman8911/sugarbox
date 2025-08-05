/** All userland custom classes need to implement this if they must be part of the story's state */
type SugarBoxCompatibleClassInstance<TClassInstance, TSerializedStructure> = {
	/** Must return a deeply-cloned copy of the class.
	 *
	 * Used to copy over classes into the current state.
	 */
	__clone: () => TClassInstance;

	/** Must return a serializable (using SuperJSON) plain object that when deserialized, can be reinitialized into an identical clone of the class.
	 *
	 * Is required for persistence.
	 */
	__toJSON: () => TSerializedStructure;
};

/** All userland custom class constructors need to implement this if they must be part of the story's state */
type SugarBoxCompatibleClassConstructor<TClassInstance, TSerializedStructure> =
	{
		new (
			...args: unknown[]
		): SugarBoxCompatibleClassInstance<TClassInstance, TSerializedStructure>;

		/** Immutable id that must be stable (i.e never ever change if you wish to keep current saves compatible) since it is used to index registered classes in the engine */
		readonly __classId: string;

		/** Static method for reviving the class */
		__fromJSON(
			serializedData: TSerializedStructure,
		): SugarBoxCompatibleClassInstance<TClassInstance, TSerializedStructure>;

		prototype: SugarBoxCompatibleClassInstance<
			TClassInstance,
			TSerializedStructure
		>;
	};

/** Typescript work around for ensuring that constructors have the appropriate static methods */
type SugarBoxCompatibleClassConstructorCheck<
	TSerializedStructure,
	TClassConstructor extends SugarBoxCompatibleClassConstructor<
		TClassConstructor["prototype"],
		TSerializedStructure
	>,
> = TClassConstructor;

export type {
	SugarBoxCompatibleClassInstance,
	SugarBoxCompatibleClassConstructor,
	SugarBoxCompatibleClassConstructorCheck,
};
