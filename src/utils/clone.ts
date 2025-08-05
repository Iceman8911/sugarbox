import { parse, stringify } from "superjson";

/** General prupose cloning helper
 */
function clone<TData>(val: TData): TData {
	try {
		return parse(stringify(val));
	} catch {
		return structuredClone(val);
	}
}

export { clone };
