import "@stardazed/streams-polyfill";
import { beforeEach, describe, expect, test } from "bun:test";
import { SugarboxEngine } from "../../src";
import type {
	SugarBoxCompatibleClassConstructorCheck,
	SugarBoxCompatibleClassInstance,
} from "../../src/types/userland-classes";
import { isStringJsonObjectOrCompressedString } from "../../src/utils/compression";
import { SugarBoxSemanticVersion } from "../../src/utils/version";
import { createPersistenceAdapter } from "../mocks/persistence";

const SAMPLE_PASSAGES = [
	{ name: "Passage2", passage: "Lorem Ipsum" },
	{ name: "Forest Path", passage: "You walk down a dimly lit path." },
	{
		name: "Mountain Peak",
		passage: "A cold wind whips around you at the summit.",
	},
] as const;

async function initEngine() {
	class Player
		implements SugarBoxCompatibleClassInstance<Player, SerializedPlayer>
	{
		name = "Dave";
		age = 21;
		class = "Paladin";
		level = 6;
		location = "Tavern";
		inventory = {
			gold: 123,
			gems: 12,
			items: ["Black Sword", "Slug Shield", "Old Cloth"],
		};

		favouriteItem() {
			return this.inventory.items[0];
		}

		__clone() {
			const clone = new Player();

			Object.assign(clone, this);

			return clone;
		}

		__toJSON() {
			return { ...this };
		}

		static __classId = "Player";

		static __fromJSON(
			serializedData: SerializedPlayer,
		): SugarBoxCompatibleClassInstance<Player, SerializedPlayer> {
			const player = new Player();

			Object.assign(player, serializedData);

			return player;
		}
	}

	const dummy = { ...new Player() };

	type SerializedPlayer = typeof dummy;

	// biome-ignore lint/correctness/noUnusedVariables: <Workaround for enforcing static class props>
	type PlayerCheck = SugarBoxCompatibleClassConstructorCheck<
		SerializedPlayer,
		typeof Player
	>;

	return SugarboxEngine.init({
		name: "Test",
		otherPassages: [...SAMPLE_PASSAGES] as { name: string; passage: string }[],
		startPassage: { name: "Start", passage: "This is the start passage" },
		variables: {
			player: new Player(),
			others: {
				hoursPlayed: 1.5,
				stage: 3,
			},
		},
		config: {
			maxStateCount: 100,
			persistence: createPersistenceAdapter(),
		},
		classes: [Player],
	});
}

async function initEngineWithPersistence(
	persistence: ReturnType<typeof createPersistenceAdapter>,
) {
	// This is a simplified version of the main initEngine for test purposes
	return SugarboxEngine.init({
		name: "Test",
		startPassage: { name: "Start", passage: "This is the start passage" },
		config: {
			persistence,
		},
		otherPassages: [],
		variables: {},
		achievements: {} as Record<string, unknown>,
	});
}

let engine: ReturnType<typeof initEngine> extends Promise<infer T> ? T : never;

beforeEach(async () => {
	engine = await initEngine();
});

describe("Passage Navigation", () => {
	test("passage navigation should increment the index", async () => {
		engine.navigateTo(SAMPLE_PASSAGES[0].name);

		expect(engine.index).toBe(1);

		engine.navigateTo(SAMPLE_PASSAGES[1].name);

		expect(engine.index).toBe(2);
	});

	test("should be able to navigate to a passage by its name while unavailable ones throw", async () => {
		engine.navigateTo(SAMPLE_PASSAGES[0].name);

		expect(engine.passageId).toBe(SAMPLE_PASSAGES[0].name);

		expect(engine.passage).toBe(SAMPLE_PASSAGES[0].passage);

		let didThrow = false;

		try {
			engine.navigateTo("NonExistentPassage");
		} catch {
			didThrow = true;
		}

		expect(didThrow).toBeTrue();
	});
});

