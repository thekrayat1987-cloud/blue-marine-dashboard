// USD → KD conversion. Override via env var META_USD_TO_KD if Kuwaiti dinar
// rate moves significantly (typical range 0.305–0.310).
const RATE = parseFloat(process.env.META_USD_TO_KD || "0.307");

export const USD_TO_KD = RATE;

export function usdToKd(usd: number): number {
  return usd * RATE;
}

export function kdToUsd(kd: number): number {
  return kd / RATE;
}
