const isStringJsonObjectOrCompressedString = (
	stringifiedValue: string,
): "json" | "compressed" =>
	stringifiedValue.startsWith('{"') ? "json" : "compressed";

export { isStringJsonObjectOrCompressedString };