describe("State Variables and History", () => {
	test("story variables should be set without issue and persist after passage navigation", async () => {
		engine.setVars((state) => {
			state.player.name = "Bob";

			state.player.inventory.gems++;

			state.player.inventory.items.push("Overpowered Sword");
		});

		engine.navigateTo(SAMPLE_PASSAGES[0].name);

		expect(
			engine.vars.player.inventory.items.includes("Overpowered Sword"),
		).toBeTrue();

		expect(engine.vars.player.inventory.gems).toBe(13);

		expect(engine.vars.player.name).toBe("Bob");
	});

	test("replacing the story's state with a new object should work", () => {
		const testObj = { others: { stage: -10 }, newProp: "I'm here now :D" };

		engine.setVars((_) => testObj);

		expect(engine.vars).toContainKeys(Object.keys(testObj));

		expect(engine.vars).toContainValues(Object.values(testObj));
	});

	test("the state history should not go beyond the given limit and older entries should be squashed together", async () => {
		for (let i = 0; i < 1_000; i++) {
			engine.navigateTo(
				SAMPLE_PASSAGES.map((data) => data.name)[
					i % (SAMPLE_PASSAGES.length + 1)
				],
			);
		}
		// Since it's set to 100, the index cannot be more than 99
		expect(engine.index).toBe(99);
	});

	test("the state should be correct when moving the index through history", () => {
		engine.setVars((state) => {
			state.others.stage = -1;
		});

		engine.navigateTo(SAMPLE_PASSAGES[0].name);

		engine.setVars((state) => {
			state.others.stage = 10;
		});

		engine.navigateTo(SAMPLE_PASSAGES[1].name);

		engine.backward(2);

		expect(engine.vars.others.stage).toBe(-1);

		engine.forward(1);

		expect(engine.vars.others.stage).toBe(10);
	});

	test("backward and forward should be clamped within history bounds", () => {
		engine.navigateTo(SAMPLE_PASSAGES[0].name);

		engine.navigateTo(SAMPLE_PASSAGES[1].name);

		expect(engine.index).toBe(2);

		engine.forward(100); // Try to go too far forward

		expect(engine.index).toBe(2);

		engine.backward(100); // Try to go too far backward

		expect(engine.index).toBe(0);
	});
});

describe("Saving and Loading", () => {
	test.failing(
		"loading an empty or invalid save slot should throw",
		async () => {
			await engine.loadFromSaveSlot(-999);
		},
	);

	test("should be able to save and load the state restoring the relevant variable values", async () => {
		await engine.saveToSaveSlot(1);

		engine.navigateTo(SAMPLE_PASSAGES[1].name);

		const testItem = "Test Item";

		engine.setVars((state) => {
			state.player.level++;

			state.others.stage++;

			state.player.location = SAMPLE_PASSAGES[1].name;

			state.player.inventory.items.push(testItem);
		});

		await engine.saveToSaveSlot(2);

		expect(engine.vars.player.inventory.items).toContain(testItem);

		await engine.loadFromSaveSlot(1);

		expect(engine.vars.player.inventory.items).not.toContain(testItem);
	});
});

describe("Autosave", () => {
	test("should autosave on passage change when autoSave is 'passage'", async () => {
		const persistence = createPersistenceAdapter();
		const engine = await SugarboxEngine.init({
			name: "AutoSaveTest",
			startPassage: { name: "Start", passage: "This is the start passage" },
			config: {
				persistence,
				autoSave: "passage",
			},
			otherPassages: [{ name: "Next", passage: "Next passage." }],
			variables: { counter: 0 },
			achievements: {},
		});

		// Change state and navigate to trigger autosave
		engine.setVars((vars) => {
			vars.counter = 42;
		});

		engine.navigateTo("Next");

		// Wait for any async autosave to complete
		await new Promise((r) => setTimeout(r, 10));

		// Check autosave slot
		let foundAutosave = false;

		for await (const save of engine.getSaves()) {
			if (save.type === "autosave") {
				foundAutosave = true;

				expect(save.data.snapshots[save.data.storyIndex - 1].counter).toBe(42);

				expect(save.data.lastPassageId).toBe("Next");
			}
		}
		expect(foundAutosave).toBe(true);
	});

	test("should autosave on state change when autoSave is 'state'", async () => {
		const persistence = createPersistenceAdapter();

		const engine = await SugarboxEngine.init({
			name: "AutoSaveTest2",
			startPassage: { name: "Start", passage: "This is the start passage" },
			config: {
				persistence,
				autoSave: "state",
			},
			otherPassages: [],
			variables: { counter: 0 },
			achievements: {},
		});

		// Change state to trigger autosave
		engine.setVars((vars) => {
			vars.counter = 99;
		});

		// Wait for any async autosave to complete
		await new Promise((r) => setTimeout(r, 10));

		// Check autosave slot
		let foundAutosave = false;
		for await (const save of engine.getSaves()) {
			if (save.type === "autosave") {
				foundAutosave = true;
				expect(save.data.snapshots[save.data.storyIndex].counter).toBe(99);
				expect(save.data.lastPassageId).toBe("Start");
			}
		}
		expect(foundAutosave).toBe(true);
	});
});

