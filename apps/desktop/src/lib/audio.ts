export function rmsFromTimeDomain(time: Uint8Array): number {
  if (time.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < time.length; i++) {
    const sample = (time[i] - 128) / 128;
    sum += sample * sample;
  }
  return Math.sqrt(sum / time.length);
}

export function speechEnergy(rms: number): number {
  if (!Number.isFinite(rms) || rms <= 0.008) return 0;
  return Math.min(1, (rms - 0.008) / 0.16);
}

export function fillBands(freq: Uint8Array, bins: Float32Array): void {
  const span = Math.max(1, Math.floor(freq.length / bins.length));
  for (let i = 0; i < bins.length; i++) {
    let total = 0;
    const start = i * span;
    for (let j = start; j < start + span && j < freq.length; j++) total += freq[j];
    bins[i] = Math.min(1, total / span / 170);
  }
}

export function smoothToward(current: number, target: number, amount: number): number {
  const k = Math.min(1, Math.max(0, amount));
  return current + (target - current) * k;
}
