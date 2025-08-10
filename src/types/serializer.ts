/**
 * Represents a transformed custom class instance with its class identifier and serialized data.
 */
type TransformedCustomClass = {
	__type: "customClass";
	__classId: string;
	__data: unknown;
};

/**
 * Represents a transformed Date object with its timestamp value.
 */
type TransformedDate = { __type: "date"; __data: number };

/**
 * Represents a transformed Set object with its values as an array.
 */
type TransformedSet = { __type: "set"; __data: Array<unknown> };

/**
 * Represents a transformed Map object with its entries as an array of key-value pairs.
 */
type TransformedMap = { __type: "map"; __data: Array<[unknown, unknown]> };

/**
 * Represents a transformed RegExp object with its source pattern and flags.
 */
type TransformedRegex = { __type: "regex"; __source: string; __flags: string };

/**
 * Represents a transformed BigInt value as a string representation.
 */
type TransformedBigint = { __type: "bigint"; __data: `${bigint}` };

/**
 * Union type representing all possible transformed data types for serialization.
 */
type TransformedDataType =
	| TransformedCustomClass
	| TransformedDate
	| TransformedSet
	| TransformedMap
	| TransformedRegex
	| TransformedBigint;

export type {
	TransformedBigint as TransformedBigInt,
	TransformedCustomClass,
	TransformedDataType,
	TransformedDate,
	TransformedMap,
	TransformedRegex,
	TransformedSet,
};
