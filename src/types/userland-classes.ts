/** All userland custom classes need to implement this if they must be part of the story's state */
type SugarBoxCompatibleClassInstance<TSerializedStructure> = {
	/** Must return a serializable (using SuperJSON) plain object that when deserialized, can be reinitialized into an identical clone of the class.
	 *
	 * Is required for persistence.
	 */
	toJSON: () => TSerializedStructure;
};

/** All userland custom class constructors need to implement this if they must be part of the story's state */
type SugarBoxCompatibleClassConstructor<TSerializedStructure> = {
	new (
		// biome-ignore lint/suspicious/noExplicitAny: <Allow any constructor signature>
		...args: any[]
	): SugarBoxCompatibleClassInstance<TSerializedStructure>;

	/** Immutable id that must be stable (i.e never ever change if you wish to keep current saves compatible) since it is used to index registered classes in the engine */
	readonly classId: string;

	/** Static method for reviving the class */
	fromJSON(
		serializedData: TSerializedStructure,
	): SugarBoxCompatibleClassInstance<TSerializedStructure>;

	prototype: SugarBoxCompatibleClassInstance<TSerializedStructure>;
};

/** Typescript work around for ensuring that constructors have the appropriate static methods */
type SugarBoxCompatibleClassConstructorCheck<
	TSerializedStructure,
	TClassConstructor extends
		SugarBoxCompatibleClassConstructor<TSerializedStructure>,
> = TClassConstructor;

export type {
	SugarBoxCompatibleClassInstance,
	SugarBoxCompatibleClassConstructor,
	SugarBoxCompatibleClassConstructorCheck,
};
