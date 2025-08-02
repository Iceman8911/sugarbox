/** All userland custom classes need to implement this if they must be part of the story's state */
type SugarBoxCompatibleClass<TClassInstance> = {
	/** Must return a deeply-cloned copy of the class.
	 *
	 * Used to copy over classes into the current state.
	 */
	_clone: () => TClassInstance;

	/** Must return a string that when deserialized, can be reinitialized into an identical clone of the class.
	 *
	 * Is required for persistence.
	 */
	_toJSON: () => string;
};

export type { SugarBoxCompatibleClass };
