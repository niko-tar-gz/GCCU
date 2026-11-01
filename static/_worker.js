export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		if (url.pathname !== '/api/ccu') return env.ASSETS.fetch(request);
		if (request.method !== 'GET') {
			return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET' } });
		}
		const upstream = new URL('https://dashboard.biotest.dev/ccu');
		for (const key of ['from', 'to']) {
			const value = url.searchParams.get(key);
			if (value !== null) {
				if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value))) {
					return Response.json({ message: 'Invalid date' }, { status: 400 });
				}
				upstream.searchParams.set(key, value);
			}
		}
		try {
			const response = await fetch(upstream, { signal: AbortSignal.timeout(30_000) });
			if (!response.ok) throw new Error('Upstream request failed');
			return new Response(response.body, {
				headers: {
					'Content-Type': 'application/json; charset=utf-8',
					'Cache-Control': 'public, max-age=30'
				}
			});
		} catch {
			return Response.json({ message: 'Could not load CCU data' }, { status: 502 });
		}
	}
};
