# sugarbox

Loosely based off *Twine SugarCube*, **Sugarbox** is a lightweight (~4.5KB minified and gzipped), headless, unopinionated, and framework-agnostic library to help with developing web-based interactive fiction.

## Features
- Easy handling for passages and game state (variables, history, navigation)
- Comprehensive save/load system with compression and migration support
- Deterministic pseudorandom number generation (PRNG) for reproducible gameplay
- Custom class serialization support for complex game objects
- Achievements and settings persistence separate from save data
- State history with undo/redo functionality
- Headless design with no UI restrictions
- Event-driven architecture for state and passage changes
- TypeScript-first with full type safety
- Framework-agnostic (works with React, Vue, vanilla JS, etc.)

## Installation

```bash
npm install sugarbox
# or
bun install sugarbox
# or
yarn add sugarbox
```

## Usage

```typescript
import { SugarboxEngine } from "sugarbox";

// Passages must be objects with a unique name and the passage data
const startPassage = { name: "Test Passage Name", passage: "Lorem Ipsum Dolomet" };
const otherPassages = [
  { name: "Other Passage Name", passage: "More Dummy Text" }
];

const engine = await SugarboxEngine.init({
  name: "Test",
  variables: { name: "Dave", inventory: { gold: 123, gems: 12 } },
  startPassage,
  otherPassages,
  // Optionally, you can pass config, classes, achievements, settings, migrations, etc.
});

engine.setVars((state) => {
  state.name = "Sheep";
  state.inventory.gems = 21;
});

engine.navigateTo("Other Passage Name");
```

See below for more on initialization options and configuration.

## Passages

A passage can be anything from a string like markdown or html syntax, to objects like JSX components; just be consistent and pick a format. The only data the engine requires are the passage's id / name (which must be unique across all passages that will be added) and the data for the actual passage. Note that, the engine does not handle any rendering so it's up to you to decide how the data should be rendered.

Passages can be passed to the engine during initialization via `startPassage` and `otherPassages` properties in the parameter object. The former denotes the initial passage to start on, while the latter takes an array of any other passages; it's advised to pass all critically needed passages here. Other passages can still be added via the engine's method, `addPassages()` which takes an array of passage objects.

The current passage and it's id / name can be obtained via the getters, `passage` and `passageId`.

### Navigation

To move forward and access different passages, the `navigateTo(passageId: string)` method should be used.

Upon navigation, a custom `:passageChange` event will be fired by the engine, and can be listened to via the `on()` method. This event contains the passage data for both the old and new passages.

## Engine Initialization Options

The `SugarboxEngine.init` method accepts an object with the following properties:

- `name` (string): Unique name for your engine instance (used for saves, etc).
- `variables` (object | function): The initial state variables. Can be a static object or a function that receives the engine instance and returns the initial state.
- `startPassage` (object): The starting passage, must have a unique `name` and `passage` data.
- `otherPassages` (array): Additional passages to preload.
- `config` (object, optional): Configuration options (see below).
- `classes` (array, optional): Custom classes to register for serialization.
- `achievements` (object, optional): Initial achievements data.
- `settings` (object, optional): Initial settings data.
- `migrations` (array, optional): Save migration handlers.

Example with static variables:
```typescript
const engine = await SugarboxEngine.init({
  name: "MyStory",
  variables: {
    player: { name: "Hero", level: 1 },
    gold: 100
  },
  startPassage: { name: "Intro", passage: "Welcome!" },
  otherPassages: [ ... ],
  config: { maxStateCount: 50, saveSlots: 10 },
  classes: [MyCustomClass],
  achievements: { foundSecret: false },
  settings: { volume: 0.5 },
  migrations: [
    {
      from: "0.1.0",
      data: {
        to: "0.2.0",
        migrater: (oldState) => ({ ...oldState, newVar: 0 })
      }
    }
  ]
});
```

### Dynamic Initial State

You can also provide a function that generates the initial state dynamically. This is useful when you need access to the engine instance for random number generation or other engine properties:

```typescript
const engine = await SugarboxEngine.init({
  name: "MyStory",
  variables: (engine) => ({
    player: {
      name: "Hero",
      level: 1,
      startingGold: Math.floor(engine.random * 100) + 50 // Random 50-150
    },
    gameId: Math.floor(engine.random * 89999) + 10000, // Random 10000-99999
    engineName: engine.name,
  }),
  startPassage: { name: "Intro", passage: "Welcome!" },
});
```

