export const INTERNAL_LEVEL_COUNT = 54;

export function parseInternalLevelNumber(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) &&
    number >= 1 &&
    number <= INTERNAL_LEVEL_COUNT
    ? number
    : null;
}

export function getInternalLevelName(number: number) {
  return `Internal ${number.toString().padStart(2, "0")}`;
}

export function getInternalLevelAssetName(number: number) {
  const suffix = number.toString().padStart(3, "0");
  return `QWQUU${suffix}`;
}
