import type { SugarBoxSaveVersionCompatiblityMode } from "../types/if-engine";
import type {
	SugarBoxCompatibleClassConstructorCheck,
	SugarBoxCompatibleClassInstance,
} from "../types/userland-classes";

type SemanticVersionTuple = readonly [
	major: number,
	minor: number,
	patch: number,
];

type SemanticVersionString = `${number}.${number}.${number}`;

type SemanticVersionGroup = "major" | "minor" | "patch";

/**
 * Represents a semantic version, following the format `major.minor.patch`.
 *
 * Please don't use negative numbers in the constructor :/
 */
class SemanticVersion
	implements
		SugarBoxCompatibleClassInstance<SemanticVersion, SemanticVersionString>
{
	#version: SemanticVersionTuple;

	constructor(major: number, minor: number, patch: number) {
		this.#version = [major, minor, patch];
	}

	static readonly __classId = "sugarbox-semantic-version-class";

	static __fromJSON(serializedData: SemanticVersionString): SemanticVersion {
		//@ts-expect-error Typescript can never tell with `split()`
		const semanticVersionTuple: SemanticVersionTuple = serializedData
			.split(".")
			.map((num) => Number(num));

		return new SemanticVersion(...semanticVersionTuple);
	}

	__clone(): SemanticVersion {
		return new SemanticVersion(...this.#version);
	}

	__toJSON(): SemanticVersionString {
		return this.toString();
	}

	get major(): number {
		return this.#version[0];
	}

	get minor(): number {
		return this.#version[1];
	}

	get patch(): number {
		return this.#version[2];
	}

	toString(): SemanticVersionString {
		return `${this.major}.${this.minor}.${this.patch}`;
	}

	increment(type: SemanticVersionGroup): this {
		switch (type) {
			case "major":
				this.#version = [this.major + 1, 0, 0];

				break;
			case "minor":
				this.#version = [this.major, this.minor + 1, 0];

				break;
			case "patch":
				this.#version = [this.major, this.minor, this.patch + 1];

				break;
		}

		return this;
	}

	/** Returns the difference between this version and another one */
	compare(
		other: SemanticVersion,
	): readonly [type: SemanticVersionGroup, diff: number] | readonly [null, 0] {
		for (let i = 0; i < 3; i++) {
			//@ts-expect-error These will be defined, but typescript doesn't know it
			const diff = this.#version[i] - other.#version[i];

			if (diff !== 0) {
				switch (i) {
					case 0:
						return ["major", diff];
					case 1:
						return ["minor", diff];
					case 2:
						return ["patch", diff];
				}
			}
		}

		return [null, 0];
	}

	equals(other: SemanticVersion): boolean {
		return this.compare(other)[1] === 0;
	}

	greaterThan(other: SemanticVersion): boolean {
		return this.compare(other)[1] > 0;
	}
}

// biome-ignore lint/correctness/noUnusedVariables: <Workaround for enforcing static class props>
type SemanticVersionCheck = SugarBoxCompatibleClassConstructorCheck<
	SemanticVersionString,
	typeof SemanticVersion
>;

const isSaveCompatibleWithEngine = (
	saveVersion: SemanticVersion,
	engineVersion: SemanticVersion,
	compatibilityMode: SugarBoxSaveVersionCompatiblityMode,
): "compatible" | "outdatedSave" | "newerSave" => {
	const svMajor = saveVersion.major,
		svMinor = saveVersion.minor,
		evMajor = engineVersion.major,
		evMinor = engineVersion.minor;

	if (svMajor > evMajor) {
		return "newerSave";
	}

	if (svMajor < evMajor) {
		return "outdatedSave";
	}

	switch (compatibilityMode) {
		case "strict": {
			if (svMinor > evMinor) {
				return "newerSave";
			}

			if (svMinor < evMinor) {
				return "outdatedSave";
			}

			break;
		}

		case "liberal":
			// Backwards compatible within same major
			if (svMinor > evMinor) {
				return "newerSave";
			}
	}

	return "compatible";
};

export {
	SemanticVersion as SugarBoxSemanticVersion,
	type SemanticVersionTuple as SugarBoxSemanticVersionTuple,
	type SemanticVersionString as SugarBoxSemanticVersionString,
	isSaveCompatibleWithEngine,
};
