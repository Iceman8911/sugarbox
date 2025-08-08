// Terms:
// - A state snapshot / snapshot is a snapshot of the changed variables at a given point in time. It could be the initial state, or a partial update.
// - The initial state is the original variables object, which is immutable.
// - The state is the combination of the initial state and all partial updates (up to a specified index).
// - A partial update only contains changes to the state, not the entire state.
// - The current state snapshot is the last state in the list, which is mutable.

import { PRNG } from "@iceman8911/tiny-prng";
import { parse, registerCustom, stringify } from "superjson";
import type { ReadonlyDeep } from "type-fest";
import type { SugarBoxCacheAdapter } from "../types/adapters";
import type {
	SugarBoxAchievementsKey,
	SugarBoxAutoSaveKey,
	SugarBoxConfig,
	SugarBoxExportData,
	SugarBoxMetadata,
	SugarBoxNormalSaveKey,
	SugarBoxPassage,
	SugarBoxSaveData,
	SugarBoxSaveKey,
	SugarBoxSettingsKey,
} from "../types/if-engine";
import type {
	SugarBoxCompatibleClassConstructor,
	SugarBoxCompatibleClassInstance,
} from "../types/userland-classes";
import { clone } from "../utils/clone";
import { makeImmutable } from "../utils/mutability";
import {
	isSaveCompatibleWithEngine,
	SugarBoxSemanticVersion,
	type SugarBoxSemanticVersionString,
} from "../utils/version";

const defaultConfig = {
	autoSave: false,

	loadOnStart: true,

	maxStateCount: 100,

	regenSeed: "passage",

	stateMergeCount: 1,

	saveCompatibilityMode: "strict",

	saveSlots: 20,

	saveVersion: new SugarBoxSemanticVersion(0, 0, 1),
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
	":passageChange": ReadonlyDeep<{
		/** The previous passage before the transition */
		oldPassage: TPassageData | null;

		/** The new passage after the transition */
		newPassage: TPassageData | null;
	}>;

	":stateChange": ReadonlyDeep<{
		/** The previous snapshot of only variables (to be changed) before the change */
		oldState: TPartialSnapshot;

		/** A collection of only the changed variables after the change */
		newState: TPartialSnapshot;
	}>;

	":init": null;

	":saveStart": null;

	":saveEnd": { type: "success" } | { type: "error"; error: Error };

	":loadStart": null;

	":loadEnd": { type: "success" } | { type: "error"; error: Error };
};

type SugarBoxSaveMigration<
	TOldSaveStructure,
	TNewSaveStructure,
	TNewVersion extends
		SugarBoxSemanticVersionString = SugarBoxSemanticVersionString,
> = {
	/** Version that the save will be set to if the migration function works */
	to: TNewVersion;

	/** Function to be run on the old save data to migrate it to the given version */
	migrater: (saveDataToMigrate: TOldSaveStructure) => TNewSaveStructure;
};

type SugarBoxSaveMigrationMap<
	TOldSaveStructure,
	TNewSaveStructure,
	TOldVersion extends
		SugarBoxSemanticVersionString = SugarBoxSemanticVersionString,
	TNewVersion extends
		SugarBoxSemanticVersionString = SugarBoxSemanticVersionString,
> = Map<
	TOldVersion,
	SugarBoxSaveMigration<TOldSaveStructure, TNewSaveStructure, TNewVersion>
>;

/** The main engine for Sugarbox that provides headless interface to basic utilities required for Interactive Fiction
 *
 * Dispatches custom events that can be listened to with "addEventListener"
 */
