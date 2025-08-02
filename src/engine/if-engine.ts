// Terms:
// - A state snapshot / snapshot is a snapshot of the changed variables at a given point in time. It could be the initial state, or a partial update.
// - The initial state is the original variables object, which is immutable.
// - The state is the combination of the initial state and all partial updates (up to a specified index).
// - A partial update only contains changes to the state, not the entire state.
// - The current state snapshot is the last state in the list, which is mutable.

import type { CacheAdapter } from "../types/adapters";
import type {
	SugarBoxConfig,
	SugarBoxMetadata,
	SugarBoxSaveKey,
} from "../types/if-engine";

const defaultConfig = {
	maxStateCount: 100,

	stateMergeCount: 1,

	saveSlots: 20,
} as const satisfies SugarBoxConfig;

const MINIMUM_SAVE_SLOT_INDEX = 0;

const MINIMUM_SAVE_SLOTS = 1;

type StateWithMetadata<TVariables extends Record<string, unknown>> =
	TVariables & SugarBoxMetadata;

type SnapshotWithMetadata<TVariables extends Record<string, unknown>> = Partial<
	TVariables & SugarBoxMetadata
>;

type State<TVariables extends Record<string, unknown>> = TVariables;

type Snapshot<TVariables extends Record<string, unknown>> = Partial<TVariables>;

type Config<TState extends Record<string, unknown>> = Partial<
	SugarBoxConfig<StateWithMetadata<TState>>
>;

/** Events fired from a `SugarBoxEngine` instance */
type SugarBoxEvents<TPassageData, TPartialSnapshot> = {
	":passageChange": Readonly<{
		/** The previous passage before the transition */
		oldPassage: TPassageData | null;

		/** The new passage after the transition */
		newPassage: TPassageData | null;
	}>;

	":stateChange": Readonly<{
		/** The previous snapshot of only variables (to be changed) before the change */
		oldState: TPartialSnapshot;

		/** A collection of only the changed variables after the change */
		newState: TPartialSnapshot;
	}>;

	":init": null;
};

/** The main engine for Sugarbox that provides headless interface to basic utilities required for Interactive Fiction
 *
 * Dispatches custom events that can be listened to with "addEventListener"
 */
class SugarboxEngine<
	TPassageType extends string | object,
	TVariables extends Record<string, unknown> = Record<string, unknown>,
