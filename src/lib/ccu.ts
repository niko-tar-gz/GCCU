export type Reading = { timestamp: number; ccu: number };
export const timeframes = [
	{ value: '30m', label: '30 minutes', duration: 30 * 60_000 },
	{ value: '1h', label: '1 hour', duration: 60 * 60_000 },
	{ value: '1d', label: '1 day', duration: 24 * 60 * 60_000 },
	{ value: '1w', label: '1 week', duration: 7 * 24 * 60 * 60_000 },
	{ value: '1mo', label: '1 month', duration: 30 * 24 * 60 * 60_000 },
	{ value: '1y', label: '1 year', duration: 365 * 24 * 60 * 60_000 },
	{ value: 'all', label: 'All time', duration: Infinity }
];

// Keep each bucket's extremes so spikes survive when viewing long histories.
export function downsample(records: Reading[], buckets = 600): Reading[] {
	if (records.length <= buckets * 2) return records;
	const result: Reading[] = [records[0]];
	const size = Math.ceil(records.length / buckets);
	for (let i = 0; i < records.length; i += size) {
		const bucket = records.slice(i, i + size);
		let min = bucket[0], max = bucket[0];
		for (const point of bucket) {
			if (point.ccu < min.ccu) min = point;
			if (point.ccu > max.ccu) max = point;
		}
		result.push(...(min.timestamp <= max.timestamp ? [min, max] : [max, min]));
	}
	result.push(records[records.length - 1]);
	return result;
}
