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

type ClassConstructor = SugarBoxCompatibleClassConstructor<unknown>;

// Custom serializer that uses JSON with custom class support
const classRegistry = new Map<string, ClassConstructor>();

const isArray = (obj: unknown): obj is Array<unknown> => Array.isArray(obj);

// Register a custom class for serialization
export const registerClass = (
	classConstructor: ClassConstructor,
): Map<string, ClassConstructor> =>
	classRegistry.set(classConstructor.classId, classConstructor);

// Transform the object to handle custom classes and non-serializable types
const stringify = (obj: unknown): string =>
	JSON.stringify(transformForSerialization(obj));

// biome-ignore lint/suspicious/noExplicitAny: <Impractical to specify all types here>
const parse = (str: string): any => transformFromSerialization(JSON.parse(str));

const transformForSerialization = (
	obj: unknown,
): TransformedDataType | unknown => {
	const tranformObjPropsForSerialization = (obj: object) => {
		const result: Record<string, unknown> = {};

		for (const key in obj) {
			//@ts-expect-error This is not an error
			result[key] = transformForSerialization(obj[key]);
		}

		return result;
	};

	if (obj == null) {
		return obj;
	}

	if (isArray(obj)) {
		return obj.map(transformForSerialization);
	}

	if (typeof obj === "object") {
		// Check if this is a custom class instance
		for (const [classId, ClassConstructor] of classRegistry) {
			if (obj instanceof ClassConstructor) {
				const toJSONedObj = obj.toJSON();

				const transformedClass: TransformedCustomClass = {
					__classId: classId,
					__data:
						typeof toJSONedObj === "object" && toJSONedObj
							? tranformObjPropsForSerialization(toJSONedObj)
							: toJSONedObj,
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
				__data: [...obj].map(transformForSerialization),
				__type: "set",
			};

			return transformedSet;
		}

		// Handle Map objects
		if (obj instanceof Map) {
			const transformedMap: TransformedMap = {
				__type: "map",
				__data: [...obj].map(([k, v]) => [
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
		return tranformObjPropsForSerialization(obj);
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
};

const transformFromSerialization = (obj: unknown): unknown => {
	if (obj == null) {
		return obj;
	}

	if (isArray(obj)) {
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

				// Transform the data before passing to fromJSON to handle nested Maps/Sets
				const transformedData = transformFromSerialization(
					objToTransform.__data,
				);
				return classConstructor?.fromJSON(transformedData);
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

			for (const key in obj) {
				//@ts-expect-error This is not an error
				result[key] = transformFromSerialization(obj[key]);
			}

			return result;
		}
	}

	return obj;
};

export { stringify as serialize, parse as deserialize };
