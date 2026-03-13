export interface RngResult {
  readonly seed: number;
  readonly value: number;
}

const A = 1664525;
const C = 1013904223;
const M = 0x100000000;

export function nextRng(seed: number): RngResult {
  const next = (A * seed + C) >>> 0;
  return {
    seed: next,
    value: next / M
  };
}

export function chooseIndex(seed: number, length: number): { seed: number; index: number } {
  const result = nextRng(seed);
  const index = Math.floor(result.value * length);
  return {
    seed: result.seed,
    index: Math.max(0, Math.min(length - 1, index))
  };
}
