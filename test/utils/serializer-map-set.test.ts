import { describe, expect, test } from "bun:test";
import { clone } from "../../src/utils/clone";
import {
	deserialize,
	registerClass,
	serialize,
} from "../../src/utils/serializer";

// Custom class that contains Map and Set for testing
class GamePlayerData {
	static readonly classId = "GamePlayerData";

	name: string;
	level: number;
	inventory: Map<string, number>; // item name -> quantity
	achievements: Set<string>; // achievement names
	friends: Map<string, { level: number; lastSeen: Date }>; // friend name -> data
	visitedZones: Set<number>; // zone IDs

	constructor(name: string, level: number = 1) {
		this.name = name;
		this.level = level;
		this.inventory = new Map();
		this.achievements = new Set();
		this.friends = new Map();
		this.visitedZones = new Set();
	}

	addItem(itemName: string, quantity: number): void {
		const currentQuantity = this.inventory.get(itemName) || 0;
		this.inventory.set(itemName, currentQuantity + quantity);
	}

	addAchievement(achievement: string): void {
		this.achievements.add(achievement);
	}

	addFriend(name: string, level: number, lastSeen: Date): void {
		this.friends.set(name, { level, lastSeen });
	}

	visitZone(zoneId: number): void {
		this.visitedZones.add(zoneId);
	}

	toJSON() {
		return {
			name: this.name,
			level: this.level,
			inventory: this.inventory,
			achievements: this.achievements,
			friends: this.friends,
			visitedZones: this.visitedZones,
		};
	}

	static fromJSON(data: {
		name: string;
		level: number;
		inventory: Map<string, number>;
		achievements: Set<string>;
		friends: Map<string, { level: number; lastSeen: Date }>;
		visitedZones: Set<number>;
	}): GamePlayerData {
		const player = new GamePlayerData(data.name, data.level);
		player.inventory = data.inventory;
		player.achievements = data.achievements;
		player.friends = data.friends;
		player.visitedZones = data.visitedZones;
		return player;
	}
}

// Register the class for serialization
registerClass(GamePlayerData);

