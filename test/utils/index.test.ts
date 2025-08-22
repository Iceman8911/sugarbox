import { describe, expect, test } from "bun:test";
import { clone } from "../../src/utils/clone";
import { registerClass } from "../../src/utils/serializer";

// Define a simple custom class for testing devalue compatibility
class TestCustomClass {
	value: string;

	constructor(value: string) {
		this.value = value;
	}

	// Required for the serializer
	toJSON() {
		return { value: this.value };
	}

	// Required for the serializer
	static fromJSON(json: { value: string }) {
		return new TestCustomClass(json.value);
	}
	static classId = "TestCustomClass";

	greet() {
		return `Hello, ${this.value}!`;
	}
}

// Register the custom class with serializer
registerClass(TestCustomClass);

describe("Utility Functions", () => {
	describe("clone", () => {
		test("should deep clone primitive types", () => {
			const num = 123;
			const clonedNum = clone(num);
			expect(clonedNum).toBe(num);

			const str = "hello";
			const clonedStr = clone(str);
			expect(clonedStr).toBe(str);

			const bool = true;
			const clonedBool = clone(bool);
			expect(clonedBool).toBe(bool);

			const nu = null;
			const clonedNull = clone(nu);
			expect(clonedNull).toBe(nu);

			const und = undefined;
			const clonedUndefined = clone(und);
			expect(clonedUndefined).toBe(und);
		});

		test("should deep clone plain objects", () => {
			const obj = { a: 1, b: "two", c: { d: true } };
			const clonedObj = clone(obj);
			expect(clonedObj).toEqual(obj);
			expect(clonedObj).not.toBe(obj); // Ensure it's a new object
			expect(clonedObj.c).not.toBe(obj.c); // Ensure nested objects are also new
		});

		test("should deep clone arrays", () => {
			const arr = [1, "two", { a: true }];
			const clonedArr = clone(arr);
			expect(clonedArr).toEqual(arr);
			expect(clonedArr).not.toBe(arr); // Ensure it's a new array
			expect(clonedArr[2]).not.toBe(arr[2]); // Ensure nested objects are also new
		});

		test("should deep clone objects containing custom classes", () => {
			const customInstance = new TestCustomClass("World");
			const objWithCustom = { data: 1, custom: customInstance };
			const clonedObj = clone(objWithCustom);

			expect(clonedObj).toEqual(objWithCustom);
			expect(clonedObj).not.toBe(objWithCustom);
			expect(clonedObj.custom).not.toBe(customInstance);
			expect(clonedObj.custom).toBeInstanceOf(TestCustomClass);
			expect(clonedObj.custom.value).toBe("World");
			expect(clonedObj.custom.greet()).toBe("Hello, World!");
		});

		test("should handle circular references gracefully (using structuredClone fallback)", () => {
			type Circular = {
				a: number;
				b: Circular | null;
			};

			const obj: Circular = { a: 1, b: null };
			obj.b = obj; // Create circular reference

			// devalue should handle this, but if it fails, structuredClone will catch it.
			const clonedObj = clone(obj);
			expect(clonedObj).toEqual(obj);
			expect(clonedObj).not.toBe(obj);
			expect(clonedObj.b).toBe(clonedObj); // Cloned object should also have a circular reference
		});

		test("should deep clone objects containing RegExp", () => {
			const regex = /test[0-9]+/gi;
			const obj = { pattern: regex, name: "test" };

			const clonedObj = clone(obj);

			expect(clonedObj).toEqual(obj);
			expect(clonedObj).not.toBe(obj);
			expect(clonedObj.pattern).not.toBe(regex);
			expect(clonedObj.pattern).toBeInstanceOf(RegExp);
			expect(clonedObj.pattern.source).toBe(regex.source);
			expect(clonedObj.pattern.flags).toBe(regex.flags);
		});

		test("should deep clone objects containing BigInt", () => {
			const bigNum = 9007199254740991n;
			const obj = { value: bigNum, name: "large number" };

			const clonedObj = clone(obj);

			expect(clonedObj).toEqual(obj);
			expect(clonedObj).not.toBe(obj);
			expect(clonedObj.value).toBe(bigNum);
			expect(typeof clonedObj.value).toBe("bigint");
		});
	});

	describe("Recursive Objects (Circular References)", () => {
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
		class Inventory {
			static readonly classId = "Inventory";

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
		class Item {
			name: string;
			inventory: Inventory;

			constructor(name: string, inventory: Inventory) {
				this.name = name;
				this.inventory = inventory;
			}

			toJSON(): ItemData {
				// Exclude inventory reference to break circular dependency
				return { name: this.name };
			}

			static fromJSONWithParent(data: ItemData, inventory: Inventory): Item {
				return new Item(data.name, inventory);
			}
		}

		// Register class for serialization
		registerClass(Inventory);

		test("should serialize and deserialize inventory with items without circular reference issues", () => {
			// Create inventory with items (this creates circular references)
			const inventory = new Inventory("main-inventory");
			const sword = inventory.addItem("Magic Sword");
			const shield = inventory.addItem("Golden Shield");
			const potion = inventory.addItem("Health Potion");

			// Verify circular references exist in the original objects
			expect(sword.inventory).toBe(inventory);
			expect(shield.inventory).toBe(inventory);
			expect(potion.inventory).toBe(inventory);
			expect(inventory.items).toContain(sword);
			expect(inventory.items).toContain(shield);
			expect(inventory.items).toContain(potion);

			// Clone should work without circular reference issues
			const clonedInventory = clone(inventory);

			// Verify the clone maintains the structure
			expect(clonedInventory).toBeInstanceOf(Inventory);
			expect(clonedInventory.id).toBe("main-inventory");
			expect(clonedInventory.items.length).toBe(3);

			// Verify items are properly reconstructed
			const clonedSword = clonedInventory.items.find(
				(item) => item.name === "Magic Sword",
			);
			const clonedShield = clonedInventory.items.find(
				(item) => item.name === "Golden Shield",
			);
			const clonedPotion = clonedInventory.items.find(
				(item) => item.name === "Health Potion",
			);

			expect(clonedSword).toBeInstanceOf(Item);
			expect(clonedShield).toBeInstanceOf(Item);
			expect(clonedPotion).toBeInstanceOf(Item);

			// Verify parent-child relationships are reconstructed correctly
			expect(clonedSword?.inventory).toBe(clonedInventory);
			expect(clonedShield?.inventory).toBe(clonedInventory);
			expect(clonedPotion?.inventory).toBe(clonedInventory);

			// Verify it's a deep clone (different objects)
			expect(clonedInventory).not.toBe(inventory);
			expect(clonedSword).not.toBe(sword);
			expect(clonedShield).not.toBe(shield);
			expect(clonedPotion).not.toBe(potion);
		});

		test("should handle nested inventories with items correctly", () => {
			// Create a wrapper class for the game state to ensure proper serialization
			class GameState {
				static readonly classId = "GameState";

				player: {
					name: string;
					mainInventory: Inventory;
					backpack: Inventory;
				};

				constructor(
					playerName: string,
					mainInventory: Inventory,
					backpack: Inventory,
				) {
					this.player = {
						name: playerName,
						mainInventory,
						backpack,
					};
				}

				toJSON() {
					return {
						player: {
							name: this.player.name,
							mainInventory: this.player.mainInventory.toJSON(),
							backpack: this.player.backpack.toJSON(),
						},
					};
				}

				static fromJSON(data: any): GameState {
					const mainInventory = Inventory.fromJSON(data.player.mainInventory);
					const backpack = Inventory.fromJSON(data.player.backpack);
					return new GameState(data.player.name, mainInventory, backpack);
				}
			}

			registerClass(GameState);

			// Create a more complex scenario with nested relationships
			const mainInventory = new Inventory("main");
			const backpack = new Inventory("backpack");

			// Add items to both inventories
			const mainSword = mainInventory.addItem("Main Sword");
			const backpackPotion = backpack.addItem("Backup Potion");
			backpack.addItem("Secret Key");

			// Create the game state
			const gameState = new GameState("Hero", mainInventory, backpack);

			const clonedState = clone(gameState);

			// Verify structure is maintained
			expect(clonedState).toBeInstanceOf(GameState);
			expect(clonedState.player.name).toBe("Hero");
			expect(clonedState.player.mainInventory).toBeInstanceOf(Inventory);
			expect(clonedState.player.backpack).toBeInstanceOf(Inventory);

			// Verify relationships are correct
			const clonedMainSword = clonedState.player.mainInventory.items[0];
			const clonedBackpackPotion = clonedState.player.backpack.items[0];
			const clonedBackpackKey = clonedState.player.backpack.items[1];

			expect(clonedMainSword.inventory).toBe(clonedState.player.mainInventory);
			expect(clonedBackpackPotion.inventory).toBe(clonedState.player.backpack);
			expect(clonedBackpackKey.inventory).toBe(clonedState.player.backpack);

			// Verify it's properly deep cloned
			expect(clonedState).not.toBe(gameState);
			expect(clonedMainSword).not.toBe(mainSword);
			expect(clonedBackpackPotion).not.toBe(backpackPotion);
		});

		test("should handle empty inventory correctly", () => {
			const emptyInventory = new Inventory("empty");
			const clonedEmpty = clone(emptyInventory);

			expect(clonedEmpty).toBeInstanceOf(Inventory);
			expect(clonedEmpty.id).toBe("empty");
			expect(clonedEmpty.items).toEqual([]);
			expect(clonedEmpty).not.toBe(emptyInventory);
		});
	});
});
