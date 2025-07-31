type SugarBoxVariables<
	TStructure extends Record<string, unknown> = Record<string, unknown>,
> = TStructure;

type SugarBoxConfig = {
	/** Maximum number of individual states that will be stored before old ones get merged into each other */
	maxStateCount: number;
};

export type { SugarBoxVariables, SugarBoxConfig };