describe("Advanced Saving and Loading", () => {
	test("saveToExport and loadFromExport should work", async () => {
		engine.setVars((s) => {
			s.player.level = 99;
		});

		const exportedData = await engine.saveToExport();

		expect(typeof exportedData).toBe("string");

		engine.setVars((s) => {
			s.player.level = 1;
		});

		expect(engine.vars.player.level).toBe(1);

		await engine.loadFromExport(exportedData);

		expect(engine.vars.player.level).toBe(99);
	});

	test("getSaves should return saved games", async () => {
		await engine.saveToSaveSlot(1);

		await engine.saveToSaveSlot(3);

		const saves: Record<string, unknown>[] = [];

		for await (const save of engine.getSaves()) {
			if (save.type === "normal") {
				saves.push(save);
			}
		}

		expect(saves.length).toBe(2);

		expect(saves.map((s) => s.slot)).toEqual([1, 3]);
	});

	test("loadRecentSave should load the most recent save", async () => {
		engine.setVars((s) => {
			s.others.stage = 1;
		});

		await engine.saveToSaveSlot(1);

		await new Promise((r) => setTimeout(r, 10)); // ensure timestamp is different

		engine.setVars((s) => {
			s.others.stage = 2;
		});

		await engine.saveToSaveSlot(2);

		engine.setVars((s) => {
			s.others.stage = 3;
		});

		await engine.loadRecentSave();

		expect(engine.vars.others.stage).toBe(2);
	});

	test("loadSaveFromData should load state from a save object", async () => {
		engine.setVars((s) => {
			s.player.name = "Initial Name";
		});

		await engine.saveToSaveSlot(1);

		const saves = [];
		for await (const save of engine.getSaves()) {
			//@ts-expect-error I'll deal with the types later
			saves.push(save.data);
		}
		const saveData = saves[0];

		engine.setVars((s) => {
			s.player.name = "New Name";
		});

		expect(engine.vars.player.name).toBe("New Name");

		engine.loadSaveFromData(saveData);

		expect(engine.vars.player.name).toBe("Initial Name");
	});

	test("saving to an invalid slot should throw", async () => {
		let didThrow = false;

		try {
			await engine.saveToSaveSlot(-1);
		} catch {
			didThrow = true;
		}

		expect(didThrow).toBeTrue();
	});

	test("save migration(s) should work", async () => {
		const persistence = createPersistenceAdapter();

		type Version_0_1_0_Variables = {
			prop1: number;
			prop2: string;
		};

		const engine = await SugarboxEngine.init({
			name: "Test",
			startPassage: { name: "Start", passage: "This is the start passage" },
			config: {
				persistence,
				saveVersion: new SugarBoxSemanticVersion(0, 1, 0),
			},
			otherPassages: [],
			variables: { prop1: 12, prop2: "45" } as Version_0_1_0_Variables,
			achievements: {} as Record<string, unknown>,
		});

		await engine.saveToSaveSlot(1);

		type Version_0_2_0_Variables = {
			prop1: string;
			prop2: number;
			prop3: {
				nestedprop: boolean;
			};
		};

		const engine2 = await SugarboxEngine.init({
			name: "Test",
			startPassage: { name: "Start", passage: "This is the start passage" },
			config: {
				persistence,
				saveVersion: new SugarBoxSemanticVersion(0, 2, 0),
			},
			otherPassages: [],
			variables: {
				prop1: "1",
				prop2: 12,
				prop3: { nestedprop: true },
			} as Version_0_2_0_Variables,
			achievements: {} as Record<string, unknown>,
			migrations: [
				{
					from: new SugarBoxSemanticVersion(0, 1, 0),
					data: {
						to: `0.2.0`,
						migrater: (data: Version_0_1_0_Variables) => {
							return {
								prop1: data.prop1.toString(),
								prop2: parseInt(data.prop2),
								prop3: { nestedprop: true },
							} as Version_0_2_0_Variables;
						},
					},
				},
			],
		});

		await engine2.loadFromSaveSlot(1);

		expect(engine2.vars.prop1).toBe("12");
		expect(engine2.vars.prop2).toBe(45);
		expect(engine2.vars.prop3).not.toBeUndefined();

		type Version_0_3_0_Variables = {
			prop1: string;
			prop2: [number, number];
			prop3: {
				nestedprop: "true" | "false";
				nestedProp2: boolean;
			};
			prop4: string;
		};

		const engine3 = await SugarboxEngine.init({
			name: "Test",
			startPassage: { name: "Start", passage: "This is the start passage" },
			config: {
				persistence,
				saveVersion: new SugarBoxSemanticVersion(0, 3, 0),
			},
			otherPassages: [],
			variables: {} as Version_0_3_0_Variables,
			achievements: {},
			migrations: [
				{
					from: new SugarBoxSemanticVersion(0, 1, 0),
					data: {
						to: `0.2.0`,
						migrater: (data: Version_0_1_0_Variables) => {
							return {
								prop1: data.prop1.toString(),
								prop2: parseInt(data.prop2),
								prop3: { nestedprop: true },
							} as Version_0_2_0_Variables;
						},
					},
				},
				{
					from: new SugarBoxSemanticVersion(0, 2, 0),
					data: {
						to: `0.3.0`,
						migrater: (data: Version_0_2_0_Variables) => {
							return {
								prop1: data.prop1,
								prop2: [data.prop2, 0],
								prop3: {
									nestedprop: data.prop3.nestedprop ? "true" : "false",
									nestedProp2: data.prop3.nestedprop,
								},
								prop4: "newProp",
							} as Version_0_3_0_Variables;
						},
					},
				},
			],
		});

		await engine3.loadFromSaveSlot(1);

		expect(engine3.vars.prop1).toBe("12");
		expect(engine3.vars.prop2).toEqual([45, 0]);
		expect(engine3.vars.prop3.nestedprop).toBe("true");
		expect(engine3.vars.prop3.nestedProp2).toBeTrue();
		expect(engine3.vars.prop4).toBe("newProp");
	});

	test("liberal save compatibility mode should allow loading older minor versions without migration", async () => {
		const persistence = createPersistenceAdapter();

		type Version_0_1_0_Variables = {
			prop1: number;
			prop2: string;
		};

		const engine1 = await SugarboxEngine.init({
			name: "Test",
			startPassage: { name: "Start", passage: "This is the start passage" },
			config: {
				persistence,
				saveVersion: new SugarBoxSemanticVersion(0, 1, 0),
			},
			otherPassages: [],
			variables: { prop1: 123, prop2: "abc" } as Version_0_1_0_Variables,
			achievements: {} as Record<string, unknown>,
		});

		await engine1.saveToSaveSlot(1);

		// Initialize engine2 with a higher minor version but liberal compatibility
		const engine2 = await SugarboxEngine.init({
			name: "Test",
			startPassage: { name: "Start", passage: "This is the start passage" },
			config: {
				persistence,
				saveVersion: new SugarBoxSemanticVersion(0, 2, 0),
				saveCompatibilityMode: "liberal",
			},
			otherPassages: [],
			variables: { prop1: 0, prop2: "" } as Version_0_1_0_Variables, // Variables type should match the loaded save structure
			achievements: {} as Record<string, unknown>,
			migrations: [], // No migrations defined, as it should be compatible
		});

		await engine2.loadFromSaveSlot(1);

		// Assert that the save loaded successfully and the data is from 0.1.0
		expect(engine2.vars.prop1).toBe(123);
		expect(engine2.vars.prop2).toBe("abc");
	});

	test("ensure that saves are compressed or not when the config option is set to true / false", async () => {
		const persistence = createPersistenceAdapter();

		const ENGINE_NAME = "Test1";

		const engineArgs = {
			name: ENGINE_NAME,
			startPassage: { name: ":p", passage: "TTTT" },
			otherPassages: [],
			variables: {
				pain: true,
				test: { nested: "pain" },
				pain2: {
					pain: true,
					test: { nested: "pain" },
					pain3: {
						pain: true,
						test: { nested: "pain" },
						pain2: { pain: true, test: { nested: "pain" } },
					},
				},
			},
			config: { persistence, compressSave: true },
		} as const;

		//@ts-expect-error
		const engine1 = await SugarboxEngine.init(engineArgs);

		await engine1.saveToSaveSlot(1);

		const slot1Data =
			(await persistence.get(`sugarbox-${ENGINE_NAME}-slot1`)) ?? '{""}';

		expect(isStringJsonObjectOrCompressedString(slot1Data)).toBe("compressed");

		const ENGINE_NAME2 = "Test2";

		//@ts-expect-error
		const engine2 = await SugarboxEngine.init({
			...engineArgs,
			name: ENGINE_NAME2,
			config: { ...engineArgs.config, compressSave: false },
		});

		await engine2.saveToSaveSlot(1);

		const slot2Data =
			(await persistence.get(`sugarbox-${ENGINE_NAME2}-slot1`)) ?? '{""}';

		expect(isStringJsonObjectOrCompressedString(slot2Data)).toBe("json");
	});

	test("a reinitialized engine that is set to not compress save files should still be able to load a previously compressed save without issue", async () => {
		const persistence = createPersistenceAdapter();

		const ENGINE_NAME = "Test1";

		const engineArgs = {
			name: ENGINE_NAME,
			startPassage: { name: ":p", passage: "TTTT" },
			otherPassages: [],
			variables: {
				pain: true,
				test: { nested: "pain" },
				pain2: {
					pain: true,
					test: { nested: "pain" },
					pain3: {
						pain: true,
						test: { nested: "pain" },
						pain2: { pain: true, test: { nested: "pain" } },
					},
				},
			},
			config: { persistence, compressSave: true },
		} as const;

		//@ts-expect-error
		const engine1 = await SugarboxEngine.init(engineArgs);

		await Promise.all([engine1.saveToSaveSlot(1), engine1.saveToSaveSlot(2)]);

		//@ts-expect-error
		const engine2 = await SugarboxEngine.init({
			...engineArgs,
			config: { ...engineArgs.config, compressSave: false },
		});

		await engine2.loadFromSaveSlot(2);

		expect(engine2.vars.pain).toBeTrue();
	});
});