**Important Notes:**
- The function receives the fully initialized engine instance
- You can safely access `engine.random`, `engine.name`, `engine.passageId`, etc.
- This approach is completely safe from circular dependencies as the engine is fully constructed before the function is called

### Helper Functions for Random Operations

Since `engine.random` returns a float between 0 and 1, you'll often want to create helper functions for common random operations. Here are some examples you can add to your project:

```typescript
// Random integer between min and max (inclusive)
const randomInt = (engine: SugarboxEngine, min: number, max: number) =>
  Math.floor(engine.random * (max - min + 1)) + min;

// Random array element
const randomPick = <T>(engine: SugarboxEngine, array: T[]): T =>
  array[Math.floor(engine.random * array.length)];

// Random boolean with optional probability
const randomBool = (engine: SugarboxEngine, probability = 0.5) =>
  engine.random < probability;

// Usage in dynamic initial state
const dynamicVariables = (engine) => ({
  startingGold: randomInt(engine, 50, 150),
  startingClass: randomPick(engine, ["Warrior", "Mage", "Rogue"]),
  hasLuck: randomBool(engine, 0.1), // 10% chance
});
```

**Note:** These are not built-in functions - they're helper utilities you can create in your own project to work with the engine's PRNG.
```

## Configuration Options

The `config` object lets you control engine behavior. All options are optional; defaults are shown below.

- `maxStateCount` (number): Maximum number of state snapshots to keep before merging old ones.
  *Default: 100*
- `stateMergeCount` (number): Number of snapshots to merge when the state history fills up.
  *Default: 1*
- `saveSlots` (number): Maximum number of save slots.
  *Default: 20*
- `saveVersion` (string): Semantic version string to tag new saves with (format: "major.minor.patch").
  *Default: "0.0.1"*
- `saveCompatibilityMode` ("strict" | "liberal"): How strictly to check save version compatibility.
  *Default: "strict"*
- `autoSave` ("passage" | "state" | false): Auto-save on passage navigation or state change.
  *Default: false*
- `loadOnStart` (boolean): Load the most recent save automatically on engine init.
  *Default: true*
- `compressSave` (boolean): Whether to compress save data using gzip.
  *Default: true*
- `initialSeed` (number): Initial PRNG seed (0 to 2^32-1).
  *Default: random*
- `regenSeed` ("passage" | "eachCall" | false): When to regenerate the PRNG seed.
  *Default: "passage"*
- `eventOptimization` ("accuracy" | "performance"): Controls state change event performance vs accuracy trade-offs.
  *Default: "accuracy"*
- `cache` (adapter): Optional cache adapter for state snapshots.
- `persistence` (adapter): Optional persistence adapter for saving/loading.

Example:
```typescript
config: {
  maxStateCount: 50,
  stateMergeCount: 2,
  saveSlots: 5,
  saveVersion: "1.0.0",
  saveCompatibilityMode: "liberal",
  autoSave: "state",
  loadOnStart: false,
  initialSeed: 12345,
  eventOptimization: "performance",
  regenSeed: "eachCall",
  cache: myCacheAdapter,
  persistence: myPersistenceAdapter
}
```

## How the "State" Works

- The	`initial state` is object of variables that are passed to the engine when it is initialized. It is immutable.
- A `snapshot` represents any changes made to the state afterwards for every point in passage navigation. As such, it only contains the changes made to the state since the last snapshot / initial state and avoids the ned to reclone the entire state object every time navigation occurs.
	- Snapshots are stored in an array of customizable length (also known as the `state history`), via the `config` option when initializing the engine. During passage navigation, the engine will create a new snapshot (which is essentially an empty object at the start) push it to the array. When the array is nearing capacity, older snapshots will be merged into a single snapshot to create space. The amount of snapshots to combine when this occurs can be customized via the `config` object.
- A `state` is the combination of the intial state and all the snapshots, up until the most recent one. It is effectively the current state of variables in the story.
	- It value is derived on demand, unless a cache adapter is explictly passed into the engine's `config` (in this case, the value is cached when safe to do so), starts by looping through the snapshots, from the earliest till the most recent, applying the property changes from them.
		- A property from a snapshot is only used if it is present (i.e you try setting it) and not `undefined`. If you want to denote that a property should not exist but the engine should keep the property, set it to `null`.

### Modifying the state
To modify the state, you can use the `setVars` method on the engine instance. This method takes a callback function that receives the current state and allows you to modify it. The changes made in this callback will be recorded in a new snapshot.

To change specific properties:

```typescript
engine.setVars((state) => {
	state.name = "Sheep";
});
```

To directly set the state to a given object:

```typescript
engine.setVars(_=>{
	return { name: "Sheep", inventory: { gems: 21 } }
})
```

Do note that in the latter case, if the previous state was something similar to:

```typescript
{ name: "Dave", inventory: { gold: 123, gems: 12 }, others: { hoursPlayed: 1.5 } }
```

Top-level properties (e.g `others`) will still retain their values unless explicitly set to `null`

Modifying the state will cause the engine to fire a custom `:stateChange` event that can be listened to via the `on()` method of the engine. This event contains the complete state before and after the change in `oldState` and `newState` properties respectively. For example, if the previous state was `{ name: "Dave", inventory: { gold: 123 } }` and you change the name to "Sheep", the event detail will contain both the complete previous state and the complete new state `{ name: "Sheep", inventory: { gold: 123 } }`.

### State History

Every possible state at each index in the history is a `moment`

A getter `index` on the engine returns the current position in state history, where `0` represents the very beginning moment (i.e right after engine initialization). The methods, `forward(steps?: number)` and `backward(steps?: number)` can be used to move through the existing history, and have an optional argument (defaulting to `1`) that determines how many steps forward or backward to move to in the state history. Note that they do nothing if there is no future / past moment.

Navigating to a new passage (which moves the index forward) whilist backwards in the state history, will overwrite whatever moment existed at that index.

## Custom Classes

All custom classes that are stored in the story's state must conform to the type interfaces; `SugarBoxCompatibleClassInstance` and `SugarBoxCompatibleClassConstructor`, and also have the class constructor itself registered in the engine via `registerClasses(Class1, Class2, ..., ClassN)`. This is so that they can be cloned and serialized.

### Supported Data Types for Serialization

The engine's serialization system supports the following data types in your story variables:

**✅ Fully Supported:**
- Primitives: `number`, `string`, `boolean`, `null`, `undefined`
- `Array`
- Plain `Object`
- Custom classes (with `__toJSON`/`__fromJSON` methods)
- `Date` objects
- `Set` objects
- `Map` objects
- `RegExp` objects
- `BigInt`

**❌ Not Supported:**
- `Symbol`
- `Function`
- `WeakMap` / `WeakSet`
- `TypedArray` (`Int8Array`, `Uint8Array`, etc.)
- `ArrayBuffer` / `SharedArrayBuffer`
- `Error` objects
- `URL` objects
- Circular references

If you need to store unsupported types, consider converting them to supported formats (e.g., functions to strings, or Error objects to plain objects with error details).

#### Handling Recursive Objects

For objects with circular references (e.g., parent-child relationships), break the circular reference during serialization and reconstruct it during deserialization:

```typescript
interface InventoryData {
  id: string;
  items: ItemData[];
}