class SugarboxEngine<
	TPassageType,
	TVariables extends Record<string, unknown> = Record<string, unknown>,
	TAchievementData extends Record<string, unknown> = Record<string, boolean>,
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

	#config: SugarBoxConfig<TVariables>;

	/** Indexed by the passage id.
	 *
	 * Each value is the passage data, which could be a html string, markdown string, regular string, or more complex things like a jsx component, etc.
	 */
	#passages = new Map<string, TPassageType>();

	/** Since recalculating the current state can be expensive */
	#stateCache?: SugarBoxCacheAdapter<number, StateWithMetadata<TVariables>>;

	#eventTarget = new EventTarget();

	/** Achievements meant to be persisted across saves */
	#achievements: TAchievementData;

	/** Settings data that is not tied to save data, like audio volume, font size, etc
	 *
	 * Must be serializable and deserializable by JSON.stringify / parse
	 */
	#settings: TSettingsData;

	/** Collection of migration functions to keep old saves up to date
	 *
	 * Not sure what types to put here without overcomplicating things
	 */
	// biome-ignore lint/suspicious/noExplicitAny: <It'll not be worth defining the types for these>
	#saveMigrationMap: SugarBoxSaveMigrationMap<any, any> = new Map();

	private constructor(
		/** Must be unique to prevent conflicts */
		readonly name: string,
		initialState: TVariables,
		startPassage: SugarBoxPassage<TPassageType>,
		achievements: TAchievementData,
		settings: TSettingsData,
		config: Config<TVariables>,
		otherPassages: SugarBoxPassage<TPassageType>[],
	) {
		const {
			cache,
			saveSlots,
			initialSeed = Math.floor(Math.random() * 2 ** 32),
		} = config;

		/** Initialize the state with the provided initial state */
		this.#initialState = {
			...initialState,
			__id: startPassage.name,
			__seed: initialSeed,
		};

		this.#stateSnapshots = [{}];

		this.#index = 0;

		this.#achievements = achievements;

		this.#settings = settings;

		if (saveSlots && saveSlots < MINIMUM_SAVE_SLOTS)
			throw new Error(`Invalid number of save slots: ${saveSlots}`);

		this.#config = { ...defaultConfig, ...config };

		this.addPassages([startPassage, ...otherPassages]);

		if (cache) {
			this.#stateCache = cache;
		}

		// Register the Semantic Version class so it can be used in the state
		this.registerClasses(SugarBoxSemanticVersion);
	}

	/** Use this to initialize the engine */
	static async init<
		TPassageType extends string | object,
		TVariables extends Record<string, unknown> = Record<string, unknown>,
		TAchievementData extends Record<string, unknown> = Record<string, boolean>,
		TSettingsData extends Record<string, unknown> = Record<string, unknown>,
	>(args: {
		name: string;

		variables: TVariables;

		startPassage: SugarBoxPassage<TPassageType>;

		/** Critical passages that must be available asap.
		 *
		 * The first argument is the passage id */
		otherPassages: SugarBoxPassage<TPassageType>[];

		/** So you don't have to manually register classes for proper serialization / deserialization */
		classes?: SugarBoxCompatibleClassConstructor<unknown, unknown>[];

		/** Achievements that should persist across saves */
		achievements?: TAchievementData;

		/** Settings data that is not tied to save data, like audio volume, font size, etc */
		settings?: TSettingsData;

		config?: Config<TVariables>;
	}): Promise<
		SugarboxEngine<TPassageType, TVariables, TAchievementData, TSettingsData>
	> {
		const {
			config = defaultConfig,
			name,
			startPassage,
			otherPassages,
			classes,
			variables,
			achievements = {} as TAchievementData,
			settings = {} as TSettingsData,
		} = args;

		const engine = new SugarboxEngine<
			TPassageType,
			TVariables,
			TAchievementData,
			TSettingsData
		>(
			name,
			variables,
			startPassage,
			achievements,
			settings,
			config,
			otherPassages,
		);

		engine.registerClasses(...(classes ?? []));

		const { loadOnStart } = config;

		// If there's any stored achievements or settings, load them in place of the data provided
		// If the user want to empty the acheivements or settings, they can explicitly do so with the `set***()` methods
		// Also load the most recent save if `loadOnStart` is true
		const [__, ___, mostRecentSave] = await Promise.allSettled([
			engine.#loadAchievements(),
			engine.#loadSettings(),
			loadOnStart ? engine.#getMostRecentSave() : Promise.resolve(null),
		]);

		if (mostRecentSave.status === "fulfilled" && mostRecentSave.value) {
			engine.loadSaveFromData(mostRecentSave.value);
		}

		return engine;
	}

	/** Returns a readonly copy of the current state of stored variables.
	 *
	 * May be expensive to calculate depending on the history of the story.
	 */
	get vars(): Readonly<State<TVariables>> {
		return this.#varsWithMetadata;
	}

	/** Immer-style way of updating story variables
	 *
	 * Use this **solely** for setting values. If you must read a value, use `this.vars`
	 *
	 * **If you need to replace the entire state, *return a new object* instead of directly *assigning the value***
	 */
	setVars(
		producer:
			| ((variables: State<TVariables>) => void)
			| ((variables: State<TVariables>) => State<TVariables>),
	): void {
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
		const possibleValueToUseForReplacing = producer(proxy);

		if (possibleValueToUseForReplacing) {
			this.#rewriteState({
				...possibleValueToUseForReplacing,
				__id: this.passageId,
				__seed: this.#currentStatePrngSeed,
			});
		}

		// Get the changes and emit them
		const newState = self.#getSnapshotAtIndex(self.#index);

		const oldState: SnapshotWithMetadata<TVariables> = {};

		let newStateKey: keyof typeof newState;

		for (newStateKey in newState) {
			oldState[newStateKey] = currentStateBeforeChange[newStateKey];
		}

		self.#emitCustomEvent(":stateChange", {
			newState: makeImmutable(newState),
			oldState: makeImmutable(newState),
		});

		// Clear the cache entry for this since it has been changed
		self.#stateCache?.delete(self.#index);
	}

	// TODO: resetVars()

	/** Returns the id to the appropriate passage for the current state */
	get passageId(): string {
		return this.#varsWithMetadata.__id;
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

	/** Based off an internal PRNG, returns a random float between 0 and 1, inclusively */
	get random(): number {
		const { regenSeed } = this.#config;

		const prng = this.#currentStatePrng;

		// This will alter `prng.seed`
		const randomNumber = prng.nextFloat();

		if (regenSeed === "eachCall") {
			// Add the new seed to the snapshot on each call
			// @ts-expect-error - At the moment, there's no way to enforce that TVariables should not have a `__seed` property
			this.#getSnapshotAtIndex(this.#index).__seed = prng.seed;
		}

		return randomNumber;
	}

	get achievements(): Readonly<TAchievementData> {
		return this.#achievements;
	}

	/** Immer-style producer for setting achievements
	 *
	 * If you need to replace the entire achievement object, *return a new object* (also make sure that undesirable properties are explicitly set to `null` else they'd still be included in the state) instead of directly *assigning the value
	 */
	async setAchievements(
		producer:
			| ((state: TAchievementData) => void)
			| ((state: TAchievementData) => TAchievementData),
	): Promise<void> {
		const result = producer(this.#achievements);

		if (result) {
			this.#achievements = result;
		}

		await this.#saveAchievements();
	}

	get settings(): Readonly<TSettingsData> {
		return this.#settings;
	}

	/** Immer-style producer for setting settings
	 *
	 * If you need to replace the entire settings object, *return a new object* (also make sure that undesirable properties are explicitly set to `null` else they'd still be included in the state) instead of directly *assigning the value
	 */
	async setSettings(
		producer:
			| ((state: TSettingsData) => void)
			| ((state: TSettingsData) => TSettingsData),
	): Promise<void> {
		const result = producer(this.#settings);

		if (result) {
			this.#settings = result;
		}

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
	 * Yes, you can navigate to the same passage multiple times, and it will create a new snapshot each time. It's intended behavior.
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

		if (this.#varsWithMetadata.__id !== passageId) {
			//@ts-expect-error - At the moment, there's no way to enforce that TVariables should not have a `__id` property
			newSnapshot.__id = passageId;
		}

		if (this.#config.regenSeed === "passage") {
			//@ts-expect-error - At the moment, there's no way to enforce that TVariables should not have a `__seed` property
			// Create a new seed for the new snapshot
			newSnapshot.__seed = this.#currentStatePrng.next();
		}

		this.#setIndex(this.#index + 1);

		return newSnapshot;
	}

	/** Subscribe to an event.
	 *
	 * @returns a function that can be used to unsubscribe from the event.
	 */
	on<TEventType extends keyof SugarBoxEvents<TPassageType, TVariables>>(
		type: TEventType,
		listener: (
			event: CustomEvent<SugarBoxEvents<TPassageType, TVariables>[TEventType]>,
		) => void,
		options?: boolean | AddEventListenerOptions,
	): () => void {
		//@ts-expect-error TS doesn't know that the custom event will exist at runtime
		this.#eventTarget.addEventListener(type, listener, options);

		return () => {
			this.off(type, listener, options);
		};
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
		customClasses.forEach((customClass) => {
			registerCustom<SugarBoxCompatibleClassInstance<unknown, unknown>, string>(
				{
					deserialize: (serializedString) => {
						try {
							const classInstance = customClass.__fromJSON(
								parse(serializedString),
							);

							return classInstance;
						} catch {
							throw new Error(
								`Failed to deserialize class instance of "${customClass.__classId}" from string: "${serializedString}"`,
							);
						}
					},

					isApplicable: (
						possibleClass,
					): possibleClass is SugarBoxCompatibleClassInstance<
						unknown,
						unknown
					> => possibleClass instanceof customClass,

					serialize: (instance) => stringify(instance.__toJSON()),
				},

				customClass.__classId,
			);
		});
	}

	/** Use this to register custom callbacks for migrating outdated save data
	 *
	 * @throws if a migration for the same version already exists
	 */
	registerMigrators<TOldSaveStructure, TNewSaveStructure = State<TVariables>>(
		...migrators: {
			from: SugarBoxSemanticVersion;
			data: SugarBoxSaveMigration<TOldSaveStructure, TNewSaveStructure>;
		}[]
	): void {
		for (const { from, data } of migrators) {
			const semanticVersionString = from.toString();

			if (this.#saveMigrationMap.has(semanticVersionString)) {
				throw new Error(
					`A migration for version ${from} already exists. Cannot register multiple migrations for the same version.`,
				);
			}

			this.#saveMigrationMap.set(semanticVersionString, data);
		}
	}

	/** Using the provided persistence adapter, this saves all vital data for the combined state, metadata, and current index
	 *
	 * @param saveSlot if not provided, defaults to the autosave slot
	 *
	 * @throws if the persistence adapter is not available
	 */
	async saveToSaveSlot(saveSlot?: number): Promise<void> {
		await this.#emitSaveOrLoadEventWhenAttemptingToSaveOrLoadInCallback(
			"save",
			async () => {
				const { persistence, saveVersion } = this.#config;

				SugarboxEngine.#assertPersistenceIsAvailable(persistence);

				const saveKey = this.#getSaveKeyFromSaveSlotNumber(saveSlot);

				const saveData: SugarBoxSaveData<TVariables> = {
					intialState: this.#initialState,
					lastPassageId: this.passageId,
					savedOn: new Date(),
					saveVersion,
					snapshots: this.#stateSnapshots,
					storyIndex: this.#index,
				};

				await persistence.set(saveKey, stringify(saveData));
			},
		);
	}

	/**
	 *
	 * @param saveSlot if not provided, defaults to the autosave slot
	 *
	 * @throws if the save slot is invalid or if the persistence adapter is not available
	 */
	async loadFromSaveSlot(saveSlot?: number): Promise<void> {
		await this.#emitSaveOrLoadEventWhenAttemptingToSaveOrLoadInCallback(
			"load",
			async () => {
				const { persistence } = this.#config;

				SugarboxEngine.#assertPersistenceIsAvailable(persistence);

				const saveSlotKey = this.#getSaveKeyFromSaveSlotNumber(saveSlot);

				const serializedSaveData = await persistence.get(saveSlotKey);

				if (!serializedSaveData) {
					throw new Error(`No save data found for slot ${saveSlot}`);
				}

				this.loadSaveFromData(parse(serializedSaveData));
			},
		);
	}

	/** Loads the save data from the provided save data object.
	 *
	 * This is used to load saves from the `getSaves()` method.
	 *
	 * @param save The save data to load
	 *
	 * @throws if the save was made on a later version than the engine or if a save migration throws
	 */
	loadSaveFromData(save: SugarBoxSaveData<TVariables>): void {
		const {
			intialState,
			snapshots,
			storyIndex,
			saveVersion,
		}: SugarBoxSaveData<TVariables> = save;

		const { saveCompatibilityMode, saveVersion: engineVersion } = this.#config;

		const saveCompatibility = isSaveCompatibleWithEngine(
			saveVersion,
			engineVersion,
			saveCompatibilityMode,
		);

		switch (saveCompatibility) {
			case "compatible": {
				// Replace the current state
				this.#initialState = intialState;
				this.#stateSnapshots = snapshots;
				this.#index = storyIndex;

				break;
			}

			case "outdatedSave": {
				// Temporarily replace the current state
				const originalInitialState = this.#initialState;
				const originalStateSnapshots = this.#stateSnapshots;
				const originalIndex = this.#index;

				this.#initialState = intialState;
				this.#stateSnapshots = snapshots;
				this.#index = storyIndex;

				try {
					let saveToMigrateVersion = saveVersion;

					const saveToMigrateVersionString = () =>
						saveToMigrateVersion.toString();

					let migratedState: StateWithMetadata<TVariables> | null = null;

					while (saveToMigrateVersionString() !== engineVersion.toString()) {
						const migratorData = this.#saveMigrationMap.get(
							saveToMigrateVersionString(),
						);

						if (!migratorData) {
							throw new Error(
								`No migrator function found for save version ${saveToMigrateVersionString()}`,
							);
						}

						const { migrater, to } = migratorData;

						const currentStateToMigrate =
							migratedState ?? this.#varsWithMetadata;

						// This may throw
						migratedState = migrater(currentStateToMigrate);

						saveToMigrateVersion = SugarBoxSemanticVersion.__fromJSON(to);
					}

					// Save migration completed successfully so rewrite the state with it
					if (migratedState) {
						this.#rewriteState(migratedState);

						break;
					}

					throw new Error(
						`Save with version ${saveToMigrateVersion} returned null during migration`,
					);
				} catch (e) {
					// Reset any changes since the migration failed
					this.#initialState = originalInitialState;
					this.#stateSnapshots = originalStateSnapshots;
					this.#index = originalIndex;

					// Rethrow
					throw new Error(e instanceof Error ? e.message : String(e));
				}
			}
			case "newerSave": {
				throw new Error(
					`Save with version ${saveVersion} is too new for the engine with version ${engineVersion}`,
				);
			}
		}

		// Clear the state cache since the state has changed
		this.#stateCache?.clear();
	}

	/** Returns an object containing the data of all present saves */
	async *getSaves(): AsyncGenerator<
		| { type: "autosave"; data: SugarBoxSaveData<TVariables> }
		| { type: "normal"; slot: number; data: SugarBoxSaveData<TVariables> }
	> {
		const { persistence } = this.#config;

		SugarboxEngine.#assertPersistenceIsAvailable(persistence);

		for await (const key of this.#getKeysOfPresentSaves()) {
			const serializedSaveData = await persistence.get(key);

			if (!serializedSaveData) continue;

			const saveData: SugarBoxSaveData<TVariables> = parse(serializedSaveData);

			if (key === this.#getSaveKeyFromSaveSlotNumber()) {
				yield { type: "autosave", data: saveData };
			} else {
				const slotNumber = parseInt(key.match(/slot(\d+)/)?.[1] ?? "-1");

				yield { type: "normal", slot: slotNumber, data: saveData };
			}
		}
	}

	async loadRecentSave(): Promise<void> {
		await this.#emitSaveOrLoadEventWhenAttemptingToSaveOrLoadInCallback(
			"load",
			async () => {
				const mostRecentSave = await this.#getMostRecentSave();

				if (!mostRecentSave) {
					throw new Error("No saves found");
				}

				this.loadSaveFromData(mostRecentSave);
			},
		);
	}

	/** For saves the need to exported out of the browser */
	async saveToExport(): Promise<string> {
		return this.#emitSaveOrLoadEventWhenAttemptingToSaveOrLoadInCallback(
			"save",
			async () => {
				const exportData: SugarBoxExportData<
					TVariables,
					TSettingsData,
					TAchievementData
				> = {
					saveData: {
						intialState: this.#initialState,
						lastPassageId: this.passageId,
						saveVersion: this.#config.saveVersion,
						savedOn: new Date(),
						snapshots: this.#stateSnapshots,
						storyIndex: this.#index,
					},
					settings: this.#settings,
					achievements: this.#achievements,
				};

				return stringify(exportData);
			},
		);
	}

	/** Can be used when directly loading a save from an exported save on disk  */
	async loadFromExport(data: string): Promise<void> {
		await this.#emitSaveOrLoadEventWhenAttemptingToSaveOrLoadInCallback(
			"load",
			async () => {
				const {
					achievements,
					saveData: { intialState, snapshots, storyIndex },
					settings,
				}: SugarBoxExportData<
					TVariables,
					TSettingsData,
					TAchievementData
				> = parse(data);

				// Replace the current state
				this.#initialState = intialState;
				this.#stateSnapshots = snapshots;
				this.#index = storyIndex;
				this.#achievements = achievements;
				this.#settings = settings;
			},
		);
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

	/** If not given any argument, defaults to the autosave slot */
	#getSaveKeyFromSaveSlotNumber(): SugarBoxAutoSaveKey;
	#getSaveKeyFromSaveSlotNumber(saveSlot: number): SugarBoxNormalSaveKey;
	#getSaveKeyFromSaveSlotNumber(
		saveSlot?: number,
	): SugarBoxNormalSaveKey | SugarBoxAutoSaveKey;
	#getSaveKeyFromSaveSlotNumber(
		saveSlot?: number,
	): SugarBoxNormalSaveKey | SugarBoxAutoSaveKey {
		if (!saveSlot) return `sugarbox-${this.name}-autosave`;

		this.#assertSaveSlotIsValid(saveSlot);

		return `sugarbox-${this.name}-slot${saveSlot}`;
	}

	get #achivementsStorageKey(): SugarBoxAchievementsKey {
		return `sugarbox-${this.name}-achievements`;
	}

	get #settingsStorageKey(): SugarBoxSettingsKey {
		return `sugarbox-${this.name}-settings`;
	}

	async *#getKeysOfPresentSaves(): AsyncGenerator<SugarBoxSaveKey> {
		const persistence = this.#config.persistence;

		SugarboxEngine.#assertPersistenceIsAvailable(persistence);

		const keys = await persistence.keys?.();

		if (keys) {
			// Filter out the keys that are not save slots
			for (const key of keys) {
				if (key.includes(`slot`) || key.includes("autosave")) {
					//@ts-expect-error TS doesn't know that the key is a SugarBoxSaveKey
					yield key;
				}
			}
		} else {
			// Fallback to using get() to get the keys
			const autosaveKey = this.#getSaveKeyFromSaveSlotNumber();

			if (await persistence.get(autosaveKey)) {
				yield autosaveKey;
			}

			for (let i = 0; i < this.#config.saveSlots; i++) {
				const key = this.#getSaveKeyFromSaveSlotNumber(i);

				if (await persistence.get(key)) {
					yield key;
				}
			}
		}
	}

	async #getMostRecentSave(): Promise<SugarBoxSaveData<TVariables> | null> {
		const persistence = this.#config.persistence;

		SugarboxEngine.#assertPersistenceIsAvailable(persistence);

		let mostRecentSave: SugarBoxSaveData<TVariables> | null = null;

		for await (const { data } of this.getSaves()) {
			if (!mostRecentSave) {
				mostRecentSave = data;
			} else {
				if (data.savedOn > mostRecentSave.savedOn) {
					mostRecentSave = data;
				}
			}
		}

		return mostRecentSave;
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
			newPassage: makeImmutable(this.passage),
			oldPassage: makeImmutable(oldPassage),
		});

		this.#emitCustomEvent(":stateChange", {
			newState: makeImmutable(this.#getSnapshotAtIndex(this.#index)),
			oldState: makeImmutable(oldSnapshot),
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

	/** Since `this.vars` is purposely limited typescript-wise */
	get #varsWithMetadata(): Readonly<StateWithMetadata<TVariables>> {
		return this.#getStateAtIndex(this.#index);
	}

	/** Inclusively combines the snapshots within the given range of indexes to free up space.
	 *
	 * It also creates a new snapshot list to replace the old one.
	 */
	#mergeSnapshots(lowerIndex: number, upperIndex: number): void {
		const lastIndex = this.#lastSnapshotIndex;

		if (lastIndex < 1 || upperIndex < lowerIndex) return; // No snapshots to merge

		upperIndex = Math.min(upperIndex, lastIndex);

		const difference = upperIndex - lowerIndex;

		const indexesToMerge: ReadonlySet<number> = new Set(
			Array.from(Array(difference + 1), (_, i) => lowerIndex + i),
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

		// Since the index will be pointing to an undefined snapshot after merging, we need to set it back to the last valid index
		this.#index = this.#index - difference;

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

	/**
	 *
	 * @param index - The index at which the state will be calculated. Defaults to the most recent snapshot's index
	 * @returns
	 */
	#getStateAtIndex(
		index: number = this.#lastSnapshotIndex,
	): Readonly<StateWithMetadata<TVariables>> {
		const stateLength = this.#snapshotCount;

		const effectiveIndex = Math.min(Math.max(0, index), stateLength - 1);

		const cachedState = this.#stateCache?.get(effectiveIndex);

		if (cachedState) return cachedState;

		const state = clone<StateWithMetadata<TVariables>>(this.#initialState);

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

	/** **WARNING:** This will **replace** the intialState and **empty** all the snapshots. */
	#rewriteState(
		stateToReplaceTheCurrentOne: StateWithMetadata<TVariables>,
	): void {
		this.#initialState = stateToReplaceTheCurrentOne;

		this.#stateSnapshots = this.#stateSnapshots.map((_) => ({}));

		this.#stateCache?.clear();
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
		const dispatchResult = this.#dispatchCustomEvent(
			this.#createCustomEvent(name, data),
		);

		const { autoSave } = this.#config;

		switch (name) {
			case ":passageChange": {
				if (autoSave === "passage") {
					this.saveToSaveSlot();
				}
				break;
			}

			case ":stateChange": {
				if (autoSave === "state") {
					this.saveToSaveSlot();
				}
			}
		}

		return dispatchResult;
	}

	async #emitSaveOrLoadEventWhenAttemptingToSaveOrLoadInCallback<
		TCallBackReturnValue,
	>(
		operation: "save" | "load",
		callback: () => Promise<TCallBackReturnValue>,
	): Promise<TCallBackReturnValue> {
		this.#emitCustomEvent(
			operation === "save" ? ":saveStart" : ":loadStart",
			null,
		);

		const endEvent = operation === "save" ? ":saveEnd" : ":loadEnd";

		try {
			const result = await callback();

			this.#emitCustomEvent(endEvent, {
				type: "success",
			});

			return result;
		} catch (e) {
			this.#emitCustomEvent(endEvent, {
				type: "error",
				error: e instanceof Error ? e : new Error(String(e)),
			});

			throw e;
		}
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

	get #currentStatePrngSeed(): number {
		return this.#varsWithMetadata.__seed;
	}

	/** Since the seed is stored in each snapshot and reinitializing the class isn't expensive, there's not much use in having a dedicated prng prop */
	#getPrngFromSeed(seed: number): PRNG {
		return new PRNG(seed);
	}

	get #currentStatePrng(): PRNG {
		return this.#getPrngFromSeed(this.#varsWithMetadata.__seed);
	}

	/** For testing purposes.
	 *
	 * It's only populated in development mode.
	 */
	get __testAPI(): {
		mergeSnapshots: (lowerIndex: number, upperIndex: number) => void;
		getSnapshotAtIndex: (index: number) => SnapshotWithMetadata<TVariables>;
		getStateAtIndex: (
			index?: number,
		) => Readonly<StateWithMetadata<TVariables>>;
		addNewSnapshot: () => SnapshotWithMetadata<TVariables>;
		setIndex: (val: number) => void;
		snapshots: Array<SnapshotWithMetadata<TVariables>>;
		initialState: Readonly<StateWithMetadata<TVariables>>;
	} | null {
		if (process.env.NODE_ENV !== "production") {
			return {
				mergeSnapshots: this.#mergeSnapshots.bind(this),
				getSnapshotAtIndex: this.#getSnapshotAtIndex.bind(this),
				getStateAtIndex: this.#getStateAtIndex.bind(this),
				addNewSnapshot: this.#addNewSnapshot.bind(this),
				setIndex: this.#setIndex.bind(this),
				snapshots: this.#stateSnapshots,
				initialState: this.#initialState,
			};
		}

		return null;
	}
}

export { SugarboxEngine };