describe("Custom Classes", () => {
	test("custom classes should still work after saving / loading", async () => {
		await engine.saveToSaveSlot(1);

		await engine.loadFromSaveSlot(1);

		expect(engine.vars.player.favouriteItem()).toBe("Black Sword");
	});

	test("using unregistered class should not have its methods after load", async () => {
		class Unregistered {
			name = "unregistered";
			iExist() {
				return true;
			}
			__clone() {
				const c = new Unregistered();
				c.name = this.name;
				return c;
			}
			__toJSON() {
				return { name: this.name, __class_id: "Unregistered" };
			}
			static __fromJSON(data: { name: string }) {
				const c = new Unregistered();

				c.name = data.name;

				return c;
			}
			static __classId = "Unregistered";
		}

		engine.setVars((s) => {
			// @ts-expect-error
			s.unregistered = new Unregistered();
		});

		await engine.saveToSaveSlot(1);

		await engine.loadFromSaveSlot(1);

		// @ts-expect-error
		expect(engine.vars.unregistered).toBeDefined();

		// It becomes a plain object, not an instance of Unregistered.
		// @ts-expect-error
		expect(typeof engine.vars.unregistered.iExist).toBe("undefined");
	});
});

describe("Events", () => {
	test("ensure passage and state change events are emitted with the appropriate data and can be turned off", async () => {
		// :passageChange event
		let passageNavigatedData: null | {
			newPassage: string;
			oldPassage: string;
		} = null;
		const endListener = engine.on(
			":passageChange",
			({ detail: { newPassage, oldPassage } }) => {
				if (newPassage && oldPassage) {
					passageNavigatedData = { newPassage, oldPassage };
				}
			},
		);

		engine.navigateTo(SAMPLE_PASSAGES[0].name);

		expect(passageNavigatedData).not.toBeNull();

		//@ts-expect-error
		expect(passageNavigatedData?.newPassage).toEqual(
			SAMPLE_PASSAGES[0].passage,
		);

		endListener(); // From this point no changes should be registered

		engine.navigateTo(SAMPLE_PASSAGES[1].name);

		//@ts-expect-error
		expect(passageNavigatedData?.newPassage).not.toBe(
			SAMPLE_PASSAGES[1].passage,
		);

		// :stateChange event
		let stateChangedData: null | { newState: unknown; oldState: unknown } =
			null;

		let stateChangeCount = 0;

		const endListener2 = engine.on(
			":stateChange",
			({ detail: { newState, oldState } }) => {
				stateChangedData = { newState, oldState };
				stateChangeCount++;
			},
		);

		engine.setVars((state) => {
			state.player.name = "Alice";
		});

		expect(stateChangedData).not.toBeNull();

		//@ts-expect-error
		expect(stateChangedData?.newState.player.name).toEqual("Alice");

		expect(stateChangeCount).toBe(1);

		endListener2(); // From this point no changes should be registered

		engine.setVars((state) => {
			state.others.stage = 1;
		});

		expect(stateChangeCount).not.toBe(2);
	});

	test("should emit save and load events", async () => {
		// Save events
		let saveStartEvent: null | undefined;

		let saveEndEvent:
			| {
					type: "success";
			  }
			| {
					type: "error";
					error: Error;
			  }
			| undefined;

		const saveStartListener = engine.on(":saveStart", ({ detail }) => {
			saveStartEvent = detail;
		});

		const saveEndListener = engine.on(":saveEnd", ({ detail }) => {
			saveEndEvent = detail;
		});

		await engine.saveToSaveSlot(1);

		expect(saveStartEvent).toBeNull();

		expect(saveEndEvent).not.toBeUndefined();

		saveStartListener();
		saveEndListener();

		// Load events
		let loadStartEvent: null | undefined;

		let loadEndEvent:
			| {
					type: "success";
			  }
			| {
					type: "error";
					error: Error;
			  }
			| undefined;

		const loadStartListener = engine.on(":loadStart", ({ detail }) => {
			loadStartEvent = detail;
		});

		const loadEndListener = engine.on(":loadEnd", ({ detail }) => {
			loadEndEvent = detail;
		});

		await engine.loadFromSaveSlot(1);

		expect(loadStartEvent).toBeNull();

		expect(loadEndEvent).not.toBeUndefined();

		loadStartListener();
		loadEndListener();
	});
});

