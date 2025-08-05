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
			maxStateCount: 1_000_000,
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

describe("SugarboxEngine", () => {
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

	test("passage navigation should increment the index", async () => {
		engine.navigateTo(SAMPLE_PASSAGES[0].name);

		expect(engine.passageId).toBe(SAMPLE_PASSAGES[0].name);

		for (let i = 1; i < 1_000; i++) {
			engine.navigateTo(SAMPLE_PASSAGES.map((data) => data.name)[i % (3 + 1)]);
		}

		expect(engine.index).toBe(1_000);
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

	test("custom classes should still work after saving / loading", async () => {
		engine.setVars((state) => {
			state.player.name = "Alice";
			state.player.age = 30;
			state.player.class = "Mage";
		});

		await engine.saveToSaveSlot(1);

		engine.navigateTo(SAMPLE_PASSAGES[2].name);

		await engine.loadFromSaveSlot(1);

		expect(engine.vars.player.favouriteItem()).toBe("Black Sword");
	});
});
