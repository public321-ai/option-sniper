// Technical indicators: SMA, RSI (Wilder), momentum (rate of change)

export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) sum += values[i];
  return sum / period;
}

/** Wilder's RSI. Returns null when there is not enough data. */
export function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  // initial average over first `period` changes
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  // Wilder smoothing for the remainder
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** Rate of change in % over `lookback` bars. */
export function momentum(closes: number[], lookback = 5): number | null {
  if (closes.length < lookback + 1) return null;
  const past = closes[closes.length - 1 - lookback];
  const now = closes[closes.length - 1];
  if (past === 0) return null;
  return ((now - past) / past) * 100;
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
