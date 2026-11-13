export type ChartEvent = { timestamp: number; label: string };

export function eventsInRange(start: number, end: number): ChartEvent[] {
  const events: ChartEvent[] = [
    { timestamp: Date.UTC(2021, 1, 12), label: "Game release" },
    { timestamp: Date.UTC(2023, 8, 23, 17), label: "#WeAreVR" },
    { timestamp: Date.UTC(2026, 0, 10, 18, 30), label: "First live event" },
  ];
  // all christmases
  for (
    let year = Math.max(2021, new Date(start).getUTCFullYear());
    year <= new Date(end).getUTCFullYear();
    year++
  ) {
    events.push({
      timestamp: Date.UTC(year, 11, 25),
      label: `Christmas ${year}`,
    });
  }
  return events
    .filter((event) => event.timestamp >= start && event.timestamp <= end)
    .sort((a, b) => a.timestamp - b.timestamp);
}
