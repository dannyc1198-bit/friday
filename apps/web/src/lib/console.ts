export interface ActivityPoint {
  label: string;
  count: number;
}

export function nextEiReport(now: Date): string {
  const day = now.getDay();
  const add = day === 1 ? 0 : (8 - day) % 7;
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + add);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

export function bucketActivity(stamps: string[], now: Date): ActivityPoint[] {
  const slots: Array<ActivityPoint & { start: number }> = [];
  let index = 11;
  while (index >= 0) {
    const tick = new Date(now.getTime() - index * 60 * 60 * 1000);
    tick.setMinutes(0, 0, 0);
    const hours = tick.getHours();
    slots.push({
      start: tick.getTime(),
      label: `${hours < 10 ? "0" : ""}${hours}:00`,
      count: 0,
    });
    index -= 1;
  }
  stamps.forEach((stamp) => {
    const ms = new Date(stamp).getTime();
    if (Number.isNaN(ms)) return;
    let match: (ActivityPoint & { start: number }) | undefined;
    slots.forEach((slot) => {
      if (ms >= slot.start) match = slot;
    });
    if (match) match.count += 1;
  });
  return slots.map((slot) => ({ label: slot.label, count: slot.count }));
}
