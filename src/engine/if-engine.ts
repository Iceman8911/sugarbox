// Terms:
// - A state snapshot / snapshot is a snapshot of the changed variables at a given point in time. It could be the initial state, or a partial update.
// - The initial state is the original variables object, which is immutable.
// - The state is the combination of the initial state and all partial updates (up to a specified index).
// - A partial update only contains changes to the state, not the entire state.
// - The current state snapshot is the last state in the list, which is mutable.

import QuickLRU from "quick-lru";
import type { SugarBoxConfig, SugarBoxMetadata } from "../types/if-engine";

const defaultConfig = {
	maxStateCount: 100,

	stateMergeCount: 1,
} as const satisfies SugarBoxConfig;

type State<TVariables extends Record<string, unknown>> = TVariables &
	SugarBoxMetadata;

type Snapshot<TVariables extends Record<string, unknown>> = Partial<
	TVariables & SugarBoxMetadata
>;

class SugarboxEngine<
	TVariables extends Record<string, unknown> = Record<string, unknown>,
> {
	/** Contains partial updates to the state as a result of moving forwards in the story.
	 *
	 * This is also the "state history"
	 */
	#stateSnapshots: Array<Snapshot<TVariables>>;

	/**  Contains the structure of stateful variables in the engine.
	 *
	 * Will not be modified after initialization.
	 */
	readonly #initialState: Readonly<State<TVariables>>;

	/** The current position in the state history that the engine is playing.
	 *
	 * This is used to determine the current state of the engine.
	 */
	#index: number;

	#config: SugarBoxConfig;

	/** Since recalculating the current state can be expensive */
	#stateCache: QuickLRU<number, State<TVariables>> = new QuickLRU({
		maxSize: 10,
	});

	constructor(
		readonly name: string,
		initialState: TVariables,
		config: Partial<SugarBoxConfig> = defaultConfig,
	) {
		/** Initialize the state with the provided initial state */
		this.#initialState = { ...initialState, _id: "" };

		this.#stateSnapshots = [{}];

		this.#index = 0;

		this.#config = { ...defaultConfig, ...config };
	}

	/** Returns a readonly copy of the current state of stored variables.
	 *
	 * May be expensive to calculate depending on the history of the story.
	 */
	get vars(): Readonly<TVariables> {
		return this.#getStateAtIndex(this.#index);
	}

	/** Use this **ONLY** for setting variables in the current snapshot.
	 *
	 * Attempting to read properties from this will likely return `undefined`.
	 */
	get mutable(): Snapshot<TVariables> {
		// Since the user is using this likely to modify it, clear this entry from the cache
		this.#stateCache.delete(this.#lastSnapshotIndex);

		return this.#getSnapshotAtIndex(this.#lastSnapshotIndex);
	}

	/** Returns the id to the appropriate passage for the current state */
	get passageId(): string {
		return this.#getStateAtIndex(this.#index)._id;
	}

	/** The current position in the state history that the engine is playing.
	 *
	 * This is used to determine the current state of the engine.
	 *
	 * READONLY VERSION
	 */
	get index(): number {
		return this.#index;
	}

	/** Moves at least one step forward in the state history.
	 *
	 * Does nothing if already at the most recent state snapshot.
	 */
	forward(step = 1): void {
		const newIndex = this.#index + step;

		if (newIndex >= this.#snapshotCount) {
			this.#index = this.#lastSnapshotIndex;
		} else {
			this.#index = newIndex;
		}
	}

	/** Moves at least one step backwards in the state history.
	 *
	 * Does nothing if already at the first state snapshot.
	 */
	backward(step = 1): void {
		const newIndex = this.#index - step;

		if (newIndex < 0) {
			this.#index = 0;
		} else {
			this.#index = newIndex;
		}
	}

	/** Creates a brand new empty state right after the current history's index and returns a reference to it
	 *
	 * This will replace any existing state at the current index + 1.
	 */
	#addNewSnapshot(): Snapshot<TVariables> {
		const { maxStateCount, stateMergeCount } = this.#config;

		if (this.#snapshotCount >= maxStateCount) {
			// If the maximum number of states is reached, merge the last two snapshots
			this.#mergeSnapshots(0, stateMergeCount);
		}

		const indexForNewSnapshot = this.#index + 1;

		this.#stateSnapshots[indexForNewSnapshot] = {};

		return this.#getSnapshotAtIndex(indexForNewSnapshot);
	}

	get #snapshotCount(): number {
		return this.#stateSnapshots.length;
	}

	get #lastSnapshotIndex(): number {
		return this.#snapshotCount - 1;
	}

	/** Inclusively combines the snapshots within the given range of indexes to free up space.
	 *
	 * It also creates a new snapshot list to replace the old one.
	 */
	#mergeSnapshots(lowerIndex: number, upperIndex: number): void {
		const lastIndex = this.#lastSnapshotIndex;

		if (lastIndex < 1 || upperIndex < lowerIndex) return; // No snapshots to merge

		upperIndex = Math.min(upperIndex, lastIndex);

		const indexesToMerge: ReadonlySet<number> = new Set(
			Array.from(Array(upperIndex - lowerIndex + 1), (_, i) => lowerIndex + i),
		);

		const combinedSnapshot: Snapshot<TVariables> = {};

		const newSnapshotArray: Array<Snapshot<TVariables>> = [];

		for (let i = 0; i < this.#snapshotCount; i++) {
			const currentSnapshot = this.#getSnapshotAtIndex(i);

			// Merge the snapshot at this index into the combined snapshot
			if (indexesToMerge.has(i)) {
				let key: keyof Snapshot<TVariables>;

				for (key in currentSnapshot) {
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

		this.#stateSnapshots = newSnapshotArray;

		this.#stateCache.clear();
	}

	#getSnapshotAtIndex(index: number): Snapshot<TVariables> {
		const possibleSnapshot = this.#stateSnapshots[index];

		if (!possibleSnapshot) throw new RangeError("Snapshot index out of bounds");

		return possibleSnapshot;
	}

	#getStateAtIndex(
		index: number = this.#lastSnapshotIndex,
	): Readonly<State<TVariables>> {
		const stateLength = this.#snapshotCount;

		const effectiveIndex = Math.min(Math.max(0, index), stateLength - 1);

		const cachedState = this.#stateCache.get(effectiveIndex);

		if (cachedState) return cachedState;

		const state = this.#cloneState(this.#initialState);

		for (let i = 0; i <= effectiveIndex; i++) {
			let partialUpdateKey: keyof TVariables;

			const partialUpdate: Snapshot<TVariables> = this.#getSnapshotAtIndex(i);

			for (partialUpdateKey in partialUpdate) {
				const partialUpdateData = partialUpdate[partialUpdateKey];

				// Ignore only undefined values
				if (partialUpdateData !== undefined) {
					state[partialUpdateKey] = partialUpdateData;
				}
			}
		}

		// Cache the state for future use
		this.#stateCache.set(effectiveIndex, state);

		return state;
	}

	#cloneState(state: State<TVariables>): State<TVariables> {
		// TODO: Use structuredClone and custom clone functions for complex / custom types
		return structuredClone(state);
	}
}

export { SugarboxEngine };
