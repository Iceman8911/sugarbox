import { describe, expect, test } from "bun:test";
import { SugarboxEngine } from "../../src";

async function initEngine() {
	return SugarboxEngine.init({
		name: "Test",
		otherPassages: [
			{ name: "Another Passage", passage: "Lorem Ipsum" },
			{ name: "Forest Path", passage: "You walk down a dimly lit path." },
			{
				name: "Mountain Peak",
				passage: "A cold wind whips around you at the summit.",
			},
		],
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

describe("SugarboxEngine", () => {
	test("story variables should be set without issue and persist after passage navigation", async () => {
		const engine = await initEngine();

		engine.setVars((state) => {
			state.name = "Bob";

			state.inventory.gems++;

			state.inventory.items.push("Overpowered Sword");
		});

		engine.navigateTo("Another Passage");

		expect(
			engine.vars.inventory.items.includes("Overpowered Sword"),
		).toBeTrue();

		expect(engine.vars.inventory.gems).toBe(13);

		expect(engine.vars.name).toBe("Bob");
	});

	test("passage navigation should increment the index", async () => {
		const engine = await initEngine();

		engine.navigateTo("Another Passage");

		expect(engine.passageId).toBe("Another Passage");

		for (let i = 1; i < 1_000; i++) {
			engine.navigateTo(
				["Another Passage", "Forest Path", "Mountain Peak"][i % (3 + 1)],
			);
		}

		expect(engine.index).toBe(1_000);
	});
});