describe("Passage Management", () => {
	test("should add a single passage", async () => {
		const newPassage = { name: "Cave", passage: "It's dark here." };

		engine.addPassage(newPassage.name, newPassage.passage);
		engine.navigateTo(newPassage.name);

		expect(engine.passageId).toBe(newPassage.name);
		expect(engine.passage).toBe(newPassage.passage);
	});

	test("should add multiple passages", async () => {
		const newPassages = [
			{ name: "Swamp", passage: "The air is thick and humid." },
			{ name: "Castle", passage: "A large castle looms before you." },
		];

		engine.addPassages(newPassages);
		engine.navigateTo(newPassages[1].name);

		expect(engine.passageId).toBe(newPassages[1].name);
		expect(engine.passage).toBe(newPassages[1].passage);
	});
});

describe("Achievements and Settings", () => {
	test("achievements should be settable and persist across sessions", async () => {
		const persistence = createPersistenceAdapter();
		const engine1 = await initEngineWithPersistence(persistence);

		const achievements = { unlocked: ["First Quest"], points: 10 };

		await engine1.setAchievements(() => achievements);
		expect(engine1.achievements).toEqual(achievements);

		const engine2 = await initEngineWithPersistence(persistence);
		expect(engine2.achievements).toEqual(achievements);
	});

	test("settings should be settable and persist across sessions", async () => {
		const persistence = createPersistenceAdapter();
		const engine1 = await initEngineWithPersistence(persistence);

		const settings = { volume: 0.5, difficulty: "hard" };
		await engine1.setSettings((_) => settings);
		expect(engine1.settings).toEqual(settings);

		const engine2 = await initEngineWithPersistence(persistence);
		expect(engine2.settings).toEqual(settings);
	});
});