describe("Serializer Map and Set Tests", () => {
	describe("Custom class with Map and Set serialization", () => {
		test("should serialize and deserialize empty Map and Set correctly", () => {
			const player = new GamePlayerData("EmptyPlayer", 1);

			const serialized = serialize(player);
			const deserialized = deserialize(serialized);

			expect(deserialized).toBeInstanceOf(GamePlayerData);
			expect(deserialized.name).toBe("EmptyPlayer");
			expect(deserialized.level).toBe(1);
			expect(deserialized.inventory).toBeInstanceOf(Map);
			expect(deserialized.achievements).toBeInstanceOf(Set);
			expect(deserialized.friends).toBeInstanceOf(Map);
			expect(deserialized.visitedZones).toBeInstanceOf(Set);

			// Verify empty collections
			expect(deserialized.inventory.size).toBe(0);
			expect(deserialized.achievements.size).toBe(0);
			expect(deserialized.friends.size).toBe(0);
			expect(deserialized.visitedZones.size).toBe(0);
		});

		test("should serialize and deserialize populated Map and Set correctly", () => {
			const player = new GamePlayerData("TestPlayer", 25);

			// Populate inventory Map
			player.addItem("Health Potion", 5);
			player.addItem("Magic Sword", 1);
			player.addItem("Gold Coins", 150);

			// Populate achievements Set
			player.addAchievement("First Kill");
			player.addAchievement("Level 10 Reached");
			player.addAchievement("Boss Defeated");

			// Populate friends Map with Date objects
			const date1 = new Date("2024-01-15T10:30:00Z");
			const date2 = new Date("2024-01-20T15:45:00Z");
			player.addFriend("Alice", 30, date1);
			player.addFriend("Bob", 22, date2);

			// Populate visited zones Set
			player.visitZone(101);
			player.visitZone(205);
			player.visitZone(350);

			const serialized = serialize(player);
			const deserialized = deserialize(serialized);

			// Verify basic properties
			expect(deserialized).toBeInstanceOf(GamePlayerData);
			expect(deserialized.name).toBe("TestPlayer");
			expect(deserialized.level).toBe(25);

			// Verify inventory Map
			expect(deserialized.inventory).toBeInstanceOf(Map);
			expect(deserialized.inventory.size).toBe(3);
			expect(deserialized.inventory.get("Health Potion")).toBe(5);
			expect(deserialized.inventory.get("Magic Sword")).toBe(1);
			expect(deserialized.inventory.get("Gold Coins")).toBe(150);
			expect(deserialized.inventory.get("Non-existent")).toBeUndefined();

			// Verify achievements Set
			expect(deserialized.achievements).toBeInstanceOf(Set);
			expect(deserialized.achievements.size).toBe(3);
			expect(deserialized.achievements.has("First Kill")).toBe(true);
			expect(deserialized.achievements.has("Level 10 Reached")).toBe(true);
			expect(deserialized.achievements.has("Boss Defeated")).toBe(true);
			expect(deserialized.achievements.has("Non-existent")).toBe(false);

			// Verify friends Map with nested Date objects
			expect(deserialized.friends).toBeInstanceOf(Map);
			expect(deserialized.friends.size).toBe(2);

			const aliceData = deserialized.friends.get("Alice");
			expect(aliceData).toBeDefined();
			expect(aliceData?.level).toBe(30);
			expect(aliceData?.lastSeen).toBeInstanceOf(Date);
			expect(aliceData?.lastSeen.getTime()).toBe(date1.getTime());

			const bobData = deserialized.friends.get("Bob");
			expect(bobData).toBeDefined();
			expect(bobData?.level).toBe(22);
			expect(bobData?.lastSeen).toBeInstanceOf(Date);
			expect(bobData?.lastSeen.getTime()).toBe(date2.getTime());

			// Verify visited zones Set
			expect(deserialized.visitedZones).toBeInstanceOf(Set);
			expect(deserialized.visitedZones.size).toBe(3);
			expect(deserialized.visitedZones.has(101)).toBe(true);
			expect(deserialized.visitedZones.has(205)).toBe(true);
			expect(deserialized.visitedZones.has(350)).toBe(true);
			expect(deserialized.visitedZones.has(999)).toBe(false);
		});

		test("should maintain Map and Set iteration order", () => {
			const player = new GamePlayerData("OrderTest", 10);

			// Add items in specific order
			const itemOrder = ["Sword", "Shield", "Potion", "Armor", "Ring"];
			for (const item of itemOrder) {
				player.addItem(item, 1);
			}

			// Add achievements in specific order
			const achievementOrder = ["First", "Second", "Third", "Fourth", "Fifth"];
			for (const achievement of achievementOrder) {
				player.addAchievement(achievement);
			}

			const serialized = serialize(player);
			const deserialized = deserialize(serialized);

			// Verify Map iteration order
			const deserializedItemOrder = Array.from(deserialized.inventory.keys());
			expect(deserializedItemOrder).toEqual(itemOrder);

			// Verify Set iteration order
			const deserializedAchievementOrder = Array.from(
				deserialized.achievements,
			);
			expect(deserializedAchievementOrder).toEqual(achievementOrder);
		});

		test("should handle complex Map keys including objects", () => {
			// Custom class for testing complex Map keys
			class ItemKey {
				static readonly classId = "ItemKey";

				category: string;
				subtype: string;

				constructor(category: string, subtype: string) {
					this.category = category;
					this.subtype = subtype;
				}

				toJSON() {
					return { category: this.category, subtype: this.subtype };
				}

				static fromJSON(data: { category: string; subtype: string }): ItemKey {
					return new ItemKey(data.category, data.subtype);
				}
			}

			registerClass(ItemKey);

			class ComplexInventory {
				static readonly classId = "ComplexInventory";

				// Map with object keys
				complexItems: Map<ItemKey, { quantity: number; quality: string }>;

				constructor() {
					this.complexItems = new Map();
				}

				addComplexItem(key: ItemKey, quantity: number, quality: string): void {
					this.complexItems.set(key, { quantity, quality });
				}

				toJSON() {
					return { complexItems: this.complexItems };
				}

				static fromJSON(data: {
					complexItems: Map<ItemKey, { quantity: number; quality: string }>;
				}): ComplexInventory {
					const inventory = new ComplexInventory();
					inventory.complexItems = data.complexItems;
					return inventory;
				}
			}

			registerClass(ComplexInventory);

			const inventory = new ComplexInventory();
			const weaponKey = new ItemKey("weapon", "sword");
			const armorKey = new ItemKey("armor", "helmet");

			inventory.addComplexItem(weaponKey, 1, "legendary");
			inventory.addComplexItem(armorKey, 2, "rare");

			const serialized = serialize(inventory);
			const deserialized = deserialize(serialized);

			expect(deserialized).toBeInstanceOf(ComplexInventory);
			expect(deserialized.complexItems).toBeInstanceOf(Map);
			expect(deserialized.complexItems.size).toBe(2);

			// Find items by checking key properties
			let foundWeapon = false;
			let foundArmor = false;

			for (const [key, value] of deserialized.complexItems) {
				expect(key).toBeInstanceOf(ItemKey);

				if (key.category === "weapon" && key.subtype === "sword") {
					expect(value.quantity).toBe(1);
					expect(value.quality).toBe("legendary");
					foundWeapon = true;
				} else if (key.category === "armor" && key.subtype === "helmet") {
					expect(value.quantity).toBe(2);
					expect(value.quality).toBe("rare");
					foundArmor = true;
				}
			}

			expect(foundWeapon).toBe(true);
			expect(foundArmor).toBe(true);
		});

		test("should handle nested Maps and Sets correctly", () => {
			class NestedCollections {
				static readonly classId = "NestedCollections";

				// Map containing Sets as values
				regionZones: Map<string, Set<number>>;
				// Set containing Maps as values
				playerStats: Set<Map<string, number>>;

				constructor() {
					this.regionZones = new Map();
					this.playerStats = new Set();
				}

				addRegion(regionName: string, zones: number[]): void {
					this.regionZones.set(regionName, new Set(zones));
				}

				addPlayerStats(stats: Record<string, number>): void {
					this.playerStats.add(new Map(Object.entries(stats)));
				}

				toJSON() {
					return {
						regionZones: this.regionZones,
						playerStats: this.playerStats,
					};
				}

				static fromJSON(data: {
					regionZones: Map<string, Set<number>>;
					playerStats: Set<Map<string, number>>;
				}): NestedCollections {
					const collections = new NestedCollections();
					collections.regionZones = data.regionZones;
					collections.playerStats = data.playerStats;
					return collections;
				}
			}

			registerClass(NestedCollections);

			const nested = new NestedCollections();
			nested.addRegion("Forest", [1, 2, 3, 4]);
			nested.addRegion("Desert", [10, 11, 12]);
			nested.addPlayerStats({ strength: 25, dexterity: 18, intelligence: 22 });
			nested.addPlayerStats({ health: 100, mana: 75 });

			const serialized = serialize(nested);
			const deserialized = deserialize(serialized);

			expect(deserialized).toBeInstanceOf(NestedCollections);

			// Verify nested Map<string, Set<number>>
			expect(deserialized.regionZones).toBeInstanceOf(Map);
			expect(deserialized.regionZones.size).toBe(2);

			const forestZones = deserialized.regionZones.get("Forest");
			expect(forestZones).toBeInstanceOf(Set);
			expect(forestZones?.size).toBe(4);
			expect(forestZones?.has(1)).toBe(true);
			expect(forestZones?.has(4)).toBe(true);

			const desertZones = deserialized.regionZones.get("Desert");
			expect(desertZones).toBeInstanceOf(Set);
			expect(desertZones?.size).toBe(3);
			expect(desertZones?.has(10)).toBe(true);
			expect(desertZones?.has(12)).toBe(true);

			// Verify nested Set<Map<string, number>>
			expect(deserialized.playerStats).toBeInstanceOf(Set);
			expect(deserialized.playerStats.size).toBe(2);

			const statsArray = Array.from(deserialized.playerStats);
			expect(statsArray[0]).toBeInstanceOf(Map);
			expect(statsArray[1]).toBeInstanceOf(Map);

			// Find the stats maps by checking their contents
			let foundPrimaryStats = false;
			let foundHealthManaStats = false;

			for (const statsMap of deserialized.playerStats) {
				if (statsMap.has("strength")) {
					expect(statsMap.get("strength")).toBe(25);
					expect(statsMap.get("dexterity")).toBe(18);
					expect(statsMap.get("intelligence")).toBe(22);
					foundPrimaryStats = true;
				} else if (statsMap.has("health")) {
					expect(statsMap.get("health")).toBe(100);
					expect(statsMap.get("mana")).toBe(75);
					foundHealthManaStats = true;
				}
			}

			expect(foundPrimaryStats).toBe(true);
			expect(foundHealthManaStats).toBe(true);
		});

		test("should clone custom class with Map and Set using clone utility", () => {
			const originalPlayer = new GamePlayerData("CloneTest", 15);

			originalPlayer.addItem("Bow", 1);
			originalPlayer.addItem("Arrows", 50);
			originalPlayer.addAchievement("Archer");
			originalPlayer.addFriend("Charlie", 20, new Date("2024-01-25T12:00:00Z"));
			originalPlayer.visitZone(500);

			const clonedPlayer = clone(originalPlayer);

			// Verify it's a proper clone
			expect(clonedPlayer).toBeInstanceOf(GamePlayerData);
			expect(clonedPlayer).not.toBe(originalPlayer);
			expect(clonedPlayer.inventory).not.toBe(originalPlayer.inventory);
			expect(clonedPlayer.achievements).not.toBe(originalPlayer.achievements);
			expect(clonedPlayer.friends).not.toBe(originalPlayer.friends);
			expect(clonedPlayer.visitedZones).not.toBe(originalPlayer.visitedZones);

			// Verify all data is identical
			expect(clonedPlayer.name).toBe(originalPlayer.name);
			expect(clonedPlayer.level).toBe(originalPlayer.level);

			expect(clonedPlayer.inventory.get("Bow")).toBe(1);
			expect(clonedPlayer.inventory.get("Arrows")).toBe(50);
			expect(clonedPlayer.achievements.has("Archer")).toBe(true);
			expect(clonedPlayer.visitedZones.has(500)).toBe(true);

			const charlieData = clonedPlayer.friends.get("Charlie");
			expect(charlieData?.level).toBe(20);
			expect(charlieData?.lastSeen).toBeInstanceOf(Date);
			expect(charlieData?.lastSeen.getTime()).toBe(
				new Date("2024-01-25T12:00:00Z").getTime(),
			);

			// Verify modifications to clone don't affect original
			clonedPlayer.addItem("Staff", 1);
			expect(originalPlayer.inventory.has("Staff")).toBe(false);
			expect(clonedPlayer.inventory.has("Staff")).toBe(true);
		});

		test("should handle Maps and Sets with null values (note: undefined becomes null in JSON)", () => {
			class EdgeCaseCollections {
				static readonly classId = "EdgeCaseCollections";

				mapWithNulls: Map<string, null | number>;
				setWithNulls: Set<null | string>;

				constructor() {
					this.mapWithNulls = new Map();
					this.setWithNulls = new Set();
				}

				toJSON() {
					return {
						mapWithNulls: this.mapWithNulls,
						setWithNulls: this.setWithNulls,
					};
				}

				static fromJSON(data: {
					mapWithNulls: Map<string, null | number>;
					setWithNulls: Set<null | string>;
				}): EdgeCaseCollections {
					const collections = new EdgeCaseCollections();
					collections.mapWithNulls = data.mapWithNulls;
					collections.setWithNulls = data.setWithNulls;
					return collections;
				}
			}

			registerClass(EdgeCaseCollections);

			const collections = new EdgeCaseCollections();
			collections.mapWithNulls.set("null_value", null);

			//@ts-expect-error This will become null after serialization
			collections.mapWithNulls.set("undefined_value", undefined);
			collections.mapWithNulls.set("number_value", 42);

			collections.setWithNulls.add(null);
			//@ts-expect-error This will become null after serialization, causing duplicate
			collections.setWithNulls.add(undefined);
			collections.setWithNulls.add("string_value");

			const serialized = serialize(collections);
			const deserialized = deserialize(serialized);

			expect(deserialized).toBeInstanceOf(EdgeCaseCollections);
			expect(deserialized.mapWithNulls).toBeInstanceOf(Map);
			expect(deserialized.setWithNulls).toBeInstanceOf(Set);

			expect(deserialized.mapWithNulls.get("null_value")).toBe(null);
			// Note: undefined values become null due to JSON serialization limitations
			expect(deserialized.mapWithNulls.get("undefined_value")).toBe(null);
			expect(deserialized.mapWithNulls.get("number_value")).toBe(42);

			expect(deserialized.setWithNulls.has(null)).toBe(true);
			// Note: Set will only have one null value since undefined becomes null (duplicate)
			expect(deserialized.setWithNulls.size).toBe(2); // null and "string_value"
			expect(deserialized.setWithNulls.has("string_value")).toBe(true);
		});

		test("should handle Maps with various primitive key types", () => {
			class PrimitiveKeyMap {
				static readonly classId = "PrimitiveKeyMap";

				stringKeys: Map<string, string>;
				numberKeys: Map<number, string>;
				booleanKeys: Map<boolean, string>;
				mixedKeys: Map<string | number | boolean, string>;

				constructor() {
					this.stringKeys = new Map();
					this.numberKeys = new Map();
					this.booleanKeys = new Map();
					this.mixedKeys = new Map();
				}

				toJSON() {
					return {
						stringKeys: this.stringKeys,
						numberKeys: this.numberKeys,
						booleanKeys: this.booleanKeys,
						mixedKeys: this.mixedKeys,
					};
				}

				static fromJSON(data: {
					stringKeys: Map<string, string>;
					numberKeys: Map<number, string>;
					booleanKeys: Map<boolean, string>;
					mixedKeys: Map<string | number | boolean, string>;
				}): PrimitiveKeyMap {
					const keyMap = new PrimitiveKeyMap();
					keyMap.stringKeys = data.stringKeys;
					keyMap.numberKeys = data.numberKeys;
					keyMap.booleanKeys = data.booleanKeys;
					keyMap.mixedKeys = data.mixedKeys;
					return keyMap;
				}
			}

			registerClass(PrimitiveKeyMap);

			const keyMap = new PrimitiveKeyMap();
			keyMap.stringKeys.set("string_key", "string value");
			keyMap.numberKeys.set(123, "number value");
			keyMap.numberKeys.set(0, "zero value");
			keyMap.numberKeys.set(-456, "negative value");
			keyMap.booleanKeys.set(true, "true value");
			keyMap.booleanKeys.set(false, "false value");

			keyMap.mixedKeys.set("mixed_string", "string");
			keyMap.mixedKeys.set(789, "number");
			keyMap.mixedKeys.set(true, "boolean");

			const serialized = serialize(keyMap);
			const deserialized = deserialize(serialized);

			expect(deserialized).toBeInstanceOf(PrimitiveKeyMap);

			// Test string keys
			expect(deserialized.stringKeys.get("string_key")).toBe("string value");

			// Test number keys
			expect(deserialized.numberKeys.get(123)).toBe("number value");
			expect(deserialized.numberKeys.get(0)).toBe("zero value");
			expect(deserialized.numberKeys.get(-456)).toBe("negative value");

			// Test boolean keys
			expect(deserialized.booleanKeys.get(true)).toBe("true value");
			expect(deserialized.booleanKeys.get(false)).toBe("false value");

			// Test mixed keys
			expect(deserialized.mixedKeys.get("mixed_string")).toBe("string");
			expect(deserialized.mixedKeys.get(789)).toBe("number");
			expect(deserialized.mixedKeys.get(true)).toBe("boolean");
		});

		test("should handle Sets with various primitive value types", () => {
			class PrimitiveValueSet {
				static readonly classId = "PrimitiveValueSet";

				mixedValues: Set<string | number | boolean | null>;
				bigIntValues: Set<bigint>;

				constructor() {
					this.mixedValues = new Set();
					this.bigIntValues = new Set();
				}

				toJSON() {
					return {
						mixedValues: this.mixedValues,
						bigIntValues: this.bigIntValues,
					};
				}

				static fromJSON(data: {
					mixedValues: Set<string | number | boolean | null>;
					bigIntValues: Set<bigint>;
				}): PrimitiveValueSet {
					const valueSet = new PrimitiveValueSet();
					valueSet.mixedValues = data.mixedValues;
					valueSet.bigIntValues = data.bigIntValues;
					return valueSet;
				}
			}

			registerClass(PrimitiveValueSet);

			const valueSet = new PrimitiveValueSet();
			valueSet.mixedValues.add("string");
			valueSet.mixedValues.add(42);
			valueSet.mixedValues.add(-123);
			valueSet.mixedValues.add(true);
			valueSet.mixedValues.add(false);
			valueSet.mixedValues.add(null);
			//@ts-expect-error This will become null, creating a duplicate
			valueSet.mixedValues.add(undefined);

			valueSet.bigIntValues.add(9007199254740991n);
			valueSet.bigIntValues.add(-9007199254740991n);
			valueSet.bigIntValues.add(0n);

			const serialized = serialize(valueSet);
			const deserialized = deserialize(serialized);

			expect(deserialized).toBeInstanceOf(PrimitiveValueSet);

			// Test mixed values
			expect(deserialized.mixedValues.has("string")).toBe(true);
			expect(deserialized.mixedValues.has(42)).toBe(true);
			expect(deserialized.mixedValues.has(-123)).toBe(true);
			expect(deserialized.mixedValues.has(true)).toBe(true);
			expect(deserialized.mixedValues.has(false)).toBe(true);
			expect(deserialized.mixedValues.has(null)).toBe(true);
			// Note: Set will only have one null value since undefined becomes null (duplicate)
			expect(deserialized.mixedValues.size).toBe(6); // All values except undefined becomes duplicate null

			// Test BigInt values
			expect(deserialized.bigIntValues.has(9007199254740991n)).toBe(true);
			expect(deserialized.bigIntValues.has(-9007199254740991n)).toBe(true);
			expect(deserialized.bigIntValues.has(0n)).toBe(true);
		});

		test("should verify Map and Set reference equality after deserialization", () => {
			const player = new GamePlayerData("ReferenceTest", 5);
			player.addItem("Test Item", 1);
			player.addAchievement("Test Achievement");

			const serialized = serialize(player);
			const deserialized = deserialize(serialized);

			// Verify that deserialized Maps and Sets are proper instances
			expect(deserialized.inventory).toBeInstanceOf(Map);
			expect(deserialized.achievements).toBeInstanceOf(Set);
			expect(deserialized.friends).toBeInstanceOf(Map);
			expect(deserialized.visitedZones).toBeInstanceOf(Set);

			// Verify that we can call Map and Set methods
			expect(typeof deserialized.inventory.get).toBe("function");
			expect(typeof deserialized.inventory.set).toBe("function");
			expect(typeof deserialized.inventory.has).toBe("function");
			expect(typeof deserialized.inventory.delete).toBe("function");

			expect(typeof deserialized.achievements.add).toBe("function");
			expect(typeof deserialized.achievements.has).toBe("function");
			expect(typeof deserialized.achievements.delete).toBe("function");

			// Verify that modifications work on deserialized objects
			deserialized.inventory.set("New Item", 3);
			expect(deserialized.inventory.get("New Item")).toBe(3);

			deserialized.achievements.add("New Achievement");
			expect(deserialized.achievements.has("New Achievement")).toBe(true);
		});
	});
});
