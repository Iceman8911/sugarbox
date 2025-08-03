# Sugarbox

Loosely based off *Twine Sugarcube*, **Sugarbox** is a lightweight, headless, unopionionated, and framework-agnostic library to help with developing web-based interactive fiction.

## Features
- Easy handling for passage and game state (e.g. Variables).
- Exposes adapters for saving (both saving and compressing / decompressing save data).
- Headless and so comes with no restrictions on what the UI can be.
- Adapter support for url routing.
- Uses native events for notifying userland on ml when the passage or state changes.

## Installation

```bash
npm install sugarbox
```

## Usage

```typescript
import { SugarboxEngine } from 'sugarbox';

const engine = SugarboxEngine.init({
	name: "Test",
	passages: [["Test Passage Name", "Lorem Ipsum Dolomet"], ["Other Passage Name", "More Dummy Text"]],
	variables: { name: "Dave", inventory: { gold: 123, gems: 12 } },
});

engine.setVars((state) => {
	state.name = "Sheep";

	state.inventory.gems = 21;
});

engine.navigateTo("Other Passage Name")
```

## Custom Classes

All custom classes that are stored in the story's state must conform to the type interfaces; `SugarBoxCompatibleClassInstance` and `SugarBoxCompatibleClassConstructor`, and also have the class constructor itself registered in the engine via `<engine instance>.registerClasses(Class1, Class2)`. This is so that they can be cloned and serialized.

## Contributing

Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines.

## License

MIT
