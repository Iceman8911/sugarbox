import { describe, expect, test } from "bun:test";
import { clone } from "../../src/utils/clone";
import { registerClass } from "../../src/utils/serializer";

// Define a simple custom class for testing devalue compatibility
class TestCustomClass {
	value: string;

	constructor(value: string) {
		this.value = value;
	}

	// Required for devalue serializer
	__toJSON() {
		return { value: this.value };
	}

	// Required for devalue serializer
	static __fromJSON(json: { value: string }) {
		return new TestCustomClass(json.value);
	}
	static __classId = "TestCustomClass";

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
});