describe("PRNG and Random Number Generation", () => {
	test("should generate deterministic random numbers with fixed seed", async () => {
		const fixedSeed = 12345;
		const engine1 = await SugarboxEngine.init({
			name: "Test1",
			startPassage: { name: "Start", passage: "Start passage" },
			variables: {},
			config: {
				initialSeed: fixedSeed,
				regenSeed: false, // Never regenerate seed
			},
			otherPassages: [],
		});

		const engine2 = await SugarboxEngine.init({
			name: "Test2",
			startPassage: { name: "Start", passage: "Start passage" },
			variables: {},
			config: {
				initialSeed: fixedSeed,
				regenSeed: false, // Never regenerate seed
			},
			otherPassages: [],
		});

		// Both engines should generate the same sequence
		const sequence1: number[] = [];
		const sequence2: number[] = [];

		for (let i = 0; i < 10; i++) {
			sequence1.push(engine1.random);
			sequence2.push(engine2.random);
		}

		expect(sequence1).toEqual(sequence2);

		// all generated numbers should be the same
		expect([...new Set(sequence1)][0]).toEqual(sequence1[0]);
	});

	test("should generate different sequences when regenSeed is false vs true", async () => {
		const fixedSeed = 54321;

		const engineNoRegen = await SugarboxEngine.init({
			name: "NoRegen",
			startPassage: { name: "Start", passage: "Start passage" },
			variables: {},
			config: {
				initialSeed: fixedSeed,
				regenSeed: false,
			},
			otherPassages: [],
		});

		const engineWithRegen = await SugarboxEngine.init({
			name: "WithRegen",
			startPassage: { name: "Start", passage: "Start passage" },
			variables: {},
			config: {
				initialSeed: fixedSeed,
				regenSeed: "passage",
			},
			otherPassages: [{ name: "Next", passage: "Next passage" }],
		});

		// Get initial random numbers
		// biome-ignore lint/correctness/noUnusedVariables: <To change the random number>
		const noRegenFirst = engineNoRegen.random;
		// biome-ignore lint/correctness/noUnusedVariables: <To change the random number>
		const withRegenFirst = engineWithRegen.random;

		// Navigate to new passage (only affects withRegen engine)
		engineWithRegen.navigateTo("Next");

		// Get second random numbers
		const noRegenSecond = engineNoRegen.random;
		const withRegenSecond = engineWithRegen.random;

		// The sequences should be different due to seed regeneration
		expect(noRegenSecond).not.toBe(withRegenSecond);
	});

	test("should regenerate seed on passage navigation only when regenSeed is 'passage'", async () => {
		const engine = await SugarboxEngine.init({
			name: "PassageRegen",
			startPassage: { name: "Start", passage: "Start passage" },
			variables: {},
			config: {
				initialSeed: 98765,
				regenSeed: "passage",
			},
			otherPassages: [
				{ name: "Passage1", passage: "First passage" },
				{ name: "Passage2", passage: "Second passage" },
			],
		});

		const initialRandom = engine.random;

		engine.navigateTo("Passage1");
		const afterFirstNav = engine.random;

		engine.navigateTo("Passage2");
		const afterSecondNav = engine.random;

		// Each navigation should change the seed, affecting subsequent randoms
		expect(initialRandom).not.toBe(afterFirstNav);
		expect(afterFirstNav).not.toBe(afterSecondNav);

		// Same passage navigation should not change the seed
		const oneMoreRandom = engine.random;
		expect(oneMoreRandom).toBe(afterSecondNav);
	});

	test("should regenerate seed on each call when regenSeed is 'eachCall'", async () => {
		const engine = await SugarboxEngine.init({
			name: "EachCallRegen",
			startPassage: { name: "Start", passage: "Start passage" },
			variables: {},
			config: {
				initialSeed: 11111,
				regenSeed: "eachCall",
			},
			otherPassages: [],
		});

		// Generate multiple random numbers
		const randoms: number[] = [];
		for (let i = 0; i < 5; i++) {
			randoms.push(engine.random);
		}

		// All should be different (extremely unlikely to get duplicates)
		const uniqueValues = new Set(randoms);
		expect(uniqueValues.size).toBe(randoms.length);
	});

	test("should preserve random state across save/load with regenSeed false", async () => {
		const persistence = createPersistenceAdapter();
		const engine = await SugarboxEngine.init({
			name: "SaveLoadRandom",
			startPassage: { name: "Start", passage: "Start passage" },
			variables: {},
			config: {
				initialSeed: 99999,
				regenSeed: false,
				persistence,
			},
			otherPassages: [],
		});

		// Generate some random numbers to advance the state
		const beforeSave: number[] = [];
		for (let i = 0; i < 3; i++) {
			beforeSave.push(engine.random);
		}

		// Save the current state
		await engine.saveToSaveSlot(1);

		// Generate more random numbers
		const afterSave: number[] = [];
		for (let i = 0; i < 3; i++) {
			afterSave.push(engine.random);
		}

		// Load the saved state
		await engine.loadFromSaveSlot(1);

		// Generate the same number of randoms as after save
		const afterLoad: number[] = [];
		for (let i = 0; i < 3; i++) {
			afterLoad.push(engine.random);
		}

		// After loading, we should get the same sequence as after save
		expect(afterLoad).toEqual(afterSave);
	});

	test("should maintain seed state when navigating through history", async () => {
		const engine = await SugarboxEngine.init({
			name: "HistoryRandom",
			startPassage: { name: "Start", passage: "Start passage" },
			variables: {},
			config: {
				initialSeed: 77777,
				regenSeed: "passage",
			},
			otherPassages: [
				{ name: "Passage1", passage: "First passage" },
				{ name: "Passage2", passage: "Second passage" },
			],
		});

		// Navigate and collect random numbers at each step
		const startRandom = engine.random;

		engine.navigateTo("Passage1");
		const passage1Random = engine.random;

		engine.navigateTo("Passage2");
		// biome-ignore lint/correctness/noUnusedVariables: <To change the random number>
		const passage2Random = engine.random;

		// Go back in history
		engine.backward(2); // Back to start
		const backToStartRandom = engine.random;

		engine.forward(1); // Forward to Passage1
		const backToPassage1Random = engine.random;

		// Random numbers should be consistent when revisiting states
		expect(backToStartRandom).toBe(startRandom);
		expect(backToPassage1Random).toBe(passage1Random);
	});

	test("should generate numbers in expected range", async () => {
		const engine = await SugarboxEngine.init({
			name: "RangeTest",
			startPassage: { name: "Start", passage: "Start passage" },
			variables: {},
			config: {
				initialSeed: 55555,
			},
			otherPassages: [],
		});

		// Generate many random numbers and verify they're all in [0, 1) range
		for (let i = 0; i < 100; i++) {
			const random = engine.random;
			expect(random).toBeGreaterThanOrEqual(0);
			expect(random).toBeLessThan(1);
		}
	});

	test("should export and import random state correctly", async () => {
		const engine = await SugarboxEngine.init({
			name: "ExportImportRandom",
			startPassage: { name: "Start", passage: "Start passage" },
			variables: {},
			config: {
				initialSeed: 33333,
				regenSeed: false,
			},
			otherPassages: [],
		});

		// Generate some randoms to advance state
		engine.random;
		engine.random;

		// Export the state
		const exportData = await engine.saveToExport();

		// Generate more randoms
		const afterExport: number[] = [];
		for (let i = 0; i < 3; i++) {
			afterExport.push(engine.random);
		}

		// Import the exported state
		await engine.loadFromExport(exportData);

		// Generate the same number of randoms
		const afterImport: number[] = [];
		for (let i = 0; i < 3; i++) {
			afterImport.push(engine.random);
		}

		// Should get the same sequence
		expect(afterImport).toEqual(afterExport);
	});
});

