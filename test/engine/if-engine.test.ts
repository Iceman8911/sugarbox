import { beforeEach, describe, expect, test } from "bun:test";
import { SugarboxEngine } from "../../src";
import type {
	SugarBoxCompatibleClassConstructorCheck,
	SugarBoxCompatibleClassInstance,
} from "../../src/types/userland-classes";
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

		expect(Object.values(engine.vars)).toContainEqual(
			Object.values(testObj)[0],
		);
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

describe("Error Conditions and Edge Cases", () => {});