interface ItemData {
  name: string;
  // Note: no inventory reference to avoid circular dependency
}

class Inventory implements SugarBoxCompatibleClassInstance<InventoryData> {
  static readonly classId = "Inventory";

  id: string;
  items: Item[] = [];

  constructor(id: string) {
    this.id = id;
  }

  toJSON(): InventoryData {
    return {
      id: this.id,
      items: this.items.map(item => item.toJSON())
    };
  }

  static fromJSON(data: InventoryData): Inventory {
    const inventory = new Inventory(data.id);
    // Reconstruct items and re-establish parent relationships
    inventory.items = data.items.map(itemData =>
      Item.fromJSONWithParent(itemData, inventory)
    );
    return inventory;
  }
}

class Item implements SugarBoxCompatibleClassInstance<ItemData> {
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

engine.registerClasses(Inventory);
```

Example:
```typescript
class Player {
  // ... implement toJSON, static fromJSON, static classId ...
}
engine.registerClasses(Player);
```
Or, if using `init`:
```typescript
const engine = await SugarboxEngine.init({
  // ...
  classes: [Player]
});
```

## Achievements and Settings

Sugarbox supports persistent achievements and settings, which are not tied to a specific save slot.

**Note:** Achievements and settings are not compressed at the moment.

To update achievements:
```typescript
await engine.setAchievements((ach) => {
  ach.foundSecret = true;
});
```

To update settings:
```typescript
await engine.setSettings((settings) => {
  settings.volume = 0.8;
});
```

Both methods accept a callback that can mutate or return a new object. The data will be persisted if a persistence adapter is configured.

## Cache Adapter

For large or complex stories, recalculating state from all snapshots can be expensive. You can provide a cache adapter to speed up state fetching:

```typescript
const cacheAdapter = {
  set(key, data) { /* ... */ },
  get(key) { /* ... */ },
  delete(key) { /* ... */ },
  clear() { /* ... */ }
};
const engine = await SugarboxEngine.init({
  // ...
  config: { cache: cacheAdapter }
});
```

## Save Migration

If you change your story's state structure, you can register migration functions to update old saves:

```typescript
engine.registerMigrators(
  {
    from: "0.1.0",
    data: {
      to: "0.2.0",
      migrater: (oldState) => ({ ...oldState, newField: 0 })
    }
  },
  {
    from: "0.2.0",
    data: {
      to: "0.3.0",
      migrater: (oldState) => ({ ...oldState, anotherField: true })
    }
  }
);
```
Or pass them to `init` via the `migrations` array.

## Saving and Loading

Sugarbox provides two main mechanisms for saving and loading game progress: using storage-backed **save slots** for quick, persistent saves, and **exporting/importing** for manual backups or transferring saves between devices.

### Persistence Configuration

> **Note:** Save data is compressed by default. The engine will auto-detect and decompress as needed when loading, so you do not need to handle this manually.

To use save slots, you must first provide a `persistence` adapter in the engine's configuration. This adapter is responsible for the actual reading and writing of save data to a storage medium like `localStorage`, `sessionStorage`, or even a remote database.

A simple adapter using `localStorage` might look like this:

```typescript
// persistence-adapter.ts
export function createPersistenceAdapter(storage = window.localStorage) {
	return {
		get: (key) => Promise.resolve(storage.getItem(key)),
		set: (key, value) => Promise.resolve(storage.setItem(key, value)),
		delete: (key) => Promise.resolve(storage.removeItem(key)),
		keys: () => Promise.resolve(Object.keys(storage)),
	};
}
```

You would then pass this into the engine during initialization:

```typescript
import { SugarboxEngine } from "sugarbox";
import { createPersistenceAdapter } from "./persistence-adapter";

const engine = await SugarboxEngine.init({
	// ...other options
	config: {
		persistence: createPersistenceAdapter(),
	},
});
```

## Save Compression

Sugarbox supports transparent compression and decompression of save data to minimize storage usage. By default, all save data (including save slots and exported saves) is compressed using the `gzip` format.

### How It Works

- **Compression**: When saving (either to a slot or exporting), the engine serializes the game state and, if `compressSave` is enabled in the config (default: `true`), compresses the string before storing it.
- **Decompression**: When loading, the engine automatically detects if the data is compressed and decompresses it as needed. This is seamless for both save slots and imported/exported saves.
- **Format**: The default compression format is `gzip`, chosen for its wide support and efficiency.

### Configuration

You can control compression behavior via the `compressSave` option in the engine config:

```typescript
const engine = await SugarboxEngine.init({
  // ...
  config: {
    compressSave: true, // Enable (default) or disable save compression
  }
});
```

- Setting `compressSave: false` will store all saves as plain (uncompressed) JSON strings.

### Advanced

- Compression and decompression are handled internally using the [`@zalari/string-compression-utils`](https://www.npmjs.com/package/@zalari/string-compression-utils) package.
- The engine will always auto-detect and decompress save data, so you can safely mix compressed and uncompressed saves.
- Exported save strings are also compressed if `compressSave` is enabled.

#### Example: Exporting and Importing with Compression

```typescript
// Export (compressed by default)
const exportData = await engine.saveToExport();

// Import (auto-detects compression)
await engine.loadFromExport(exportData);
```

---

### Save Slots

Save slots are numbered locations where the game state can be stored. A maximum amount can be specified in the engine's `config` (the default is 20)

* `async saveToSaveSlot(saveSlot?: number)`: Asynchronously saves the current game state to a specific slot number. If no slot is provided, it will use the autosave slot.

    ```typescript
    // Save the game to slot 1
    await engine.saveToSaveSlot(1);
    ```

* `async loadFromSaveSlot(saveSlot?: number)`: Asynchronously loads a game state from a specific slot, overwriting the current state and history.

    ```typescript
    // Load the game from slot 1
    await engine.loadFromSaveSlot(1);
    ```

* `async *getSaves()`: A generator function that yields information about all the saves that are currently stored, which you can use to build a "Load Game" screen.

    ```typescript
    const savesList = document.getElementById("saves-list");

