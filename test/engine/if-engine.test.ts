import { expect, test } from "bun:test";
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
		variables: { name: "Dave", inventory: { gold: 123, gems: 12 } },
	});
}

test("should initialize without issue", async () => {
	const engine = await initEngine();

	engine.setVars((state) => {
		state.name = "Sheep";

		state.inventory.gems = 21;
	});

	engine.navigateTo("Another Passage");

	expect(engine.passageId).toBe("Another Passage");

	engine.navigateTo("Start");

	expect(engine.index).toBe(2);
});