describe("Error Conditions and Edge Cases", () => {
	test("should throw an error when loading a save with no migrator found for an outdated version", async () => {
		const persistence = createPersistenceAdapter();

		// Create a save with version 0.1.0
		const engine1 = await SugarboxEngine.init({
			name: "Test",
			startPassage: { name: "Start", passage: "This is the start passage" },
			config: {
				persistence,
				saveVersion: new SugarBoxSemanticVersion(0, 1, 0),
			},
			otherPassages: [],
			variables: { testProp: "oldValue" },
			achievements: {},
		});
		await engine1.saveToSaveSlot(1);

		// Initialize engine2 with version 0.3.0, but only register a migrator from 0.1.0 to 0.2.0
		// This simulates a missing migration step (0.2.0 to 0.3.0)
		const engine2 = await SugarboxEngine.init({
			name: "Test",
			startPassage: { name: "Start", passage: "This is the start passage" },
			config: {
				persistence,
				saveVersion: new SugarBoxSemanticVersion(0, 3, 0),
			},
			otherPassages: [],
			variables: { testProp: "defaultValue" },
			achievements: {},
			migrations: [
				{
					from: new SugarBoxSemanticVersion(0, 1, 0),
					data: {
						to: `0.2.0`,
						migrater: (data: { testProp: string }) => ({
							testProp: `${data.testProp}-migrated`,
						}),
					},
				},
			],
		});

		let didThrow = false;
		try {
			await engine2.loadFromSaveSlot(1);
		} catch (e: unknown) {
			didThrow = true;
			expect(e).toBeInstanceOf(Error);
			expect((e as Error).message).toContain(
				"No migrator function found for save version 0.2.0",
			);
		}
		expect(didThrow).toBeTrue();
	});

	test("should throw an error when attempting to register duplicate migrators", async () => {
		const persistence = createPersistenceAdapter();
		const engine = await SugarboxEngine.init({
			name: "Test",
			startPassage: { name: "Start", passage: "This is the start passage" },
			config: { persistence },
			variables: {},
			achievements: {},
			otherPassages: [],
		});

		const migrator1 = {
			from: new SugarBoxSemanticVersion(0, 1, 0),
			data: { to: `0.2.0`, migrater: (data: object) => data },
		} as const;
		const migrator2 = {
			from: new SugarBoxSemanticVersion(0, 1, 0), // Duplicate version
			data: { to: `0.3.0`, migrater: (data: object) => data },
		} as const;

		engine.registerMigrators(migrator1);

		let didThrow = false;
		try {
			engine.registerMigrators(migrator2);
		} catch (e: unknown) {
			didThrow = true;
			expect(e).toBeInstanceOf(Error);
			expect((e as Error).message).toContain(
				"A migration for version 0.1.0 already exists",
			);
		}
		expect(didThrow).toBeTrue();
	});

	test("should throw an error when navigating to a non-existent passage", () => {
		let didThrow = false;
		try {
			engine.navigateTo("NonExistentPassage");
		} catch (e: unknown) {
			didThrow = true;
			expect(e).toBeInstanceOf(Error);
			expect((e as Error).message).toBeString();
		}
		expect(didThrow).toBeTrue();
	});

	test("should throw an error if the engine is initialized without a start passage", async () => {
		let didThrow = false;
		try {
			// @ts-expect-error This test specifically aims to trigger an error for missing startPassage
			await SugarboxEngine.init({
				name: "InvalidInitTest",
				config: { persistence: createPersistenceAdapter() },
				variables: {},
				achievements: {},
				otherPassages: [],
			});
		} catch (e: unknown) {
			didThrow = true;
			expect(e).toBeInstanceOf(Error);
			expect((e as Error).message).toBeString();
		}
		expect(didThrow).toBeTrue();
	});
});