    for await (const save of engine.getSaves()) {
    	const li = document.createElement("li");

    	li.textContent = `Slot ${save.slot}: Saved on ${save.savedOn.toLocaleString()}`;

    	savesList.appendChild(li);
    }
    ```

* `async deleteSaveSlot(saveSlot?: number)`: Deletes the save data for a specific slot. If no slot is provided, it deletes the autosave slot.

    ```typescript
    // Delete save slot 1
    await engine.deleteSaveSlot(1);

    // Delete autosave slot
    await engine.deleteSaveSlot();
    ```

* `async deleteAllSaveSlots()`: Deletes all save slots including the autosave slot.

    ```typescript
    // Delete all saves
    await engine.deleteAllSaveSlots();
    ```

* `loadSaveFromData(save)`: Loads a save from a save data object (typically obtained from `getSaves()`). This is a synchronous method that directly loads the save without persistence operations.

    ```typescript
    // Load a specific save from the saves list
    for await (const saveInfo of engine.getSaves()) {
        if (saveInfo.type === "normal" && saveInfo.slot === 1) {
            engine.loadSaveFromData(saveInfo.data);
            break;
        }
    }
    ```

### Exporting and Importing

> **Note:** Exported save strings are compressed by default if `compressSave` is enabled. The engine will auto-detect and decompress imported data.

This method allows you to get a serialized string of the entire game state, which the player can copy and save manually, or have downloaded for use later.

* `async saveToExport()`: Returns a promise that resolves with a serialized string representing the current game state.

    ```typescript
    const exportData = await engine.saveToExport();

