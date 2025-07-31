import QuickLRU from "quick-lru";

class InteractiveFictionEngine<
	TVariables extends Record<string, unknown> = Record<string, unknown>,
> {
	/** Contains the structure of stateful variables in the engine.
	 *
	 * The first element is the initial state, and subsequent elements are partial updates to the state as a result of moving forwards in the story.
	 *
	 * Only the **most recent** state is mutable
	 */
	private _stateList: [
		Readonly<TVariables>,
		...Array<Partial<TVariables> | null>,
	];

	/** Since recalculating the current state can be expensive */
	private _stateCache: QuickLRU<number, TVariables> = new QuickLRU({
		maxSize: 10,
	});

	private constructor(initialState: TVariables) {
		/** Initialize the state with the provided initial state */
		this._stateList = [initialState];
	}

	/** Returns the current state of stored variables */
	get vars(): TVariables {
		return this._getStateAtIndex(this._stateList.length - 1);
	}

	private get _initialState(): TVariables {
		return this._cloneState(this._stateList[0]);
	}

	private _getStateAtIndex(
		index: number = this._stateList.length,
	): Readonly<TVariables> {
		const stateLength = this._stateList.length;

		const effectiveIndex = Math.min(Math.max(0, index), stateLength - 1);

		const cachedState = this._stateCache.get(effectiveIndex);

		if (cachedState) return cachedState;

		const state = this._initialState;

		for (let i = 1; i <= effectiveIndex; i++) {
			let partialUpdateKey: keyof TVariables;

			const partialUpdate: Partial<TVariables> | null =
				this._stateList[i] ?? null;

			if (!partialUpdate) continue;

			for (partialUpdateKey in partialUpdate) {
				const partialUpdateData = partialUpdate[partialUpdateKey];

				if (partialUpdateData != null) {
					state[partialUpdateKey] = partialUpdateData;
				}
			}
		}

		// Cache the state for future use
		this._stateCache.set(effectiveIndex, state);

		return state;
	}

	private _cloneState(state: TVariables): Readonly<TVariables> {
		// TODO: Use structuredClone and custom clone functions for complex / custom types
		return structuredClone(state);
	}
}

export { InteractiveFictionEngine };
