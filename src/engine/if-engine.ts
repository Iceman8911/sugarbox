// Terms:
// - A state snapshot / snapshot is a snapshot of the changed variables at a given point in time. It could be the initial state, or a partial update.
// - The initial state is the original variables object, which is immutable.
// - The state is the combination of the initial state and all partial updates (up to a specified index).
// - A partial update only contains changes to the state, not the entire state.
// - The current state snapshot is the last state in the list, which is mutable.

import type { CacheAdapter } from "../types/adapters";
import type {
	SugarBoxAchievementsKey,
	SugarBoxConfig,
	SugarBoxExportData,
	SugarBoxMetadata,
	SugarBoxPassage,
	SugarBoxSaveData,
	SugarBoxSaveKey,
	SugarBoxSettingsKey,
} from "../types/if-engine";
import type {
	SugarBoxCompatibleClassConstructor,
	SugarBoxCompatibleClassInstance,
	SugarBoxSerializedClassData,
} from "../types/userland-classes";

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
	TAchievementData extends Record<string, boolean> = Record<string, boolean>,
	TSettingsData extends Record<string, unknown> = Record<string, unknown>,
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
	#initialState: Readonly<StateWithMetadata<TVariables>>;

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

	/** Stores all userland custom classes for use in serialization and deserialization.
	 *
	 * It's indexed with the static prop `classId` of the given class
	 */
	#classRegistry = new Map<
		string,
		SugarBoxCompatibleClassConstructor<unknown, unknown>
	>();

	/** Boolean flags that denote achievements meant to be persisted across saves */
	#achievements: TAchievementData;

	/** Settings data that is not tied to save data, like audio volume, font size, etc
	 *
	 * Must be serializable and deserializable by JSON.stringify / parse
	 */
	#settings: TSettingsData;

	private constructor(
		/** Must be unique to prevent conflicts */
		readonly name: string,
		initialState: TVariables,
		essentialPassages: SugarBoxPassage<TPassageType>[],
		achievements: TAchievementData,
		settings: TSettingsData,
		config: Config<TVariables> = defaultConfig,
	) {
		/** Initialize the state with the provided initial state */
		// TODO: don't harcode the intiial passage id
		this.#initialState = { ...initialState, _id: "" };

		this.#stateSnapshots = [{}];

		this.#index = 0;

		this.#achievements = achievements;

		this.#settings = settings;

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
	static async init<
		TPassageType extends string | object,
		TVariables extends Record<string, unknown> = Record<string, unknown>,
		TAchievementData extends Record<string, boolean> = Record<string, boolean>,
		TSettingsData extends Record<string, unknown> = Record<string, unknown>,
	>(args: {
		name: string;

		variables: TVariables;

		/** Critical passages that must be available asap.
		 *
		 * The first argument is the passage id */
		passages: SugarBoxPassage<TPassageType>[];

		/** Achievements that should persist across saves */
		achievements?: TAchievementData;

		/** Settings data that is not tied to save data, like audio volume, font size, etc */
		settings?: TSettingsData;

		config?: Config<TVariables>;
	}): Promise<SugarboxEngine<TPassageType, TVariables>> {
		const {
			config,
			name,
			passages,
			variables,
			achievements = {} as TAchievementData,
			settings = {} as TSettingsData,
		} = args;

		const engine = new SugarboxEngine<
			TPassageType,
			TVariables,
			TAchievementData,
			TSettingsData
		>(name, variables, passages, achievements, settings, config);

		// If there's any stored achievements or settings, load them in place of the data provided
		// If the user want to empty the acheivements or settings, they can explicitly do so with the `set***()` methods
		await Promise.allSettled([
			engine.#loadAchievements(),
			engine.#loadSettings(),
		]);

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

	get achievements(): Readonly<TAchievementData> {
		return this.#achievements;
	}

	/** Immer-style producer for setting achievements */
	async setAchievements(
		producer: (state: TAchievementData) => void,
	): Promise<void> {
		producer(this.#achievements);

		await this.#saveAchievements();
	}

	get settings(): Readonly<TSettingsData> {
		return this.#settings;
	}

	/** Immer-style producer for setting settings */
	async setSettings(producer: (state: TSettingsData) => void): Promise<void> {
		producer(this.#settings);

		await this.#saveSettings();
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
	addPassages(passages: SugarBoxPassage<TPassageType>[]): void {
		for (const { name, passage } of passages) {
			this.addPassage(name, passage);
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

	/** Any custom classes stored in the story's state must be registered with this */
	registerClasses(
		...customClasses: SugarBoxCompatibleClassConstructor<unknown, unknown>[]
	): void {
		customClasses.forEach((customClass) =>
			this.#classRegistry.set(customClass.__classId, customClass),
		);
	}

	/** Using the provided persistence adapter, this saves all vital data for the combined state, metadata, and current index
	 *
	 * @throws if the persistence adapter is not available
	 */
	async saveToSaveSlot(saveSlot: number): Promise<void> {
		const { persistence } = this.#config;

		SugarboxEngine.#assertPersistenceIsAvailable(persistence);

		const saveKey = this.#getSaveKeyFromSaveSlotNumber(saveSlot);

		const saveData: SugarBoxSaveData<TVariables> = {
			intialState: this.#initialState,
			snapshots: this.#stateSnapshots,
			storyIndex: this.#index,
		};

		await persistence.set(
			saveKey,
			JSON.stringify(saveData, this.#serializationReplacer),
		);
	}

	/**
	 * @throws if the save slot is invalid or if the persistence adapter is not available
	 */
	async loadFromSaveSlot(saveSlot: number): Promise<void> {
		const { persistence } = this.#config;

		SugarboxEngine.#assertPersistenceIsAvailable(persistence);

		const saveSlotKey = this.#getSaveKeyFromSaveSlotNumber(saveSlot);

		const serializedSaveData = await persistence.get(saveSlotKey);

		if (!serializedSaveData) {
			throw new Error(`No save data found for slot ${saveSlot}`);
		}

		const { intialState, snapshots, storyIndex }: SugarBoxSaveData<TVariables> =
			JSON.parse(serializedSaveData, this.#reconstructionReviver);

		// Replace the current state
		this.#initialState = intialState;
		this.#stateSnapshots = snapshots;
		this.#index = storyIndex;
	}

	/** For saves the need to exported out of the browser */
	saveToExport(): string {
		const exportData: SugarBoxExportData<
			TVariables,
			TSettingsData,
			TAchievementData
		> = {
			saveData: {
				intialState: this.#initialState,
				snapshots: this.#stateSnapshots,
				storyIndex: this.#index,
			},
			settings: this.#settings,
			achievements: this.#achievements,
		};

		return JSON.stringify(exportData, this.#serializationReplacer);
	}

	/** Can be used when directly loading a save from an exported save on disk  */
	loadFromExport(data: string): void {
		const {
			achievements,
			saveData: { intialState, snapshots, storyIndex },
			settings,
		}: SugarBoxExportData<
			TVariables,
			TSettingsData,
			TAchievementData
		> = JSON.parse(data, this.#reconstructionReviver);

		// Replace the current state
		this.#initialState = intialState;
		this.#stateSnapshots = snapshots;
		this.#index = storyIndex;
		this.#achievements = achievements;
		this.#settings = settings;
	}

	static #assertPersistenceIsAvailable(
		persistence: SugarBoxConfig["persistence"],
	): asserts persistence is NonNullable<SugarBoxConfig["persistence"]> {
		if (!persistence) {
			throw new Error("Unable to save. No persistence adapter");
		}
	}

	#assertSaveSlotIsValid(saveSlot: number): void {
		const { saveSlots: MAX_SAVE_SLOTS } = this.#config;

		const ERROR_TEXT = "Unable to save.";

		if (saveSlot < MINIMUM_SAVE_SLOT_INDEX || saveSlot >= MAX_SAVE_SLOTS) {
			throw new Error(`${ERROR_TEXT} Save slot ${saveSlot} is invalid.`);
		}
	}

	#getSaveKeyFromSaveSlotNumber(saveSlot: number): SugarBoxSaveKey {
		this.#assertSaveSlotIsValid(saveSlot);

		return `sugarbox-${this.name}-${saveSlot}`;
	}

	get #achivementsStorageKey(): SugarBoxAchievementsKey {
		return `sugarbox-${this.name}-achievements`;
	}

	get #settingsStorageKey(): SugarBoxSettingsKey {
		return `sugarbox-${this.name}-settings`;
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

	#serializationReplacer(_: string, value: unknown): unknown {
		const classIdProp: keyof SugarBoxCompatibleClassConstructor<
			unknown,
			unknown
		> = "__classId";

		const toJSONProp: keyof SugarBoxCompatibleClassInstance<unknown> =
			"__toJSON";

		// Account for userland custom classes
		if (
			value &&
			typeof value === "object" &&
			!Array.isArray(value) &&
			classIdProp in value.constructor &&
			typeof value.constructor[classIdProp] === "string" &&
			toJSONProp in value &&
			typeof value[toJSONProp] === "function"
		) {
			const serializedClassData: SugarBoxSerializedClassData = {
				__classId: value.constructor[classIdProp],

				__serialized: value[toJSONProp](),
			};

			return serializedClassData;
		}
		// Todo: account for native classes like Maps, Sets, Dates, etc

		// Return other values as is
		return value;
	}

	/**  Custom reviver function for JSON.parse */
	#reconstructionReviver(key: string, value: unknown): unknown {
		const classIdProp: keyof SugarBoxSerializedClassData = "__classId";

		const serializedProp: keyof SugarBoxSerializedClassData = "__serialized";

		// Check for our custom serialization format
		if (
			value &&
			typeof value === "object" &&
			classIdProp in value &&
			typeof value[classIdProp] === "string" &&
			serializedProp in value &&
			typeof value[serializedProp] === "string"
		) {
			const Cls = this.#classRegistry.get(value[classIdProp]);

			if (Cls && typeof Cls.__fromJSON === "function") {
				// If we found the registered class, reconstruct it
				return Cls.__fromJSON(value[serializedProp]);
			} else {
				// If the class wasn't registered, we can't reconstruct it.
				// Throw an error or return the raw data with a warning.
				throw new Error(
					`Cannot reconstruct unregistered class: ${value[classIdProp]}`,
				);
			}
		}
		return value; // Return other values as-is
	}

	async #saveAchievements(): Promise<void> {
		const persistenceAdapter = this.#config.persistence;

		SugarboxEngine.#assertPersistenceIsAvailable(persistenceAdapter);

		await persistenceAdapter.set(
			this.#achivementsStorageKey,
			JSON.stringify(this.#achievements),
		);
	}

	async #loadAchievements(): Promise<void> {
		const persistenceAdapter = this.#config.persistence;

		SugarboxEngine.#assertPersistenceIsAvailable(persistenceAdapter);

		const serializedAchievements = await persistenceAdapter.get(
			this.#achivementsStorageKey,
		);

		if (serializedAchievements) {
			this.#achievements = JSON.parse(serializedAchievements);
		}
	}

	async #saveSettings(): Promise<void> {
		const persistenceAdapter = this.#config.persistence;

		SugarboxEngine.#assertPersistenceIsAvailable(persistenceAdapter);

		await persistenceAdapter.set(
			this.#settingsStorageKey,
			JSON.stringify(this.#settings),
		);
	}

	async #loadSettings(): Promise<void> {
		const persistenceAdapter = this.#config.persistence;

		SugarboxEngine.#assertPersistenceIsAvailable(persistenceAdapter);

		const serializedSettings = await persistenceAdapter.get(
			this.#settingsStorageKey,
		);

		if (serializedSettings) {
			this.#settings = JSON.parse(serializedSettings);
		}
	}

	#cloneState(
		state: StateWithMetadata<TVariables>,
	): StateWithMetadata<TVariables> {
		return cloneObject(state);
	}
}

/** General prupose cloning helper
 *
 * **No support for recurisve objects**
 */
function clone<TData>(val: TData): TData {
	try {
		return structuredClone(val);
	} catch {
		// Could be a userland class
		if (typeof val === "object" && val) {
			const cloneProp: keyof SugarBoxCompatibleClassInstance<TData> = "__clone";

			if (cloneProp in val && typeof val[cloneProp] === "function") {
				return val[cloneProp]();
			}
		}

		console.error("Failed to clone:", val);

		throw new Error("Unable to clone");
	}
}

/** Clones all individual props in the object.
 *
 * **No support for recurisve objects**
 */
function cloneObject<TObject extends object>(obj: TObject): TObject {
	//@ts-expect-error I'll fill this in the loop
	const cloneToFill: TObject = {};

	let key: keyof TObject;

	for (key in obj) {
		const valueToClone = obj[key];

		//@ts-expect-error TS doesn't know it :(
		cloneToFill[key] =
			valueToClone === null
				? null
				: valueToClone === undefined
					? undefined
					: typeof valueToClone !== "object"
						? clone(valueToClone)
						: cloneObject(valueToClone);
	}

	return cloneToFill;
}

// For testing
const engine = await SugarboxEngine.init({
	name: "Test",
	passages: [{ name: "Start", passage: "This is the start passage" }],
	variables: { name: "Dave", inventory: { gold: 123, gems: 12 } },
});

engine.setVars((state) => {
	state.name = "Sheep";

	state.inventory.gems = 21;
});

export { SugarboxEngine };
