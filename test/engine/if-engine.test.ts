/** biome-ignore-all lint/style/noNonNullAssertion: <Tiring> */

import "@stardazed/streams-polyfill";
import { beforeEach, describe, expect, test } from "bun:test";
import { SugarboxEngine } from "../../src";
import type {
	SugarBoxCompatibleClassConstructorCheck,
	SugarBoxCompatibleClassInstance,
} from "../../src/types/userland-classes";
import { isStringJsonObjectOrCompressedString } from "../../src/utils/compression";
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
	class Player implements SugarBoxCompatibleClassInstance<SerializedPlayer> {
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

		toJSON() {
			return { ...this };
		}

		static classId = "Player";

		static fromJSON(
			serializedData: SerializedPlayer,
		): SugarBoxCompatibleClassInstance<SerializedPlayer> {
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

describe("Engine Reset", () => {
	test("reset should restore the engine to its initial state", () => {
		// Modify the state
		engine.setVars((state) => {
			state.player.name = "Changed Name";
			state.player.level = 99;
			state.player.inventory.gold = 9999;
			state.others.stage = 100;
		});

		// Navigate to different passages
		engine.navigateTo(SAMPLE_PASSAGES[0].name);
		engine.navigateTo(SAMPLE_PASSAGES[1].name);

		// Verify state was changed
		expect(engine.vars.player.name).toBe("Changed Name");
		expect(engine.vars.player.level).toBe(99);
		expect(engine.vars.others.stage).toBe(100);
		expect(engine.index).toBe(2);

		// Reset the engine
		engine.reset();

		// Verify state is back to initial values
		expect(engine.vars.player.name).toBe("Dave");
		expect(engine.vars.player.level).toBe(6);
		expect(engine.vars.player.inventory.gold).toBe(123);
		expect(engine.vars.others.stage).toBe(3);
		expect(engine.index).toBe(0);
		expect(engine.passageId).toBe("Start");
	});

	test("reset should clear navigation history", () => {
		// Navigate through multiple passages
		engine.navigateTo(SAMPLE_PASSAGES[0].name);
		engine.navigateTo(SAMPLE_PASSAGES[1].name);
		engine.navigateTo(SAMPLE_PASSAGES[2].name);

		// Verify we can navigate backward
		expect(engine.index).toBe(3);
		engine.backward(1);
		expect(engine.index).toBe(2);

		// Reset the engine
		engine.reset();

		// Verify we're back at the start and can't navigate backward
		expect(engine.index).toBe(0);
		engine.backward(1);
		expect(engine.index).toBe(0); // Should stay at 0 since there's no history
	});

	test("reset should preserve custom class instances", () => {
		// Verify initial player is an instance of Player class
		expect(engine.vars.player.favouriteItem()).toBe("Black Sword");

		// Modify the player
		engine.setVars((state) => {
			state.player.inventory.items = ["New Sword"];
		});

		expect(engine.vars.player.favouriteItem()).toBe("New Sword");

		// Reset the engine
		engine.reset();

		// Verify the player is still a proper Player instance with methods
		expect(engine.vars.player.favouriteItem()).toBe("Black Sword");
		expect(typeof engine.vars.player.favouriteItem).toBe("function");
	});

	test("reset should work correctly after state modifications", () => {
		// Make various state changes
		engine.setVars((state) => {
			state.player.age = 50;
			state.player.class = "Wizard";
			state.player.inventory.gems = 999;
			state.others.hoursPlayed = 100.5;
		});

		engine.navigateTo(SAMPLE_PASSAGES[0].name);

		// Add more state changes
		engine.setVars((state) => {
			state.player.location = "Castle";
			state.others.stage = 999;
		});

		// Reset
		engine.reset();

		// Verify all values are back to initial state
		expect(engine.vars.player.age).toBe(21);
		expect(engine.vars.player.class).toBe("Paladin");
		expect(engine.vars.player.location).toBe("Tavern");
		expect(engine.vars.player.inventory.gems).toBe(12);
		expect(engine.vars.others.hoursPlayed).toBe(1.5);
		expect(engine.vars.others.stage).toBe(3);
	});

	test("reset should work correctly with array modifications", () => {
		// Modify inventory items
		engine.setVars((state) => {
			state.player.inventory.items.push("Magic Potion");
			state.player.inventory.items.push("Health Elixir");
		});

		expect(engine.vars.player.inventory.items).toHaveLength(5);
		expect(engine.vars.player.inventory.items).toContain("Magic Potion");

		// Reset
		engine.reset();

		// Verify array is back to initial state
		expect(engine.vars.player.inventory.items).toHaveLength(3);
		expect(engine.vars.player.inventory.items).toEqual([
			"Black Sword",
			"Slug Shield",
			"Old Cloth",
		]);
		expect(engine.vars.player.inventory.items).not.toContain("Magic Potion");
	});

	test("reset should maintain deterministic random state", async () => {
		// Get initial random value
		const initialRandom1 = engine.random;
		const initialRandom2 = engine.random;

		// Navigate and get more random values
		engine.navigateTo(SAMPLE_PASSAGES[0].name);
		engine.random;
		engine.random;

		// Reset
		engine.reset();

		// Verify random sequence starts over
		expect(engine.random).toBe(initialRandom1);
		expect(engine.random).toBe(initialRandom2);
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

	test("deleteSaveSlot should delete a specific save slot", async () => {
		// Set up some test data
		engine.setVars((s) => {
			s.player.level = 10;
		});

		// Save to slot 1
		await engine.saveToSaveSlot(1);

		// Set different data
		engine.setVars((s) => {
			s.player.level = 20;
		});

		// Save to slot 2
		await engine.saveToSaveSlot(2);

		// Verify both saves exist
		const savesBeforeDelete: Record<string, unknown>[] = [];
		for await (const save of engine.getSaves()) {
			if (save.type === "normal") {
				savesBeforeDelete.push(save);
			}
		}
		expect(savesBeforeDelete.length).toBe(2);

		// Delete slot 1
		await engine.deleteSaveSlot(1);

		// Verify only slot 2 remains
		const savesAfterDelete: Record<string, unknown>[] = [];
		for await (const save of engine.getSaves()) {
			if (save.type === "normal") {
				savesAfterDelete.push(save);
			}
		}
		expect(savesAfterDelete.length).toBe(1);
		expect(savesAfterDelete[0].slot).toBe(2);
	});

	test("deleteSaveSlot should delete autosave when no slot provided", async () => {
		// Set up test data
		engine.setVars((s) => {
			s.player.level = 15;
		});

		// Create an autosave
		await engine.saveToSaveSlot();

		// Verify autosave exists
		let autosaveExists = false;
		for await (const save of engine.getSaves()) {
			if (save.type === "autosave") {
				autosaveExists = true;
				break;
			}
		}
		expect(autosaveExists).toBe(true);

		// Delete autosave
		await engine.deleteSaveSlot();

		// Verify autosave no longer exists
		autosaveExists = false;
		for await (const save of engine.getSaves()) {
			if (save.type === "autosave") {
				autosaveExists = true;
				break;
			}
		}
		expect(autosaveExists).toBe(false);
	});

	test("deleteSaveSlot should throw for invalid save slots", async () => {
		// Try to delete an invalid save slot (out of range) - should throw
		let didThrow = false;
		try {
			await engine.deleteSaveSlot(999);
		} catch {
			didThrow = true;
		}
		expect(didThrow).toBe(true);
	});

	test("deleteSaveSlot should handle non-existent but valid save slots gracefully", async () => {
		// Try to delete a valid but non-existent save slot - should not throw
		expect(engine.deleteSaveSlot(5)).resolves.toBeUndefined();
	});

	test("deleteAllSaveSlots should delete all save slots", async () => {
		// Create multiple saves
		engine.setVars((s) => {
			s.player.level = 5;
		});
		await engine.saveToSaveSlot(1);

		engine.setVars((s) => {
			s.player.level = 10;
		});
		await engine.saveToSaveSlot(2);

		engine.setVars((s) => {
			s.player.level = 15;
		});
		await engine.saveToSaveSlot(3);

		// Create an autosave
		engine.setVars((s) => {
			s.player.level = 20;
		});
		await engine.saveToSaveSlot();

		// Verify all saves exist
		const savesBeforeDelete: Record<string, unknown>[] = [];
		for await (const save of engine.getSaves()) {
			savesBeforeDelete.push(save);
		}
		expect(savesBeforeDelete.length).toBe(4); // 3 normal saves + 1 autosave

		// Delete all saves
		await engine.deleteAllSaveSlots();

		// Verify no saves remain
		const savesAfterDelete: Record<string, unknown>[] = [];
		for await (const save of engine.getSaves()) {
			savesAfterDelete.push(save);
		}
		expect(savesAfterDelete.length).toBe(0);
	});

	test("deleteAllSaveSlots should handle empty save list gracefully", async () => {
		// Ensure no saves exist
		const saves: Record<string, unknown>[] = [];
		for await (const save of engine.getSaves()) {
			saves.push(save);
		}
		expect(saves.length).toBe(0);

		// Delete all saves (should not throw)
		expect(engine.deleteAllSaveSlots()).resolves.toBeDefined();
	});

	test("deleteSaveSlot should throw when persistence is not available", async () => {
		// Create an engine without persistence
		const engineWithoutPersistence = await SugarboxEngine.init({
			name: "Test",
			startPassage: { name: "Start", passage: "This is the start passage" },
			config: {},
			otherPassages: [],
			variables: {},
			achievements: {} as Record<string, unknown>,
		});

		let didThrow = false;
		try {
			await engineWithoutPersistence.deleteSaveSlot(1);
		} catch {
			didThrow = true;
		}

		expect(didThrow).toBe(true);
	});

	test("deleteAllSaveSlots should throw when persistence is not available", async () => {
		// Create an engine without persistence
		const engineWithoutPersistence = await SugarboxEngine.init({
			name: "Test",
			startPassage: { name: "Start", passage: "This is the start passage" },
			config: {},
			otherPassages: [],
			variables: {},
			achievements: {} as Record<string, unknown>,
		});

		let didThrow = false;
		try {
			await engineWithoutPersistence.deleteAllSaveSlots();
		} catch {
			didThrow = true;
		}

		expect(didThrow).toBe(true);
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
				saveVersion: `0.1.0`,
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
				saveVersion: `0.2.0`,
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
					from: `0.1.0`,
					data: {
						to: `0.2.0`,
						migrater: (data: Version_0_1_0_Variables) => {
							return {
								prop1: data.prop1.toString(),
								prop2: Number(data.prop2),
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
				saveVersion: `0.3.0`,
			},
			otherPassages: [],
			variables: {} as Version_0_3_0_Variables,
			achievements: {},
			migrations: [
				{
					from: `0.1.0`,
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
					from: `0.2.0`,
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

	test("should emit migration events during save migration", async () => {
		const persistence = createPersistenceAdapter();

		type V010 = { foo: string };
		type V020 = { foo: string; bar: number };
		type V030 = { foo: string; bar: number; baz: boolean };

		const saveV010 = {
			intialState: { foo: "hello" },
			lastPassageId: "start",
			savedOn: new Date(),
			saveVersion: "0.1.0",
			snapshots: [{ foo: "pain" }],
			storyIndex: 0,
		};

		const migrations = [
			{
				from: "0.1.0",
				data: {
					to: "0.2.0",
					migrater: (old: V010): V020 => ({ ...old, bar: 42 }),
				},
			} as const,
			{
				from: "0.2.0",
				data: {
					to: "0.3.0",
					migrater: (old: V020): V030 => ({ ...old, baz: true }),
				},
			} as const,
		];

		const engine = await SugarboxEngine.init({
			name: "migration-events-test",
			variables: { foo: "init", bar: 0, baz: false },
			startPassage: { name: "start", passage: "Start" },
			migrations,
			config: { saveVersion: "0.3.0", persistence },
			otherPassages: [],
			achievements: {},
		});

		const migrationEvents: unknown[] = [];

		engine.on(":migrationStart", (e) => {
			migrationEvents.push({ type: "start", ...e.detail });
		});

		engine.on(":migrationEnd", (e) => migrationEvents.push(e.detail));

		//@ts-expect-error save will be migrated
		engine.loadSaveFromData(saveV010);

		expect(migrationEvents).toEqual([
			{
				type: "start",
				fromVersion: "0.1.0",
				toVersion: "0.2.0",
			},
			{
				type: "success",
				fromVersion: "0.1.0",
				toVersion: "0.2.0",
			},
			{
				type: "start",
				fromVersion: "0.2.0",
				toVersion: "0.3.0",
			},
			{
				type: "success",
				fromVersion: "0.2.0",
				toVersion: "0.3.0",
			},
		]);
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
				saveVersion: `0.1.0`,
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
				saveVersion: `0.2.0`,
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
		expect(engine.vars.unregistered.name).toBe("unregistered");
		// @ts-expect-error
		expect(engine.vars.unregistered.iExist).toBeUndefined();
	});

	test("RegExp and BigInt should work in save/load", async () => {
		// Set up test data with RegExp and BigInt
		engine.setVars((s) => {
			// @ts-expect-error
			s.patterns = {
				nameValidator: /^[A-Za-z\s]+$/,
				emailPattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi,
			};
			// @ts-expect-error
			s.largeNumbers = {
				score: 9007199254740991n,
				currency: 123456789012345678901234567890n,
			};
		});

		await engine.saveToSaveSlot(1);

		// Modify the values to ensure they're actually loaded
		engine.setVars((s) => {
			// @ts-expect-error
			s.patterns.nameValidator = /different/;
			// @ts-expect-error
			s.patterns.emailPattern = /another/;
			// @ts-expect-error
			s.largeNumbers.score = 0n;
			// @ts-expect-error
			s.largeNumbers.currency = 1n;
		});

		await engine.loadFromSaveSlot(1);

		// Check RegExp restoration
		// @ts-expect-error
		expect(engine.vars.patterns.nameValidator).toBeInstanceOf(RegExp);
		// @ts-expect-error
		expect(engine.vars.patterns.nameValidator.source).toBe("^[A-Za-z\\s]+$");
		// @ts-expect-error
		expect(engine.vars.patterns.nameValidator.flags).toBe("");

		// @ts-expect-error
		expect(engine.vars.patterns.emailPattern).toBeInstanceOf(RegExp);
		// @ts-expect-error
		expect(engine.vars.patterns.emailPattern.source).toBe(
			"\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b",
		);
		// @ts-expect-error
		expect(engine.vars.patterns.emailPattern.flags).toBe("gi");

		// Check BigInt restoration
		// @ts-expect-error
		expect(typeof engine.vars.largeNumbers.score).toBe("bigint");
		// @ts-expect-error
		expect(engine.vars.largeNumbers.score).toBe(9007199254740991n);
		// @ts-expect-error
		expect(typeof engine.vars.largeNumbers.currency).toBe("bigint");
		// @ts-expect-error
		expect(engine.vars.largeNumbers.currency).toBe(
			123456789012345678901234567890n,
		);
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

	test("should emit delete events", async () => {
		// Set up a save to delete
		await engine.saveToSaveSlot(1);

		// Delete events for numbered slot
		let deleteStartEvent: { slot: "autosave" | number } | undefined;
		let deleteEndEvent:
			| { type: "success"; slot: "autosave" | number }
			| { type: "error"; slot: "autosave" | number; error: Error }
			| undefined;

		const deleteStartListener = engine.on(":deleteStart", ({ detail }) => {
			deleteStartEvent = detail;
		});

		const deleteEndListener = engine.on(":deleteEnd", ({ detail }) => {
			deleteEndEvent = detail;
		});

		await engine.deleteSaveSlot(1);

		expect(deleteStartEvent).toEqual({ slot: 1 });
		expect(deleteEndEvent).toEqual({ type: "success", slot: 1 });

		deleteStartListener();
		deleteEndListener();

		// Delete events for autosave
		await engine.saveToSaveSlot(); // Create autosave

		let autosaveDeleteStartEvent: { slot: "autosave" | number } | undefined;
		let autosaveDeleteEndEvent:
			| { type: "success"; slot: "autosave" | number }
			| { type: "error"; slot: "autosave" | number; error: Error }
			| undefined;

		const autosaveDeleteStartListener = engine.on(
			":deleteStart",
			({ detail }) => {
				autosaveDeleteStartEvent = detail;
			},
		);

		const autosaveDeleteEndListener = engine.on(":deleteEnd", ({ detail }) => {
			autosaveDeleteEndEvent = detail;
		});

		await engine.deleteSaveSlot(); // Delete autosave

		expect(autosaveDeleteStartEvent).toEqual({ slot: "autosave" });
		expect(autosaveDeleteEndEvent).toEqual({
			type: "success",
			slot: "autosave",
		});

		autosaveDeleteStartListener();
		autosaveDeleteEndListener();
	});

	test("should emit delete events on error", async () => {
		// Create engine without persistence to trigger error
		const engineWithoutPersistence = await SugarboxEngine.init({
			name: "Test",
			startPassage: { name: "Start", passage: "This is the start passage" },
			config: {},
			otherPassages: [],
			variables: {},
			achievements: {} as Record<string, unknown>,
		});

		let deleteStartEvent: { slot: "autosave" | number } | undefined;
		let deleteEndEvent:
			| { type: "success"; slot: "autosave" | number }
			| { type: "error"; slot: "autosave" | number; error: Error }
			| undefined;

		const deleteStartListener = engineWithoutPersistence.on(
			":deleteStart",
			({ detail }) => {
				deleteStartEvent = detail;
			},
		);

		const deleteEndListener = engineWithoutPersistence.on(
			":deleteEnd",
			({ detail }) => {
				deleteEndEvent = detail;
			},
		);

		// Attempt to delete should throw and emit error event
		await expect(engineWithoutPersistence.deleteSaveSlot(1)).rejects.toThrow();

		expect(deleteStartEvent).toEqual({ slot: 1 });
		expect(deleteEndEvent?.type).toBe("error");
		expect(deleteEndEvent?.slot).toBe(1);
		expect(
			deleteEndEvent && "error" in deleteEndEvent && deleteEndEvent.error,
		).toBeInstanceOf(Error);

		deleteStartListener();
		deleteEndListener();
	});
});

describe("State Change Events", () => {
	test("should emit stateChange with complete oldState and newState on variable modification", async () => {
		let stateChangeEvent: {
			oldState: typeof engine.vars;
			newState: typeof engine.vars;
		} | null = null;

		const listener = engine.on(":stateChange", ({ detail }) => {
			stateChangeEvent = detail;
		});

		const initialState = { ...engine.vars };

		engine.setVars((state) => {
			state.player.name = "NewName";
			state.player.level = 50;
		});

		expect(stateChangeEvent).not.toBeNull();
		expect(stateChangeEvent!.oldState).toMatchObject(initialState);
		expect(stateChangeEvent!.newState.player.name).toBe("NewName");
		expect(stateChangeEvent!.newState.player.level).toBe(50);
		expect(stateChangeEvent!.newState.player.inventory).toEqual(
			initialState.player.inventory,
		);

		listener();
	});

	test("should emit stateChange with complete states on nested object modifications", async () => {
		let stateChangeEvent: {
			oldState: typeof engine.vars;
			newState: typeof engine.vars;
		} | null = null;

		const listener = engine.on(":stateChange", ({ detail }) => {
			stateChangeEvent = detail;
		});

		const initialGold = engine.vars.player.inventory.gold;

		engine.setVars((state) => {
			state.player.inventory.gold = 500;
			state.player.inventory.gems = 25;
		});

		expect(stateChangeEvent).not.toBeNull();
		expect(stateChangeEvent!.oldState.player.inventory.gold).toBe(initialGold);
		expect(stateChangeEvent!.oldState.player.inventory.gems).toBe(12);
		expect(stateChangeEvent!.newState.player.inventory.gold).toBe(500);
		expect(stateChangeEvent!.newState.player.inventory.gems).toBe(25);
		expect(stateChangeEvent!.newState.player.name).toBe("Dave"); // Should still be original name since tests are isolated

		listener();
	});

	test("should emit stateChange with complete states on array modifications", async () => {
		let stateChangeEvent: {
			oldState: typeof engine.vars;
			newState: typeof engine.vars;
		} | null = null;

		const listener = engine.on(":stateChange", ({ detail }) => {
			stateChangeEvent = detail;
		});

		const initialItems = [...engine.vars.player.inventory.items];

		engine.setVars((state) => {
			state.player.inventory.items.push("Magic Wand");
			state.player.inventory.items.push("Health Potion");
		});

		expect(stateChangeEvent).not.toBeNull();
		expect(stateChangeEvent!.oldState.player.inventory.items).toEqual(
			initialItems,
		);
		expect(stateChangeEvent!.newState.player.inventory.items).toContain(
			"Magic Wand",
		);
		expect(stateChangeEvent!.newState.player.inventory.items).toContain(
			"Health Potion",
		);
		expect(stateChangeEvent!.newState.player.inventory.items.length).toBe(
			initialItems.length + 2,
		);

		listener();
	});

	test("should emit stateChange with complete states on multiple variable changes in single call", async () => {
		let stateChangeEvent: {
			oldState: typeof engine.vars;
			newState: typeof engine.vars;
		} | null = null;

		const listener = engine.on(":stateChange", ({ detail }) => {
			stateChangeEvent = detail;
		});

		const oldStage = engine.vars.others.stage;
		const oldHoursPlayed = engine.vars.others.hoursPlayed;

		engine.setVars((state) => {
			state.player.level = 100;
			state.player.location = "Castle";
			state.others.stage = 999;
			state.others.hoursPlayed = 50.5;
		});

		expect(stateChangeEvent).not.toBeNull();

		// Verify old state contains original values
		expect(stateChangeEvent!.oldState.others.stage).toBe(oldStage);
		expect(stateChangeEvent!.oldState.others.hoursPlayed).toBe(oldHoursPlayed);

		// Verify new state contains all changes
		expect(stateChangeEvent!.newState.player.level).toBe(100);
		expect(stateChangeEvent!.newState.player.location).toBe("Castle");
		expect(stateChangeEvent!.newState.others.stage).toBe(999);
		expect(stateChangeEvent!.newState.others.hoursPlayed).toBe(50.5);

		listener();
	});

	test("should emit stateChange events on history navigation", async () => {
		const stateChangeEvents: Array<{
			oldState: typeof engine.vars;
			newState: typeof engine.vars;
		}> = [];

		const listener = engine.on(":stateChange", ({ detail }) => {
			stateChangeEvents.push(detail);
		});

		// Navigate to create history
		engine.navigateTo(SAMPLE_PASSAGES[0].name);

		// Make some changes
		engine.setVars((state) => {
			state.player.level = 25;
		});

		engine.navigateTo(SAMPLE_PASSAGES[1].name);

		engine.setVars((state) => {
			state.player.location = "Mountains";
		});

		const currentState = { ...engine.vars };
		const eventsBeforeNavigation = stateChangeEvents.length;

		// Navigate backward - this should trigger a stateChange event
		engine.backward(2);

		expect(stateChangeEvents.length).toBe(eventsBeforeNavigation + 1);

		const lastEvent = stateChangeEvents[stateChangeEvents.length - 1];
		expect(lastEvent.oldState.player.location).toBe("Mountains");
		expect(lastEvent.newState.player.level).toBe(6); // Should reflect the original state at that point in history

		listener();
	});

	test("should preserve custom class instances in stateChange events", async () => {
		let stateChangeEvent: {
			oldState: typeof engine.vars;
			newState: typeof engine.vars;
		} | null = null;

		const listener = engine.on(":stateChange", ({ detail }) => {
			stateChangeEvent = detail;
		});

		engine.setVars((state) => {
			state.player.class = "Wizard";
		});

		expect(stateChangeEvent).not.toBeNull();

		// Verify both states contain the Player class instance with methods
		expect(typeof stateChangeEvent!.oldState.player.favouriteItem).toBe(
			"function",
		);
		expect(typeof stateChangeEvent!.newState.player.favouriteItem).toBe(
			"function",
		);
		expect(stateChangeEvent!.oldState.player.favouriteItem()).toBe(
			"Black Sword",
		);
		expect(stateChangeEvent!.newState.player.favouriteItem()).toBe(
			"Black Sword",
		);

		// Verify the change was applied
		expect(stateChangeEvent!.oldState.player.class).toBe("Paladin");
		expect(stateChangeEvent!.newState.player.class).toBe("Wizard");

		listener();
	});

	test("should emit stateChange with complete states when replacing entire state object", async () => {
		let stateChangeEvent: {
			oldState: typeof engine.vars;
			newState: typeof engine.vars;
		} | null = null;

		const listener = engine.on(":stateChange", ({ detail }) => {
			stateChangeEvent = detail;
		});

		const initialState = { ...engine.vars };
		const newStateObject = {
			player: {
				name: "Completely New Player",
				level: 1,
				class: "Rogue",
			},
			others: {
				stage: 0,
				hoursPlayed: 0,
			},
			newProperty: "This is new",
		};

		engine.setVars(() => newStateObject);

		expect(stateChangeEvent).not.toBeNull();
		expect(stateChangeEvent!.oldState.player.name).toBe(
			initialState.player.name,
		);
		expect(stateChangeEvent!.newState.player.name).toBe(
			"Completely New Player",
		);
		expect((stateChangeEvent!.newState as any).newProperty).toBe("This is new");

		// Note: When completely replacing state, properties not in the new object are not preserved
		// This is the expected behavior based on the engine implementation

		listener();
	});

	test("should handle multiple consecutive stateChange events correctly", async () => {
		const stateChangeEvents: Array<{
			oldLevel: number;
			newLevel: number;
		}> = [];

		const listener = engine.on(":stateChange", ({ detail }) => {
			stateChangeEvents.push({
				oldLevel: detail.oldState.player.level,
				newLevel: detail.newState.player.level,
			});
		});

		// First change: 6 -> 10
		engine.setVars((state) => {
			state.player.level = 10;
		});

		// Second change: 10 -> 20
		engine.setVars((state) => {
			state.player.level = 20;
		});

		// Third change: 20 -> 30
		engine.setVars((state) => {
			state.player.level = 30;
		});

		expect(stateChangeEvents.length).toBe(3);

		// Verify the chain of state changes - should now work correctly with cloned oldState
		expect(stateChangeEvents[0].oldLevel).toBe(6); // Initial level
		expect(stateChangeEvents[0].newLevel).toBe(10);
		expect(stateChangeEvents[1].oldLevel).toBe(10);
		expect(stateChangeEvents[1].newLevel).toBe(20);
		expect(stateChangeEvents[2].oldLevel).toBe(20);
		expect(stateChangeEvents[2].newLevel).toBe(30);

		listener();
	});

	test("should respect eventOptimization performance mode", async () => {
		// Create a new engine with performance optimization
		const performanceEngine = await SugarboxEngine.init({
			name: "PerformanceTest",
			startPassage: { name: "Start", passage: "Start passage" },
			variables: { counter: 0, data: { value: 1 } },
			config: {
				eventOptimization: "performance",
			},
			otherPassages: [],
			achievements: {},
		});

		let eventCount = 0;
		let lastEvent: {
			oldState: typeof performanceEngine.vars;
			newState: typeof performanceEngine.vars;
		} | null = null;

		const listener = performanceEngine.on(":stateChange", ({ detail }) => {
			eventCount++;
			lastEvent = detail;
		});

		// Make a state change
		performanceEngine.setVars((state) => {
			state.counter = 10;
		});

		expect(eventCount).toBe(1);
		expect(lastEvent).not.toBeNull();
		expect(lastEvent!.newState.counter).toBe(10);

		// In performance mode, the event should still work correctly
		// but may not have perfect isolation in edge cases
		expect(typeof lastEvent!.oldState).toBe("object");
		expect(typeof lastEvent!.newState).toBe("object");

		listener();
	});

	test("should work correctly with performance mode without affecting functionality", async () => {
		// Create engine with performance mode
		const perfEngine = await SugarboxEngine.init({
			name: "PerfTest2",
			startPassage: { name: "Start", passage: "Start" },
			variables: { test: { value: 1 }, counter: 0 },
			config: { eventOptimization: "performance" },
			otherPassages: [],
			achievements: {},
		});

		// Test multiple consecutive changes work correctly
		perfEngine.setVars((state) => {
			state.counter = 1;
		});

		perfEngine.setVars((state) => {
			state.counter = 2;
		});

		perfEngine.setVars((state) => {
			state.test.value = 999;
		});

		// Verify final state is correct regardless of optimization mode
		expect(perfEngine.vars.counter).toBe(2);
		expect(perfEngine.vars.test.value).toBe(999);
	});
});

describe("Load-Related Events", () => {
	test("should emit stateChange events when loading from save slot", async () => {
		// Set up initial state
		engine.setVars((state) => {
			state.player.name = "InitialName";
			state.player.level = 10;
			state.others.stage = 1;
		});

		// Navigate to a different passage
		engine.navigateTo("Forest Path");

		// Save the current state
		await engine.saveToSaveSlot(1);

		// Change state after saving
		engine.setVars((state) => {
			state.player.name = "ChangedName";
			state.player.level = 20;
			state.others.stage = 5;
		});

		// Navigate to another passage
		engine.navigateTo("Mountain Peak");

		// Set up event listeners
		let stateChangeEvent: {
			oldState: typeof engine.vars;
			newState: typeof engine.vars;
		} | null = null;

		const listener = engine.on(":stateChange", ({ detail }) => {
			stateChangeEvent = detail;
		});

		// Load the save
		await engine.loadFromSaveSlot(1);

		// Verify stateChange event was emitted with correct data
		expect(stateChangeEvent).not.toBeNull();
		expect(stateChangeEvent!.oldState.player.name).toBe("ChangedName");
		expect(stateChangeEvent!.oldState.player.level).toBe(20);
		expect(stateChangeEvent!.oldState.others.stage).toBe(5);
		expect(stateChangeEvent!.newState.player.name).toBe("InitialName");
		expect(stateChangeEvent!.newState.player.level).toBe(10);
		expect(stateChangeEvent!.newState.others.stage).toBe(1);

		// Verify the final engine state matches the loaded save
		expect(engine.vars.player.name).toBe("InitialName");
		expect(engine.passage).toBe("You walk down a dimly lit path.");

		listener();
	});

	test("should emit passageChange events when loading from save slot", async () => {
		// Navigate to a passage and save
		engine.navigateTo("Mountain Peak");
		await engine.saveToSaveSlot(2);

		// Navigate to a different passage
		engine.navigateTo("Forest Path");

		// Set up event listener
		let passageChangeEvent: {
			oldPassage: string | null;
			newPassage: string | null;
		} | null = null;

		const listener = engine.on(":passageChange", ({ detail }) => {
			passageChangeEvent = detail ?? { newPassage: "", oldPassage: "" };
		});

		// Load the save
		await engine.loadFromSaveSlot(2);

		// Verify passageChange event was emitted with correct data
		expect(passageChangeEvent).not.toBeNull();
		expect(passageChangeEvent!.oldPassage).toBe(
			"You walk down a dimly lit path.",
		);
		expect(passageChangeEvent!.newPassage).toBe(
			"A cold wind whips around you at the summit.",
		);

		listener();
	});

	test("should emit both stateChange and passageChange events when loading saves with performance optimization", async () => {
		// Create engine with performance optimization
		const perfEngine = await SugarboxEngine.init({
			name: "PerfLoadTest",
			startPassage: { name: "Start", passage: "Start passage" },
			variables: { counter: 0, data: { value: 1 } },
			config: {
				eventOptimization: "performance",
				persistence: createPersistenceAdapter(),
			},
			otherPassages: [{ name: "Test", passage: "Test passage" }],
			achievements: {},
		});

		// Set initial state and passage
		perfEngine.setVars((state) => {
			state.counter = 100;
			state.data.value = 999;
		});
		perfEngine.navigateTo("Test");

		// Save state
		await perfEngine.saveToSaveSlot(1);

		// Change state and passage
		perfEngine.setVars((state) => {
			state.counter = 0;
			state.data.value = 1;
		});
		perfEngine.navigateTo("Start");

		// Set up event listeners
		let stateChangeCount = 0;
		let passageChangeCount = 0;
		let lastStateEvent: any = null;
		let lastPassageEvent: any = null;

		const stateListener = perfEngine.on(":stateChange", ({ detail }) => {
			stateChangeCount++;
			lastStateEvent = detail;
		});

		const passageListener = perfEngine.on(":passageChange", ({ detail }) => {
			passageChangeCount++;
			lastPassageEvent = detail;
		});

		// Load the save
		await perfEngine.loadFromSaveSlot(1);

		// Verify both events were emitted
		expect(stateChangeCount).toBe(1);
		expect(passageChangeCount).toBe(1);

		// Verify state change event data
		expect(lastStateEvent.oldState.counter).toBe(0);
		expect(lastStateEvent.newState.counter).toBe(100);
		expect(lastStateEvent.newState.data.value).toBe(999);

		// Verify passage change event data
		expect(lastPassageEvent.oldPassage).toBe("Start passage");
		expect(lastPassageEvent.newPassage).toBe("Test passage");

		// Verify final state
		expect(perfEngine.vars.counter).toBe(100);
		expect(perfEngine.vars.data.value).toBe(999);
		expect(perfEngine.passage).toBe("Test passage");

		stateListener();
		passageListener();
	});

	test("should emit events when loading autosave", async () => {
		// Configure engine with autosave on passage change
		const persistence = createPersistenceAdapter();
		const autoEngine = await SugarboxEngine.init({
			name: "AutoLoadTest",
			startPassage: { name: "Start", passage: "Start passage" },
			variables: { test: "initial" },
			config: {
				autoSave: "passage",
				persistence,
			},
			otherPassages: [{ name: "Auto", passage: "Auto passage" }],
			achievements: {},
		});

		// Change state and navigate (will trigger autosave)
		autoEngine.setVars((state) => {
			state.test = "autosaved";
		});
		autoEngine.navigateTo("Auto");

		// Wait for autosave to complete
		await new Promise((resolve) => setTimeout(resolve, 10));

		// Verify autosave was created
		let foundAutosave = false;
		for await (const save of autoEngine.getSaves()) {
			if (save.type === "autosave") {
				foundAutosave = true;
				expect(save.data.lastPassageId).toBe("Auto");
				break;
			}
		}
		expect(foundAutosave).toBe(true);

		// Change state again
		autoEngine.setVars((state) => {
			state.test = "changed";
		});
		autoEngine.navigateTo("Start");

		// Set up event listeners
		let eventCount = 0;
		let stateEvent: any = null;
		let passageEvent: any = null;

		const stateListener = autoEngine.on(":stateChange", ({ detail }) => {
			eventCount++;
			stateEvent = detail;
		});

		const passageListener = autoEngine.on(":passageChange", ({ detail }) => {
			passageEvent = detail;
		});

		// Load autosave (no parameter means autosave)
		await autoEngine.loadFromSaveSlot();

		// Verify events were emitted
		expect(eventCount).toBe(1);
		expect(stateEvent).not.toBeNull();
		expect(passageEvent).not.toBeNull();

		// Verify data correctness
		expect(stateEvent.oldState.test).toBe("changed");
		expect(stateEvent.newState.test).toBe("autosaved");
		expect(passageEvent.oldPassage).toBe("Start passage");
		expect(passageEvent.newPassage).toBe("Auto passage");

		stateListener();
		passageListener();
	});

	test("should handle load events correctly with complex nested state changes", async () => {
		// Set up complex nested state
		engine.setVars((state) => {
			state.player.inventory.items.push("Magic Ring");
			state.player.inventory.gold = 500;
			state.others.hoursPlayed = 10.5;
		});
		engine.navigateTo("Mountain Peak");

		await engine.saveToSaveSlot(3);

		// Make complex changes
		engine.setVars((state) => {
			state.player.inventory.items = ["Basic Sword"];
			state.player.inventory.gold = 0;
			state.player.name = "NewPlayer";
			state.others.hoursPlayed = 0;
			state.others.stage = 99;
		});
		engine.navigateTo("Start");

		// Set up event listener
		let complexStateEvent: any = null;

		const listener = engine.on(":stateChange", ({ detail }) => {
			complexStateEvent = detail;
		});

		// Load the save
		await engine.loadFromSaveSlot(3);

		// Verify complex nested state restoration
		expect(complexStateEvent).not.toBeNull();
		expect(complexStateEvent.oldState.player.name).toBe("NewPlayer");
		expect(complexStateEvent.oldState.player.inventory.items).toEqual([
			"Basic Sword",
		]);
		expect(complexStateEvent.oldState.player.inventory.gold).toBe(0);
		expect(complexStateEvent.oldState.others.stage).toBe(99);

		expect(complexStateEvent.newState.player.inventory.items).toContain(
			"Magic Ring",
		);
		expect(complexStateEvent.newState.player.inventory.gold).toBe(500);
		expect(complexStateEvent.newState.others.hoursPlayed).toBe(10.5);

		// Verify the actual engine state
		expect(engine.vars.player.inventory.items).toContain("Magic Ring");
		expect(engine.vars.player.inventory.gold).toBe(500);
		expect(engine.passage).toBe("A cold wind whips around you at the summit.");

		listener();
	});

	// Might remove this >~<
	test("should maintain event consistency with #shouldCloneOldState optimization", async () => {
		// Test both accuracy and performance modes to ensure the refactored
		// #shouldCloneOldState getter works correctly

		const testEngines = await Promise.all([
			SugarboxEngine.init({
				name: "AccuracyTest",
				startPassage: { name: "Start", passage: "Start" },
				variables: { shared: { value: 1 } },
				config: {
					eventOptimization: "accuracy",
					persistence: createPersistenceAdapter(),
				},
				otherPassages: [],
				achievements: {},
			}),
			SugarboxEngine.init({
				name: "PerformanceTest",
				startPassage: { name: "Start", passage: "Start" },
				variables: { shared: { value: 1 } },
				config: {
					eventOptimization: "performance",
					persistence: createPersistenceAdapter(),
				},
				otherPassages: [],
				achievements: {},
			}),
		]);

		for (const [index, testEngine] of testEngines.entries()) {
			const mode = index === 0 ? "accuracy" : "performance";

			// Set up state
			testEngine.setVars((state) => {
				state.shared.value = 100;
			});

			await testEngine.saveToSaveSlot(1);

			// Change state
			testEngine.setVars((state) => {
				state.shared.value = 200;
			});

			// Capture events
			let stateEvent: any = null;
			const listener = testEngine.on(":stateChange", ({ detail }) => {
				stateEvent = detail;
			});

			// Load save
			await testEngine.loadFromSaveSlot(1);

			// Verify event structure is consistent regardless of optimization mode
			expect(stateEvent).not.toBeNull();
			expect(stateEvent.oldState.shared.value).toBe(200);
			expect(stateEvent.newState.shared.value).toBe(100);
			expect(typeof stateEvent.oldState).toBe("object");
			expect(typeof stateEvent.newState).toBe("object");

			// In accuracy mode, states should be properly isolated
			if (mode === "accuracy") {
				// Test that modifying the oldState doesn't affect the current engine state
				const originalEngineValue = testEngine.vars.shared.value;
				stateEvent.oldState.shared.value = 999;

				// Engine state should not be affected by modifying oldState
				expect(testEngine.vars.shared.value).toBe(originalEngineValue);

				// But note: in the current implementation, newState may reference the same object
				// as the engine's current state, so we test oldState isolation specifically
			}

			listener();
		}
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

	test("should handle recursive objects (inventory-item relationships) through save/load cycle", async () => {
		// Define interfaces for serialization
		interface InventoryData {
			id: string;
			items: ItemData[];
		}

		interface ItemData {
			name: string;
			// Note: no inventory reference to avoid circular dependency
		}

		// Inventory class that contains items
		class Inventory implements SugarBoxCompatibleClassInstance<InventoryData> {
			static readonly classId = "GameInventory";

			id: string;
			items: Item[] = [];

			constructor(id: string) {
				this.id = id;
			}

			addItem(name: string): Item {
				const item = new Item(name, this);
				this.items.push(item);
				return item;
			}

			toJSON(): InventoryData {
				return {
					id: this.id,
					items: this.items.map((item) => item.toJSON()),
				};
			}

			static fromJSON(data: InventoryData): Inventory {
				const inventory = new Inventory(data.id);
				// Reconstruct items and re-establish parent relationships
				inventory.items = data.items.map((itemData) =>
					Item.fromJSONWithParent(itemData, inventory),
				);
				return inventory;
			}
		}

		// Item class that references back to inventory (circular reference)
		class Item implements SugarBoxCompatibleClassInstance<ItemData> {
			name: string;
			inventory: Inventory;

			constructor(name: string, inventory: Inventory) {
				this.name = name;
				this.inventory = inventory;
			}

			getInventoryId(): string {
				return this.inventory.id;
			}

			toJSON(): ItemData {
				// Exclude inventory reference to break circular dependency
				return { name: this.name };
			}

			static fromJSONWithParent(data: ItemData, inventory: Inventory): Item {
				return new Item(data.name, inventory);
			}
		}

		// Create engine with custom classes
		const testEngine = await SugarboxEngine.init({
			name: "RecursiveObjectTest",
			startPassage: { name: "Start", passage: "Test passage" },
			otherPassages: [],
			variables: {
				playerInventory: new Inventory("player"),
				chestInventory: new Inventory("treasure-chest"),
			},
			config: {
				persistence: createPersistenceAdapter(),
			},
			classes: [Inventory],
		});

		// Add items to inventories (creates circular references)
		testEngine.setVars((vars) => {
			vars.playerInventory.addItem("Magic Sword");
			vars.playerInventory.addItem("Health Potion");
			vars.chestInventory.addItem("Golden Coin");
			vars.chestInventory.addItem("Ancient Key");
		});

		// Verify circular references exist
		const sword = testEngine.vars.playerInventory.items[0];
		const coin = testEngine.vars.chestInventory.items[0];
		expect(sword.inventory).toBe(testEngine.vars.playerInventory);
		expect(coin.inventory).toBe(testEngine.vars.chestInventory);

		// Save the game state
		await testEngine.saveToSaveSlot(1);

		// Modify state to verify load restores correctly
		testEngine.setVars((vars) => {
			vars.playerInventory = new Inventory("modified");
			vars.chestInventory = new Inventory("modified");
		});

		// Verify state is modified
		expect(testEngine.vars.playerInventory.id).toBe("modified");
		expect(testEngine.vars.playerInventory.items.length).toBe(0);

		// Load the saved state
		await testEngine.loadFromSaveSlot(1);

		// Verify the recursive relationships are properly restored
		expect(testEngine.vars.playerInventory).toBeInstanceOf(Inventory);
		expect(testEngine.vars.chestInventory).toBeInstanceOf(Inventory);
		expect(testEngine.vars.playerInventory.id).toBe("player");
		expect(testEngine.vars.chestInventory.id).toBe("treasure-chest");

		// Verify items are restored with correct parent relationships
		const loadedSword = testEngine.vars.playerInventory.items.find(
			(item) => item.name === "Magic Sword",
		);
		const loadedPotion = testEngine.vars.playerInventory.items.find(
			(item) => item.name === "Health Potion",
		);
		const loadedCoin = testEngine.vars.chestInventory.items.find(
			(item) => item.name === "Golden Coin",
		);
		const loadedKey = testEngine.vars.chestInventory.items.find(
			(item) => item.name === "Ancient Key",
		);

		expect(loadedSword).toBeInstanceOf(Item);
		expect(loadedPotion).toBeInstanceOf(Item);
		expect(loadedCoin).toBeInstanceOf(Item);
		expect(loadedKey).toBeInstanceOf(Item);

		// Verify circular references are properly reconstructed
		expect(loadedSword?.inventory).toBe(testEngine.vars.playerInventory);
		expect(loadedPotion?.inventory).toBe(testEngine.vars.playerInventory);
		expect(loadedCoin?.inventory).toBe(testEngine.vars.chestInventory);
		expect(loadedKey?.inventory).toBe(testEngine.vars.chestInventory);

		// Verify methods work on reconstructed objects
		expect(loadedSword?.getInventoryId()).toBe("player");
		expect(loadedCoin?.getInventoryId()).toBe("treasure-chest");

		// Test export/import cycle as well
		const exportData = await testEngine.saveToExport();

		// Modify state again
		testEngine.setVars((vars) => {
			vars.playerInventory = new Inventory("export-test");
		});

		// Import the exported data
		await testEngine.loadFromExport(exportData);

		// Verify everything is restored correctly again
		expect(testEngine.vars.playerInventory.id).toBe("player");
		expect(testEngine.vars.playerInventory.items.length).toBe(2);

		const exportedSword = testEngine.vars.playerInventory.items.find(
			(item) => item.name === "Magic Sword",
		);
		expect(exportedSword?.inventory).toBe(testEngine.vars.playerInventory);
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
				saveVersion: `0.1.0`,
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
				saveVersion: `0.3.0`,
			},
			otherPassages: [],
			variables: { testProp: "defaultValue" },
			achievements: {},
			migrations: [
				{
					from: `0.1.0`,
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
			from: `0.1.0`,
			data: { to: `0.2.0`, migrater: (data: object) => data },
		} as const;
		const migrator2 = {
			from: `0.1.0`, // Duplicate version
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

describe("Dynamic Initial State", () => {
	test("should accept a static object as initial state", async () => {
		const staticVariables = {
			player: { name: "Static Player", level: 1 },
			gold: 100,
		};

		const engine = await SugarboxEngine.init({
			name: "StaticTest",
			variables: staticVariables,
			startPassage: { name: "Start", passage: "Welcome!" },
			otherPassages: [],
			config: {
				persistence: createPersistenceAdapter(),
			},
		});

		expect(engine.vars.player.name).toBe("Static Player");
		expect(engine.vars.gold).toBe(100);
	});

	test("should accept a function that returns initial state", async () => {
		const dynamicVariables = (engine: SugarboxEngine<string>) => ({
			player: { name: "Dynamic Player", level: 1 },
			randomStat: Math.floor(engine.random * 100) + 1, // Random 1-100
			engineName: engine.name,
		});

		const engine = await SugarboxEngine.init({
			name: "DynamicTest",
			variables: dynamicVariables,
			startPassage: { name: "Start", passage: "Welcome!" },
			otherPassages: [],
			config: {
				persistence: createPersistenceAdapter(),
				initialSeed: 12345, // Fixed seed for deterministic testing
			},
		});

		expect(engine.vars.player.name).toBe("Dynamic Player");
		expect(engine.vars.randomStat).toBeNumber();
		expect(engine.vars.randomStat).toBeGreaterThanOrEqual(1);
		expect(engine.vars.randomStat).toBeLessThanOrEqual(100);
		expect(engine.vars.engineName).toBe("DynamicTest");
	});

	test("should provide access to engine properties in dynamic initial state", async () => {
		const dynamicVariables = (
			engine: SugarboxEngine<
				string,
				{
					engineName: string;
					passageId: string;
					randomValue: number;
					hasAchievements: boolean;
					hasSettings: boolean;
				},
				{
					firstLogin: boolean;
				},
				{
					volume: number;
				}
			>,
		) => {
			// Test that we can access various engine properties safely
			return {
				engineName: engine.name,
				passageId: engine.passageId,
				randomValue: engine.random,
				hasAchievements: typeof engine.achievements === "object",
				hasSettings: typeof engine.settings === "object",
			};
		};

		const engine = await SugarboxEngine.init({
			name: "PropertyAccessTest",
			variables: dynamicVariables,
			startPassage: { name: "TestStart", passage: "Test content" },
			otherPassages: [],
			achievements: { firstLogin: false },
			settings: { volume: 0.8 },
			config: {
				persistence: createPersistenceAdapter(),
			},
		});

		expect(engine.vars.engineName).toBe("PropertyAccessTest");
		expect(engine.vars.passageId).toBe("TestStart");
		expect(engine.vars.randomValue).toBeNumber();
		expect(engine.vars.hasAchievements).toBe(true);
		expect(engine.vars.hasSettings).toBe(true);
	});

	test("should preserve __id and __seed properties with dynamic initial state", async () => {
		const dynamicVariables = (_engine: SugarboxEngine<string>) => ({
			customProp: "test",
			__id: "ShouldBeOverwritten",
			__seed: 99999,
		});

		const engine = await SugarboxEngine.init({
			name: "PreservePropsTest",
			variables: dynamicVariables,
			startPassage: { name: "CorrectStart", passage: "Content" },
			otherPassages: [],
			config: {
				persistence: createPersistenceAdapter(),
				initialSeed: 54321,
			},
		});

		expect(engine.vars.customProp).toBe("test");
		expect(engine.vars.__id).toBe("CorrectStart");
		expect(engine.vars.__seed).toBe(54321);
	});
});
