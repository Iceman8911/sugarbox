import { deserialize, serialize } from "./serializer";

/** General purpose cloning helper using custom serializer for class support
 */
function clone<TData>(val: TData): TData {
	try {
		// Use our custom serializer that handles classes properly
		return deserialize(serialize(val));
	} catch {
		return structuredClone(val);
	}
}

export { clone };
