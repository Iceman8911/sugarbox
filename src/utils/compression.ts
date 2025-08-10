const isStringJsonObjectOrCompressedString = (
	stringifiedValue: string,
): "json" | "compressed" => {
	return stringifiedValue.startsWith('{"') ? "json" : "compressed";
};

export { isStringJsonObjectOrCompressedString };
