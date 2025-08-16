import type { SugarBoxSaveVersionCompatiblityMode } from "../types/if-engine";

type SemanticVersionTuple = readonly [
	major: number,
	minor: number,
	patch: number,
];

/** Simple semantic versioning string */
type SemanticVersionString = `${number}.${number}.${number}`;

const getMajorAndMinorAndPatchFromVersionString = (
	versionString: SemanticVersionString,
): SemanticVersionTuple =>
	//@ts-expect-error This is a valid tuple type, but TS doesn't recognize it as such
	versionString
		.split(".")
		.map((num) => Number(num));

const isSaveCompatibleWithEngine = (
	saveVersion: SemanticVersionString,
	engineVersion: SemanticVersionString,
	compatibilityMode: SugarBoxSaveVersionCompatiblityMode,
): "compatible" | "outdatedSave" | "newerSave" => {
	const [svMajor, svMinor] =
		getMajorAndMinorAndPatchFromVersionString(saveVersion);
	const [evMajor, evMinor] =
		getMajorAndMinorAndPatchFromVersionString(engineVersion);

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
	type SemanticVersionTuple as SugarBoxSemanticVersionTuple,
	type SemanticVersionString as SugarBoxSemanticVersionString,
	isSaveCompatibleWithEngine,
};
