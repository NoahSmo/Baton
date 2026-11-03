/** 0.004 → "<$0.01", 1.5 → "$1.50". One format for every cost shown. */
export function formatUsd(usd: number): string {
  return usd > 0 && usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`
}
