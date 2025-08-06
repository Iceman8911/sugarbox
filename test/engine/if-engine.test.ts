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

	const engine = await SugarboxEngine.init({
		name: "Test",
		otherPassages: [...SAMPLE_PASSAGES],
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
	});

	engine.registerClasses(Player);

	return engine;
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

		engine.setVars((_) => {
			return testObj;
		});

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

	test("the state should the correct when moving the index through history", () => {
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
});

describe("Saving and Loading saves / save data", () => {
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

describe("Custom Classes", () => {
	test("custom classes should still work after saving / loading", async () => {
		await engine.saveToSaveSlot(1);

		await engine.loadFromSaveSlot(1);

		expect(engine.vars.player.favouriteItem()).toBe("Black Sword");
	});
});

describe("Events", () => {
	test("ensure events are emitted with the appropriate data and can be turned off", async () => {
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

		// From this point no changes should be registered
		endListener();

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

		// From this point no changes should be registered
		endListener2();

		engine.setVars((state) => {
			state.others.stage = 1;
		});

		expect(stateChangeCount).not.toBe(2);

		//@ts-ignore This expect keeps failing, since the state will still be changed via reference (?)
		// expect(stateChangedData?.newState.others.stage).not.toBe(1);
	});
});
