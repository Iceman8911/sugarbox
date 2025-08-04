import { beforeEach, describe, expect, test } from "bun:test";
import { SugarboxEngine } from "../../src";

const SAMPLE_PASSAGES = [
	{ name: "Passage2", passage: "Lorem Ipsum" },
	{ name: "Forest Path", passage: "You walk down a dimly lit path." },
	{
		name: "Mountain Peak",
		passage: "A cold wind whips around you at the summit.",
	},
] as const;

async function initEngine() {
	return SugarboxEngine.init({
		name: "Test",
		otherPassages: [...SAMPLE_PASSAGES],
		startPassage: { name: "Start", passage: "This is the start passage" },
		variables: {
			name: "Dave",
			age: 21,
			class: "Paladin",
			level: 6,
			location: "Tavern",
			inventory: {
				gold: 123,
				gems: 12,
				items: ["Black Sword", "Slug Shield", "Old Cloth"],
			},
		},
		config: {
			maxStateCount: 1_000_000,
		},
	});
}

let engine: ReturnType<typeof initEngine> extends Promise<infer T> ? T : never;

beforeEach(async () => {
	engine = await initEngine();
});

describe("SugarboxEngine", () => {
	test("story variables should be set without issue and persist after passage navigation", async () => {
		engine.setVars((state) => {
			state.name = "Bob";

			state.inventory.gems++;

			state.inventory.items.push("Overpowered Sword");
		});

		engine.navigateTo(SAMPLE_PASSAGES[0].name);

		expect(
			engine.vars.inventory.items.includes("Overpowered Sword"),
		).toBeTrue();

		expect(engine.vars.inventory.gems).toBe(13);

		expect(engine.vars.name).toBe("Bob");
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
});
