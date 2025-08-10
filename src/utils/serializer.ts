import type {
	TransformedBigInt,
	TransformedCustomClass,
	TransformedDataType,
	TransformedDate,
	TransformedMap,
	TransformedRegex,
	TransformedSet,
} from "../types/serializer";
import type { SugarBoxCompatibleClassConstructor } from "../types/userland-classes";

type ClassConstructor = SugarBoxCompatibleClassConstructor<unknown, unknown>;

// Custom serializer that uses JSON with custom class support
const classRegistry = new Map<string, ClassConstructor>();

// Register a custom class for serialization
export function registerClass(classConstructor: ClassConstructor): void {
	classRegistry.set(classConstructor.__classId, classConstructor);
}

// Custom serializer that handles classes manually using JSON
export function stringify(obj: unknown): string {
	// Transform the object to handle custom classes
	const transformed = transformForSerialization(obj);

	return JSON.stringify(transformed);
}

// biome-ignore lint/suspicious/noExplicitAny: <Impractical to specify all types here>
export function parse(str: string): any {
	const parsed = JSON.parse(str);

	return transformFromSerialization(parsed);
}

function transformForSerialization(
	obj: unknown,
): TransformedDataType | unknown {
	if (obj === null || obj === undefined) {
		return obj;
	}

	if (Array.isArray(obj)) {
		return obj.map(transformForSerialization);
	}

	if (typeof obj === "object") {
		// Check if this is a custom class instance
		for (const [classId, ClassConstructor] of classRegistry) {
			if (obj instanceof ClassConstructor) {
				const transformedClass: TransformedCustomClass = {
					__classId: classId,
					__data: obj.__toJSON(),
					__type: "customClass",
				};

				return transformedClass;
			}
		}

		// Handle Date objects
		if (obj instanceof Date) {
			const transformedDate: TransformedDate = {
				__data: obj.getTime(),
				__type: "date",
			};

			return transformedDate;
		}

		// Handle Set objects
		if (obj instanceof Set) {
			const transformedSet: TransformedSet = {
				__data: Array.from(obj).map(transformForSerialization),
				__type: "set",
			};

			return transformedSet;
		}

		// Handle Map objects
		if (obj instanceof Map) {
			const transformedMap: TransformedMap = {
				__type: "map",
				__data: Array.from(obj.entries()).map(([k, v]) => [
					transformForSerialization(k),
					transformForSerialization(v),
				]),
			};

			return transformedMap;
		}

		// Handle RegExp objects
		if (obj instanceof RegExp) {
			const transformedRegex: TransformedRegex = {
				__flags: obj.flags,
				__source: obj.source,
				__type: "regex",
			};

			return transformedRegex;
		}

		// Handle regular objects
		const result: Record<string, unknown> = {};

		for (const [key, value] of Object.entries(obj)) {
			result[key] = transformForSerialization(value);
		}

		return result;
	}

	// Handle BigInt
	if (typeof obj === "bigint") {
		const transformedBigInt: TransformedBigInt = {
			__data: `${obj}`,
			__type: "bigint",
		};

		return transformedBigInt;
	}

	return obj;
}

function transformFromSerialization(obj: unknown): unknown {
	if (obj === null || obj === undefined) {
		return obj;
	}

	if (Array.isArray(obj)) {
		return obj.map(transformFromSerialization);
	}

	const transfromedDataTypeCommonKey: keyof TransformedDataType = "__type";

	if (typeof obj === "object") {
		if (transfromedDataTypeCommonKey in obj) {
			//@ts-expect-error So we have typechecking on the possible discriminated union
			const objToTransform: TransformedDataType = obj;

			// Check if this is a serialized custom class
			if (objToTransform.__type === "customClass") {
				const classConstructor = classRegistry.get(objToTransform.__classId);

				return classConstructor?.__fromJSON(objToTransform.__data);
			}

			// Check if this is a serialized Date
			if (objToTransform.__type === "date") {
				return new Date(objToTransform.__data);
			}

			// Check if this is a serialized Set
			if (objToTransform.__type === "set") {
				return new Set(objToTransform.__data.map(transformFromSerialization));
			}

			// Check if this is a serialized Map
			if (objToTransform.__type === "map") {
				return new Map(
					objToTransform.__data.map(([k, v]) => [
						transformFromSerialization(k),
						transformFromSerialization(v),
					]),
				);
			}

			// Check if this is a serialized RegExp
			if (objToTransform.__type === "regex") {
				return new RegExp(objToTransform.__source, objToTransform.__flags);
			}

			// Check if this is a serialized BigInt
			if (objToTransform.__type === "bigint") {
				return BigInt(objToTransform.__data);
			}
		} else {
			// Handle regular objects
			const result: Record<string, unknown> = {};

			for (const [key, value] of Object.entries(obj)) {
				result[key] = transformFromSerialization(value);
			}
			return result;
		}
	}

	return obj;
}

export { stringify as serialize, parse as deserialize };
