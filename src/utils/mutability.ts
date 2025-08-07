import type { ReadonlyDeep, WritableDeep } from "type-fest";

const makeMutable = <TData>(data: TData): WritableDeep<TData> => {
	return data as WritableDeep<TData>;
};

const makeImmutable = <TData>(data: TData): ReadonlyDeep<TData> => {
	return data as ReadonlyDeep<TData>;
};

export { makeMutable, makeImmutable };