    // You could now display this string in a textarea for the user to copy or download it.
    navigator.clipboard.writeText(exportData);

    alert("Save data copied to clipboard!");
    ```

* `async loadFromExport(serializedData: string)`: Loads a game state from a serialized string.

    ```typescript
    const importData = prompt("Please paste your save data:");

    if (importData) {
    	try {
    		await engine.loadFromExport(importData);

    		alert("Game loaded successfully!");
    	} catch (e) {
    		alert("Failed to load save. The data may be corrupt.");
    	}
    }
    ```

### Save and Load Events

For building responsive UIs, the engine fires events during the save/load lifecycle. You can listen to these using the `on()` method. This is useful for showing loading indicators, disabling buttons, or displaying success/error messages.

The available events are:

* `:saveStart`: Fired just before a save operation begins. The event `detail` is null.
* `:saveEnd`: Fired after a save operation completes. The `detail` contains a discriminated union denoting whether the operation was successful or not. If not successful, an error is also returned.
* `:loadStart`: Fired just before a load operation begins. The `detail` is null.
* `:loadEnd`: Fired after a load operation completes. The `detail` contains a discriminated union denoting whether the operation was successful or not. If not successful, an error is also returned
* `:migrationStart`: Fired just before a save migration operation begins. The `detail` contains the current save version that is to be migrated.
* `:migrationEnd`: Fired after a save migration operation completes. The `detail` contains a discriminated union denoting whether the operation was successful or not, as well as the intial and final save versions. If not successful, an error is also returned.

## Events

Sugarbox emits several custom events you can listen to with `on()`:

- `:passageChange` — Fired when the passage changes.
- `:stateChange` — Fired when the state changes.
- `:saveStart` / `:saveEnd` — Fired before/after a save.
- `:loadStart` / `:loadEnd` — Fired before/after a load.
- `:migrationStart` / `:migrationEnd` — Fired before/after save migration operations.

Examples:
```typescript
engine.on(":passageChange", (e) => {
  console.log("Passage changed!", e.detail);
});

engine.on(":stateChange", (e) => {
  console.log("State changed!");
  console.log("Previous state:", e.detail.oldState);
  console.log("New state:", e.detail.newState);

  // Example: Track specific variable changes
  if (e.detail.oldState.playerHealth !== e.detail.newState.playerHealth) {
    console.log(`Health changed from ${e.detail.oldState.playerHealth} to ${e.detail.newState.playerHealth}`);
  }
});
```

## Performance Considerations

### State Change Event Optimization

The `:stateChange` event system is designed to be efficient, but with large state objects or high-frequency updates, you may want to optimize performance using the `eventOptimization` configuration.

#### When to Use Performance Mode

Consider using `eventOptimization: "performance"` when:

- Your state objects are large
- You have high-frequency state changes
- You're experiencing performance issues with state updates
- Event data integrity is less critical than performance

#### When to Use Accuracy Mode (Default)

Use `eventOptimization: "accuracy"` when:

- You need guaranteed separation between `oldState` and `newState` objects
- Your application logic depends on precise event data
- Performance is not a primary concern
- State objects are reasonably sized / small

#### Example Configuration

```typescript
// For performance-critical applications
const engine = await SugarboxEngine.init({
  // ...other options
  config: {
    eventOptimization: "performance",
    maxStateCount: 50, // Reduce memory usage
    cache: yourCacheAdapter, // Enable caching
  }
});

// For data-critical applications
const engine = await SugarboxEngine.init({
  // ...other options
  config: {
    eventOptimization: "accuracy", // Default
    // Other settings as needed
  }
});
```

## API Reference

Here's a quick overview of the main methods and properties:

| Method / Getter         | Description |
|------------------------ |------------|
| `vars`                  | Get current state variables (readonly) |
| `setVars(fn)`           | Update state variables (immer-style) |
| `passageId`             | Get current passage id |
| `passage`               | Get current passage data |
| `index`                 | Get current position in state history |
| `forward(steps?)`       | Move forward in state history |
| `backward(steps?)`      | Move backward in state history |
| `addPassage(passageId, passageData)` | Add a single passage |
| `addPassages(passages)` | Add multiple passages |
| `navigateTo(id)`        | Move to a passage |
| `reset()`               | Reset engine to initial state, clearing history and restoring all variables |
| `on(event, fn)`         | Listen for an event |
| `off(event, fn)`        | Remove event listener |
| `registerClasses(...c)` | Register custom classes for serialization |
| `registerMigrators(...m)` | Register save migration handlers |
| `saveToSaveSlot(slot?)` | Save to a slot (async) |
| `loadFromSaveSlot(slot?)` | Load from a slot (async) |
| `deleteSaveSlot(slot?)` | Delete a save slot (async) |
| `deleteAllSaveSlots()`  | Delete all save slots (async) |
| `loadRecentSave()`      | Load the most recent save (async) |
| `loadSaveFromData(save)` | Load save from save data object |
| `getSaves()`            | Async generator for all saves |
| `saveToExport()`        | Export save as string (async) |
| `loadFromExport(str)`   | Load save from string (async) |
| `achievements`          | Get achievements (readonly) |
| `setAchievements(fn)`   | Update achievements (async) |
| `settings`              | Get settings (readonly) |
| `setSettings(fn)`       | Update settings (async) |
| `random`                | Get a deterministic random number |
| `name`                  | Engine name (readonly) |

## Random Number Generation (PRNG)

Sugarbox includes a built-in pseudorandom number generator (PRNG) that provides deterministic, reproducible random numbers for your interactive fiction. This is crucial for ensuring that random events can be consistent across save/load cycles and for debugging purposes.

### Basic Usage

Access random numbers through the `random` getter on the engine:

```typescript
const engine = await SugarboxEngine.init({
	// ...your configuration
});

// Get a random number between 0 and 1 (inclusive)
const randomValue = engine.random;

// Use it for game mechanics
if (engine.random < 0.5) {
	console.log("Heads!");
} else {
	console.log("Tails!");
}

// Random array selection
const outcomes = ["success", "failure", "critical"];
const result = outcomes[Math.floor(engine.random * outcomes.length)];
```

### Seed Configuration

The PRNG can be configured during engine initialization:

```typescript
const engine = await SugarboxEngine.init({
	// ...other options
	config: {
		// Set a specific seed for deterministic behavior
		initialSeed: 12345,

		// Control when the seed regenerates (see below)
		regenSeed: "passage", // "passage" | "eachCall" | false
	},
});
```

**Note**: If no `initialSeed` is provided, a random seed will be generated automatically.

### Seed Regeneration Modes

The `regenSeed` configuration controls when and how the random seed changes:

#### `"passage"` (default)
The seed regenerates every time you navigate to a new passage:

```typescript
const engine = await SugarboxEngine.init({
	config: { regenSeed: "passage" },
	// ...other options
});

console.log(engine.random); // e.g., 0.123
console.log(engine.random); // e.g., 0.123 (same seed)

engine.navigateTo("NewPassage");

console.log(engine.random); // e.g., 0.789 (new seed after navigation)
```

#### `"eachCall"`
The seed regenerates after every call to `engine.random`:

```typescript
const engine = await SugarboxEngine.init({
	config: { regenSeed: "eachCall" },
	// ...other options
});

console.log(engine.random); // e.g., 0.123
console.log(engine.random); // e.g., 0.789 (different seed)
console.log(engine.random); // e.g., 0.345 (different seed again)
```

#### `false`
The seed never regenerates, so the same value will be returned every time you access `engine.random`:

```typescript
const engine = await SugarboxEngine.init({
	config: {
		regenSeed: false,
		initialSeed: 42, // Fixed seed
	},
	// ...other options
});

// Will always produce the same sequence
console.log(engine.random); // Always 0.123
console.log(engine.random); // Always 0.123
```

### Save/Load Behavior

The PRNG state is automatically preserved when saving and loading:

```typescript
const engine = await SugarboxEngine.init({
	config: {
		regenSeed: false,
		persistence: yourPersistenceAdapter,
	},
	// ...other options
});

// Generate some random numbers
engine.random; // 0.123
engine.random; // 0.456

// Save the game
await engine.saveToSaveSlot(1);

// Generate more numbers
engine.random; // 0.789
engine.random; // 0.321

// Load the save
await engine.loadFromSaveSlot(1);

// Continue from where we saved
engine.random; // 0.789 (same as after the save)
engine.random; // 0.321 (same sequence continues)
```

This ensures that random events remain consistent across save/load cycles.

### Note

1. **Combine with game state**: Store random outcomes in your game state rather than recalculating them:

```typescript
// Good: Store the result
engine.setVars((state) => {
	if (!state.battleResult) {
		state.battleResult = engine.random > 0.5 ? "victory" : "defeat";
	}
});

// Avoid: Recalculating on every access
const getBattleResult = () => engine.random > 0.5 ? "victory" : "defeat";
```

## Contributing

Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines.

## License

MIT

---

## TypeScript Support

Sugarbox is written in TypeScript and provides full type definitions for all public APIs. Using TypeScript is highly recommended for the best experience.

### Exported Types

The library exports several useful types for TypeScript users:

```typescript
import {
  SugarboxEngine,
  type SugarBoxConfig,
  type SugarBoxCompatibleClassInstance,
  type SugarBoxCompatibleClassConstructorCheck,
  type SugarBoxAnyKey,
  type SugarBoxPersistenceAdapter,
  type SugarBoxCacheAdapter
} from "sugarbox";

// Main configuration type
const config: SugarBoxConfig = {
  maxStateCount: 100,
  saveSlots: 10,
  // ... other options
};

// Engine instance is fully typed
const engine = await SugarboxEngine.init({
  name: "MyGame",
  startPassage: { name: "intro", passage: "Welcome!" },
  otherPassages: [],
  variables: { score: 0 },
  config
});

// Variables are type-safe
engine.setVars((state) => {
  state.score += 10; // TypeScript knows 'score' exists and is a number
  // state.nonExistent = 5; // This would be a TypeScript error
});
```

For custom classes, implement the required interfaces:

```typescript
import type {
  SugarBoxCompatibleClassInstance,
  SugarBoxCompatibleClassConstructorCheck
} from "sugarbox";

interface SerializedPlayer {
  name: string;
  level: number;
}

class Player implements SugarBoxCompatibleClassInstance<SerializedPlayer> {
  static readonly classId = "Player";
  name: string = "Hero";
  level: number = 1;

  toJSON(): SerializedPlayer {
    return { name: this.name, level: this.level };
  }

  static fromJSON(data: SerializedPlayer): Player {
    const player = new Player();
    Object.assign(player, data);
    return player;
  }
}

// Type check for ensuring proper implementation
type PlayerCheck = SugarBoxCompatibleClassConstructorCheck<SerializedPlayer, typeof Player>;
```