> {
	/** Contains partial updates to the state as a result of moving forwards in the story.
	 *
	 * This is also the "state history"
	 */
	#stateSnapshots: Array<SnapshotWithMetadata<TVariables>>;

	/**  Contains the structure of stateful variables in the engine.
	 *
	 * Will not be modified after initialization.
	 */
	readonly #initialState: Readonly<StateWithMetadata<TVariables>>;

	/** The current position in the state history that the engine is playing.
	 *
	 * This is used to determine the current state of the engine.
	 */
	#index: number;

	#config: SugarBoxConfig;

	/** Indexed by the passage id.
	 *
	 * Each value is the passage data, which could be a html string, markdown string, regular string, or more complex things like a jsx component, etc.
	 */
	#passages = new Map<string, TPassageType>();

	/** Since recalculating the current state can be expensive */
	#stateCache?: CacheAdapter<number, StateWithMetadata<TVariables>>;

	#eventTarget = new EventTarget();

	private constructor(
		/** Must be unique to prevent conflicts */
		readonly name: string,
		initialState: TVariables,
		essentialPassages: [string, TPassageType][],
		config: Config<TVariables> = defaultConfig,
	) {
		/** Initialize the state with the provided initial state */
		// TODO: don't harcode the intiial passage id
		this.#initialState = { ...initialState, _id: "" };

		this.#stateSnapshots = [{}];

		this.#index = 0;

		const { cache, saveSlots } = config;

		if (saveSlots && saveSlots < MINIMUM_SAVE_SLOTS)
			throw new Error(`Invalid number of save slots: ${saveSlots}`);

		this.#config = { ...defaultConfig, ...config };

		this.addPassages(essentialPassages);

		if (cache) {
			this.#stateCache = cache;
		}
	}

	/** Use this to initialize the engine */
	static init<
		TPassageType extends string | object,
		TVariables extends Record<string, unknown> = Record<string, unknown>,
	>(args: {
		name: string;

		variables: TVariables;

		/** Critical passages that must be available asap.
		 *
		 * The first argument is the passage id */
		passages: [string, TPassageType][];

		config?: Config<TVariables>;
	}): SugarboxEngine<TPassageType, TVariables> {
		const { config, name, passages, variables } = args;

		const engine = new SugarboxEngine<TPassageType, TVariables>(
			name,
			variables,
			passages,
			config,
		);

		return engine;
	}

	/** Returns a readonly copy of the current state of stored variables.
	 *
	 * May be expensive to calculate depending on the history of the story.
	 */
	get vars(): Readonly<State<TVariables>> {
		return this.#getStateAtIndex(this.#index);
	}

	/** Immer-style way of updating story variables
	 *
	 * Use this **solely** for setting values. If you must read a value, use `this.vars`
	 */
	setVars(producer: (variables: State<TVariables>) => void): void {
		const self = this;

		const snapshot = self.#getSnapshotAtIndex(self.#index);

		const currentStateBeforeChange = self.#getStateAtIndex(this.#index);

		type SnapshotProp = keyof typeof snapshot | symbol;

		const proxy = new Proxy(snapshot, {
			// To ensure that when attempting to set the values of nested properties (`variables.inventory?.gold = 30`), the missing value (`inventory`) is copied over
			get(target, prop: SnapshotProp, receiver) {
				if (typeof prop !== "symbol") {
					const originalValue = target[prop];

					// Since it is undefined, copy over the property from the previous state
					if (originalValue === undefined) {
						const previousStateValue = self.#getStateAtIndex(self.#index - 1)[
							prop
						];

						//@ts-expect-error TS is confused
						target[prop] = clone(previousStateValue);
					}

					return Reflect.get(target, prop, receiver);
				}
			},
		});

		//@ts-expect-error <Missing properties will have their values thanks to the proxy but typescript can't know that>
		producer(proxy);

		// Get the changes and emit them
		const newState = self.#getSnapshotAtIndex(self.#index);

		const oldState: SnapshotWithMetadata<TVariables> = {};

		let newStateKey: keyof typeof newState;

		for (newStateKey in newState) {
			oldState[newStateKey] = currentStateBeforeChange[newStateKey];
		}

		self.#emitCustomEvent(":stateChange", {
			newState,
			oldState,
		});

		// Clear the cache entry for this since it has been changed
		self.#stateCache?.delete(self.#index);
	}

	/** Returns the id to the appropriate passage for the current state */
	get passageId(): string {
		return this.#getStateAtIndex(this.#index)._id;
	}

	/** Returns the passage data for the current state.
	 *
	 * If the passage does not exist, returns `null`.
	 */
	get passage(): TPassageType | null {
		return this.#passages.get(this.passageId) ?? null;
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
			this.#setIndex(this.#lastSnapshotIndex);
		} else {
			this.#setIndex(newIndex);
		}
	}

	/** Moves at least one step backwards in the state history.
	 *
	 * Does nothing if already at the first state snapshot.
	 */
	backward(step = 1): void {
		const newIndex = this.#index - step;

		if (newIndex < 0) {
			this.#setIndex(0);
		} else {
			this.#setIndex(newIndex);
		}
	}

	/** Adds a new passage to the engine.
	 *
	 * The passage id should be unique, and the data can be anything that you want to store for the passage.
	 *
	 * If the passage already exists, it will be overwritten.
	 */
	addPassage(passageId: string, passageData: TPassageType): void {
		this.#passages.set(passageId, passageData);
	}

	/** Like `addPassage`, but takes in a collection */
	addPassages(passages: [string, TPassageType][]): void {
		for (const { "0": passageId, "1": passageData } of passages) {
			this.addPassage(passageId, passageData);
		}
	}

	/** Creates and moves the index over to a new snapshot with the given passage id (or the previous one) and returns a reference to it.
	 *
	 * This is essentially the way of linking between passages in the story.
	 *
	 * @throws if the passage id hasn't been added to the engine
	 */
	navigateTo(
		passageId: string = this.passageId,
	): SnapshotWithMetadata<TVariables> {
		if (!this.#isPassageIdValid(passageId))
			throw new Error(
				`Cannot navigate: Passage with ID '${passageId}' not found. Add it using addPassage().`,
			);

		const newSnapshot = this.#addNewSnapshot();

		//@ts-expect-error - At the moment, there's no way to enforce that TVariables should not have a `_id` property
		newSnapshot._id = passageId;

		this.#setIndex(this.#index + 1);

		return newSnapshot;
	}

	/** Subscribe to an event */
	on<TEventType extends keyof SugarBoxEvents<TPassageType, TVariables>>(
		type: TEventType,
		listener: (
			event: CustomEvent<SugarBoxEvents<TPassageType, TVariables>[TEventType]>,
		) => void,
		options?: boolean | AddEventListenerOptions,
	): void {
		//@ts-expect-error TS doesn't know that the custom event will exist at runtime
		this.#eventTarget.addEventListener(type, listener, options);
	}

	/** Unsubscribe from an event */
	off<TEventType extends keyof SugarBoxEvents<TPassageType, TVariables>>(
		type: TEventType,
		listener:
			| ((
					event: CustomEvent<
						SugarBoxEvents<TPassageType, TVariables>[TEventType]
					>,
			  ) => void)
			| null,
		options?: boolean | AddEventListenerOptions,
	): void {
		//@ts-expect-error TS doesn't know that the custom event will exist at runtime
		this.#eventTarget.removeEventListener(type, listener, options);
	}

	/** Using the provided persistence adapter, this saves all vital data for the combined state, metadata, and current index  */
	async save(saveSlot: number): Promise<void> {
		const { saveSlots: MAX_SAVE_SLOTS, persistence } = this.#config;

		const ERROR_TEXT = "Unable to save.";

		if (saveSlot < MINIMUM_SAVE_SLOT_INDEX || saveSlot >= MAX_SAVE_SLOTS) {
			throw new Error(`${ERROR_TEXT} Save slot ${saveSlot} is invalid.`);
		}

		if (!persistence) {
			throw new Error(`${ERROR_TEXT} No persistence adapter`);
		}

		const saveKey = this.#getSaveKeyFromSaveSlotNumber(saveSlot);

		await persistence.set(saveKey, {
			intialState: this.#initialState,
			snapshots: this.#stateSnapshots,
			storyIndex: this.index,
		});
	}

	// async load(saveSlot: number) {}

	// async saveToDisk() {}

	// async loadFromDisk(data: unknown) {}

	#getSaveKeyFromSaveSlotNumber(saveSlot: number): SugarBoxSaveKey {
		return `sugarbox-${this.name}-${saveSlot}`;
	}

	#isPassageIdValid(passageId: string): boolean {
		return this.#passages.has(passageId);
	}

	#setIndex(val: number) {
		if (val < 0 || val >= this.#snapshotCount) {
			throw new RangeError("Index out of bounds");
		}

		const oldPassage = this.passage;

		const oldSnapshot = this.#getSnapshotAtIndex(this.#index);

		this.#index = val;

		// Emit the events for passage and state changes
		this.#emitCustomEvent(":passageChange", {
			newPassage: this.passage,
			oldPassage,
		});

		this.#emitCustomEvent(":stateChange", {
			newState: this.#getSnapshotAtIndex(this.#index),
			oldState: oldSnapshot,
		});
	}

	/** Creates a brand new empty state right after the current history's index and returns a reference to it
	 *
	 * This will replace any existing state at the current index + 1.
	 */
	#addNewSnapshot(): SnapshotWithMetadata<TVariables> {
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

		const combinedSnapshot: SnapshotWithMetadata<TVariables> = {};

		const newSnapshotArray: Array<SnapshotWithMetadata<TVariables>> = [];

		for (let i = 0; i < this.#snapshotCount; i++) {
			const currentSnapshot = this.#getSnapshotAtIndex(i);

			// Merge the snapshot at this index into the combined snapshot
			if (indexesToMerge.has(i)) {
				let key: keyof SnapshotWithMetadata<TVariables>;

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

		this.#stateCache?.clear();
	}

	/**
	 *
	 * @throws a `RangeError` if the given index does not exist
	 */
	#getSnapshotAtIndex(index: number): SnapshotWithMetadata<TVariables> {
		const possibleSnapshot = this.#stateSnapshots[index];

		if (!possibleSnapshot) throw new RangeError("Snapshot index out of bounds");

		return possibleSnapshot;
	}

	#getStateAtIndex(
		index: number = this.#lastSnapshotIndex,
	): Readonly<StateWithMetadata<TVariables>> {
		const stateLength = this.#snapshotCount;

		const effectiveIndex = Math.min(Math.max(0, index), stateLength - 1);

		const cachedState = this.#stateCache?.get(effectiveIndex);

		if (cachedState) return cachedState;

		const state = this.#cloneState(this.#initialState);

		for (let i = 0; i <= effectiveIndex; i++) {
			let partialUpdateKey: keyof TVariables;

			const partialUpdate: SnapshotWithMetadata<TVariables> =
				this.#getSnapshotAtIndex(i);

			for (partialUpdateKey in partialUpdate) {
				const partialUpdateData = partialUpdate[partialUpdateKey];

				// Ignore only undefined values
				if (partialUpdateData !== undefined) {
					state[partialUpdateKey] = partialUpdateData;
				}
			}
		}

		// Cache the state for future use
		this.#stateCache?.set(effectiveIndex, state);

		return state;
	}

	#createCustomEvent<
		TEventType extends keyof SugarBoxEvents<
			TPassageType,
			SnapshotWithMetadata<TVariables>
		>,
	>(
		name: TEventType,
		data: SugarBoxEvents<
			TPassageType,
			SnapshotWithMetadata<TVariables>
		>[TEventType],
	): CustomEvent<
		SugarBoxEvents<TPassageType, SnapshotWithMetadata<TVariables>>[TEventType]
	> {
		return new CustomEvent(name, { detail: data });
	}

	#dispatchCustomEvent(event: CustomEvent): boolean {
		return this.#eventTarget.dispatchEvent(event);
	}

	#emitCustomEvent<
		TEventType extends keyof SugarBoxEvents<
			TPassageType,
			SnapshotWithMetadata<TVariables>
		>,
	>(
		name: TEventType,
		data: SugarBoxEvents<
			TPassageType,
			SnapshotWithMetadata<TVariables>
		>[TEventType],
	): boolean {
		return this.#dispatchCustomEvent(this.#createCustomEvent(name, data));
	}

	#cloneState(
		state: StateWithMetadata<TVariables>,
	): StateWithMetadata<TVariables> {
		// TODO: Use structuredClone and custom clone functions for complex / custom types
		return structuredClone(state);
	}
}

/** General prupose cloning helper */
function clone<TData>(val: TData): TData {
	// TODO: Add support for custom userland classes
	return structuredClone(val);
}

// For testing
const engine = SugarboxEngine.init({
	name: "Test",
	passages: [["Test Passage", "Balls"]],
	variables: { name: "Dave", inventory: { gold: 123, gems: 12 } },
});

engine.setVars((state) => {
	state.name = "Sheep";

	state.inventory.gems = 21;
});

export { SugarboxEngine };
