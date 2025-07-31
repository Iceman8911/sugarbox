// Terms:
// - A state snapshot / snapshot is a snapshot of the changed variables at a given point in time. It could be the initial state, or a partial update.
// - The initial state is the original variables object, which is immutable.
// - The state is the combination of the initial state and all partial updates (up to a specified index).
// - A partial update only contains changes to the state, not the entire state.
// - The current state snapshot is the last state in the list, which is mutable.

import QuickLRU from "quick-lru";
import type { SugarBoxConfig } from "../types/if-engine";

const defaultConfig = {
	maxStateCount: 100,

	stateMergeCount: 1,
} as const satisfies SugarBoxConfig;

class SugarboxEngine<
	TVariables extends Record<string, unknown> = Record<string, unknown>,
> {
	/** Contains partial updates to the state as a result of moving forwards in the story.
	 *
	 * This is also the "state history"
	 */
	private _stateSnapshots: Array<Partial<TVariables>>;

	/**  Contains the structure of stateful variables in the engine.
	 *
	 * Will not be modified after initialization.
	 */
	private readonly _initialState: Readonly<TVariables>;

	/** The current position in the state history that the engine is playing.
	 *
	 * This is used to determine the current state of the engine.
	 */
	private _index: number;

	private _config: SugarBoxConfig;

	/** Since recalculating the current state can be expensive */
	private _stateCache: QuickLRU<number, TVariables> = new QuickLRU({
		maxSize: 10,
	});

	constructor(
		readonly name: string,
		initialState: TVariables,
		config: SugarBoxConfig = defaultConfig,
	) {
		/** Initialize the state with the provided initial state */
		this._initialState = initialState;

		this._stateSnapshots = [{}];

		this._index = 0;

		this._config = config;
	}

	/** Returns a readonly copy of the current state of stored variables.
	 *
	 * May be expensive to calculate depending on the history of the story.
	 */
	get vars(): Readonly<TVariables> {
		return this._getStateAtIndex(this._index);
	}

	/** Use this **ONLY** for setting variables in the current snapshot.
	 *
	 * Attempting to read properties from this will likely return `undefined`.
	 */
	get mutable(): Partial<TVariables> {
		// Since the user is using this likely to modify it, clear this entry from the cache
		this._stateCache.delete(this._lastSnapshotIndex);

		return this._getSnapshotAtIndex(this._lastSnapshotIndex);
	}

	/** The current position in the state history that the engine is playing.
	 *
	 * This is used to determine the current state of the engine.
	 *
	 * READONLY VERSION
	 */
	get index(): number {
		return this._index;
	}

	/** Moves at least one step forward in the state history.
	 *
	 * Does nothing if already at the most recent state snapshot.
	 */
	forward(step = 1): void {
		const newIndex = this._index + step;

		if (newIndex >= this._snapshotCount) {
			this._index = this._lastSnapshotIndex;
		} else {
			this._index = newIndex;
		}
	}

	/** Moves at least one step backwards in the state history.
	 *
	 * Does nothing if already at the first state snapshot.
	 */
	backward(step = 1): void {
		const newIndex = this._index - step;

		if (newIndex < 0) {
			this._index = 0;
		} else {
			this._index = newIndex;
		}
	}

	/** Creates a brand new empty state right after the current history's index.
	 *
	 * This will replace any existing state at the current index + 1.
	 */
	private _addNewSnapshot(): void {
		const { maxStateCount, stateMergeCount } = this._config;

		if (this._snapshotCount >= maxStateCount) {
			// If the maximum number of states is reached, merge the last two snapshots
			this._mergeSnapshots(0, stateMergeCount);
		}

		this._stateSnapshots[this._index + 1] = {};
	}

	private get _snapshotCount(): number {
		return this._stateSnapshots.length;
	}

	private get _lastSnapshotIndex(): number {
		return this._snapshotCount - 1;
	}

	/** Inclusively combines the snapshots within the given range of indexes to free up space.
	 *
	 * It also creates a new snapshot list to replace the old one.
	 */
	private _mergeSnapshots(lowerIndex: number, upperIndex: number): void {
		const lastIndex = this._lastSnapshotIndex;

		if (lastIndex < 1 || upperIndex < lowerIndex) return; // No snapshots to merge

		upperIndex = Math.min(upperIndex, lastIndex);

		const indexesToMerge: ReadonlySet<number> = new Set(
			Array.from(Array(upperIndex - lowerIndex + 1), (_, i) => lowerIndex + i),
		);

		const combinedSnapshot: Partial<TVariables> = {};

		const newSnapshotArray: typeof this._stateSnapshots = [];

		for (let i = 0; i < this._snapshotCount; i++) {
			const currentSnapshot = this._getSnapshotAtIndex(i);

			// Merge the snapshot at this index into the combined snapshot
			if (indexesToMerge.has(i)) {
				for (const key in currentSnapshot) {
					const value = currentSnapshot[key];

					if (value !== undefined) {
						combinedSnapshot[key] = value;
					}
				}

				// If this is the last snapshot in the range, add the combined snapshot
				if (i === upperIndex) {
					newSnapshotArray.push(combinedSnapshot);
				}
			} else {
				// Keep the snapshot as is
				newSnapshotArray.push(currentSnapshot);
			}
		}

		this._stateSnapshots = newSnapshotArray;

		this._stateCache.clear();
	}

	private _getSnapshotAtIndex(index: number): Partial<TVariables> {
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

		const state = this._cloneState(this._initialState);

		for (let i = 0; i <= effectiveIndex; i++) {
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

	private _cloneState(state: TVariables): TVariables {
		// TODO: Use structuredClone and custom clone functions for complex / custom types
		return structuredClone(state);
	}
}

export { SugarboxEngine };
