// Terms:
// - A state snapshot / snapshot is a snapshot of the changed variables at a given point in time. It could be the initial state, or a partial update.
// - A state is the combination of the initial state and all partial updates (up to a specified index).
// - A partial update only contains changes to the state, not the entire state.
// - The initial state snapshot is the first state in the list, which is immutable.
// - The current state snapshot is the last state in the list, which is mutable.

import QuickLRU from "quick-lru";
import type { SugarBoxConfig } from "../types/if-engine";

const defaultConfig: SugarBoxConfig = {
	maxStateCount: 100,
};

class SugarboxEngine<
	TVariables extends Record<string, unknown> = Record<string, unknown>,
> {
	/** Contains the structure of stateful variables in the engine.
	 *
	 * The first element is the initial state, and subsequent elements are partial updates to the state as a result of moving forwards in the story.
	 */
	private _stateSnapshots: [
		Readonly<TVariables>,
		...Array<Partial<TVariables>>,
	];

	private _config: SugarBoxConfig;

	/** Since recalculating the current state can be expensive */
	private _stateCache: QuickLRU<number, TVariables> = new QuickLRU({
		maxSize: 10,
	});

	constructor(
		initialState: TVariables,
		config: SugarBoxConfig = defaultConfig,
	) {
		/** Initialize the state with the provided initial state */
		this._stateSnapshots = [initialState, {}];

		this._config = config;
	}

	/** Returns a readonly copy of the current state of stored variables.
	 *
	 * May be expensive to calculate depending on the history of the story.
	 */
	get vars(): Readonly<TVariables> {
		return this._getStateAtIndex(this._lastSnapshotIndex);
	}

	/** Use this for setting variables in the current snapshot */
	get mutable(): Partial<TVariables> {
		return this._getSnapshotAtIndex(this._lastSnapshotIndex);
	}

	/** Pushes a brand new empty state unto the state list */
	private _addNewSnapshot(): void {
		const { maxStateCount } = this._config;

		this._stateSnapshots.push({});
	}

	private get _snapshotCount(): number {
		return this._stateSnapshots.length;
	}

	private get _lastSnapshotIndex(): number {
		return this._snapshotCount - 1;
	}

	private _mergeSnapshots(): void {}

	private get _initialState(): TVariables {
		return this._cloneState(this._stateSnapshots[0]);
	}

	private _getSnapshotAtIndex(
		index: number,
	): Readonly<TVariables> | Partial<TVariables> {
		const possibleSnapshot = this._stateSnapshots[index];

		if (!possibleSnapshot) throw new RangeError("Snapshot index out of bounds");

		return possibleSnapshot;
	}

	private _getStateAtIndex(
		index: number = this._lastSnapshotIndex,
	): Readonly<TVariables> {
		const stateLength = this._snapshotCount;

		const effectiveIndex = Math.min(Math.max(0, index), stateLength - 1);

		const cachedState = this._stateCache.get(effectiveIndex);

		if (cachedState) return cachedState;

		const state = this._initialState;

		for (let i = 1; i <= effectiveIndex; i++) {
			let partialUpdateKey: keyof TVariables;

			const partialUpdate: Partial<TVariables> = this._getSnapshotAtIndex(i);

			for (partialUpdateKey in partialUpdate) {
				const partialUpdateData = partialUpdate[partialUpdateKey];

				// Ignore only undefined values
				if (partialUpdateData !== undefined) {
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

export { SugarboxEngine };
