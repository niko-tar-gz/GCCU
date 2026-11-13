<script lang="ts">
    import { onMount } from "svelte";
    import ThemeToggle from "#lib/components/theme-toggle.svelte";
    import { Button } from "#lib/components/ui/button/index.js";
    import * as Select from "#lib/components/ui/select/index.js";
    import Minus from "@lucide/svelte/icons/minus";
    import Plus from "@lucide/svelte/icons/plus";
    import ChevronLeft from "@lucide/svelte/icons/chevron-left";
    import ChevronRight from "@lucide/svelte/icons/chevron-right";
    import { downsample, timeframes, type Reading } from "#lib/ccu.js";
    import { eventsInRange } from "#lib/events.js";

    let timeframe = $state("1d");
    let records = $state<Reading[]>([]);
    let current = $state<Reading | null>(null);
    let start = $state(0);
    let end = $state(1);
    let loading = $state(true);
    let message = $state("");
    let hovered = $state<Reading | null>(null);
    let custom = $state(false);
    let chartWidth = $state(1000);
    let selection = $state<{
        pointerId: number;
        anchor: number;
        cursor: number;
        clientX: number;
    } | null>(null);
    let controller: AbortController | undefined;
    const number = new Intl.NumberFormat("en-GB");
    const date = (time: number) => new Date(time).toISOString().slice(0, 10);
    const stamp = (time: number) =>
        new Date(time).toLocaleString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    let visible = $derived(
        records.filter(
            (point) => point.timestamp >= start && point.timestamp <= end,
        ),
    );
    let plotted = $derived(downsample(visible));
    let events = $derived(eventsInRange(start, end));
    let ceiling = $derived(
        Math.max(1, ...plotted.map((point) => point.ccu)) * 1.1,
    );
    const x = (time: number) =>
        56 + ((time - start) / (end - start)) * (chartWidth - 72);
    const y = (value: number) => 330 - (value / ceiling) * 306;
    let path = $derived(
        plotted
            .map(
                (point, index) =>
                    `${index ? "L" : "M"}${x(point.timestamp)},${y(point.ccu)}`,
            )
            .join(" "),
    );
    let selectedLabel = $derived(
        timeframes.find((item) => item.value === timeframe)?.label,
    );

    async function load(reset = true) {
        controller?.abort();
        const request = new AbortController();
        controller = request;
        loading = true;
        message = "";
        hovered = null;
        selection = null;
        try {
            const latestResponse = await fetch("/api/ccu", {
                signal: request.signal,
            });
            if (!latestResponse.ok) throw new Error();
            const latest: Reading = await latestResponse.json();
            if (
                !Number.isFinite(latest.timestamp) ||
                !Number.isFinite(latest.ccu)
            )
                throw new Error();
            const duration = timeframes.find(
                (item) => item.value === timeframe,
            )!.duration;
            const to = reset ? latest.timestamp : end;
            const from = reset
                ? Number.isFinite(duration)
                    ? Math.max(0, to - duration)
                    : 0
                : start;
            const response = await fetch(
                `/api/ccu?from=${date(from)}&to=${date(to)}`,
                { signal: request.signal },
            );
            if (!response.ok) throw new Error();
            const history = await response.json();
            if (!Array.isArray(history.records)) throw new Error();
            const points: Reading[] = history.records.filter(
                (p: Reading) =>
                    Number.isFinite(p.timestamp) && Number.isFinite(p.ccu),
            );
            points.sort((a, b) => a.timestamp - b.timestamp);
            if (request.signal.aborted) return;
            records = points;
            current = latest;
            start =
                reset && timeframe === "all"
                    ? (points[0]?.timestamp ?? to - 60_000)
                    : from;
            end = Math.max(to, start + 60_000);
            if (reset) custom = false;
        } catch {
            if (!request.signal.aborted) message = "Couldn't load CCU data";
        } finally {
            if (!request.signal.aborted) loading = false;
        }
    }

    function changeRange(factor: number, shift = 0) {
        const width = Math.max(
            60_000,
            Math.min((end - start) * factor, current?.timestamp ?? end),
        );
        const middle = (start + end) / 2 + (end - start) * shift;
        end = Math.min(current?.timestamp ?? end, middle + width / 2);
        start = Math.max(0, end - width);
        custom = true;
        void load(false);
    }

    function chartPosition(event: PointerEvent) {
        const bounds =
            event.currentTarget instanceof SVGElement
                ? event.currentTarget.getBoundingClientRect()
                : null;
        if (!bounds || !bounds.width || chartWidth <= 72) return null;
        return {
            x: ((event.clientX - bounds.left) / bounds.width) * chartWidth,
            y: ((event.clientY - bounds.top) / bounds.height) * 380,
        };
    }

    const clampX = (position: number) =>
        Math.max(56, Math.min(chartWidth - 16, position));
    const timeAt = (position: number) =>
        start + ((position - 56) / (chartWidth - 72)) * (end - start);

    function beginSelection(event: PointerEvent) {
        if (
            event.button !== 0 ||
            !event.isPrimary ||
            loading ||
            message ||
            !visible.length
        )
            return;
        const position = chartPosition(event);
        if (
            !position ||
            position.x < 56 ||
            position.x > chartWidth - 16 ||
            position.y < 24 ||
            position.y > 330
        )
            return;
        (event.currentTarget as SVGSVGElement).setPointerCapture(
            event.pointerId,
        );
        selection = {
            pointerId: event.pointerId,
            anchor: position.x,
            cursor: position.x,
            clientX: event.clientX,
        };
        hovered = null;
    }

    function finishSelection(event: PointerEvent) {
        if (!selection || selection.pointerId !== event.pointerId) return;
        const drag = selection;
        const position = chartPosition(event);
        selection = null;
        (event.currentTarget as SVGSVGElement).releasePointerCapture(
            event.pointerId,
        );
        if (!position || Math.abs(event.clientX - drag.clientX) < 5) return;
        const from = timeAt(Math.min(drag.anchor, clampX(position.x)));
        const to = timeAt(Math.max(drag.anchor, clampX(position.x)));
        if (to - from < 60_000) return;
        start = from;
        end = to;
        custom = true;
        void load(false);
    }

    function inspect(event: PointerEvent) {
        const position = chartPosition(event);
        if (!position) return;
        if (selection) {
            if (selection.pointerId === event.pointerId)
                selection.cursor = clampX(position.x);
            return;
        }
        if (loading || !visible.length) return;
        const target = timeAt(clampX(position.x));
        let low = 0,
            high = visible.length - 1;
        while (low < high) {
            const mid = Math.floor((low + high) / 2);
            if (visible[mid].timestamp < target) low = mid + 1;
            else high = mid;
        }
        hovered =
            low > 0 &&
            Math.abs(visible[low - 1].timestamp - target) <
                Math.abs(visible[low].timestamp - target)
                ? visible[low - 1]
                : visible[low];
    }

    onMount(() => {
        void load();
        return () => controller?.abort();
    });
</script>

<svelte:head
    ><title>GCCU</title><meta
        name="description"
        content="See Gorilla Tag CCU over time!"
    /></svelte:head
>

<main class="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
    <header class="mb-8 flex items-baseline justify-between gap-4">
        <h1 class="text-xl font-semibold">GCCU</h1>
        <div class="flex items-center gap-3">
            {#if current}
                <p class="text-sm text-muted-foreground">
                    Current <span
                        class="ml-2 text-xl font-semibold tabular-nums text-foreground"
                        >{number.format(current.ccu)}</span
                    >
                </p>
            {/if}
            <ThemeToggle />
        </div>
    </header>
    <div class="flex flex-wrap items-center justify-between gap-3">
        <Select.Root
            type="single"
            bind:value={timeframe}
            onValueChange={() => load()}
        >
            <Select.Trigger class="w-36" aria-label="Timeframe"
                >{custom ? "Custom" : selectedLabel}</Select.Trigger
            >
            <Select.Content>
                {#each timeframes as item}<Select.Item
                        value={item.value}
                        label={item.label}>{item.label}</Select.Item
                    >{/each}
            </Select.Content>
        </Select.Root>
        <div class="flex items-center gap-1">
            <Button
                variant="ghost"
                size="icon"
                aria-label="Earlier"
                title="Earlier"
                disabled={loading || start <= 0}
                onclick={() => changeRange(1, -0.5)}><ChevronLeft /></Button
            >
            <Button
                variant="ghost"
                size="icon"
                aria-label="Later"
                title="Later"
                disabled={loading || end >= (current?.timestamp ?? end)}
                onclick={() => changeRange(1, 0.5)}><ChevronRight /></Button
            >
            <Button
                variant="outline"
                size="icon"
                aria-label="Zoom out"
                title="Zoom out"
                disabled={loading}
                onclick={() => changeRange(2)}><Minus /></Button
            >
            <Button
                variant="outline"
                size="icon"
                aria-label="Zoom in"
                title="Zoom in"
                disabled={loading || end - start <= 60_000}
                onclick={() => changeRange(0.5)}><Plus /></Button
            >
            <Button variant="ghost" disabled={loading} onclick={() => load()}
                >Reset</Button
            >
        </div>
    </div>
    <div
        class="mt-4 min-h-6 text-xs tabular-nums text-muted-foreground"
        aria-live="polite"
    >
        {#if loading}Loading…{:else if message}<span class="text-destructive"
                >{message}</span
            >
            <button
                class="ml-2 underline underline-offset-4"
                onclick={() => load(!custom)}>Retry</button
            >
        {:else if hovered}<span class="font-medium text-foreground"
                >{number.format(hovered.ccu)} CCU</span
            ><span class="ml-3">{stamp(hovered.timestamp)}</span>
        {:else if current}{stamp(start)} to {stamp(end)}{/if}
    </div>
    <div
        class="relative mt-3"
        aria-busy={loading}
        bind:clientWidth={chartWidth}
    >
        <svg
            viewBox={`0 0 ${chartWidth} 380`}
            preserveAspectRatio="none"
            class="h-[320px] w-full touch-pan-y select-none sm:h-[430px]"
            style:cursor={loading ? "wait" : "crosshair"}
            role="img"
            aria-label="Concurrent users over time"
            onpointerdown={beginSelection}
            onpointermove={inspect}
            onpointerup={finishSelection}
            onpointercancel={() => (selection = null)}
            onlostpointercapture={() => (selection = null)}
            onpointerleave={() => (hovered = null)}
        >
            {#each [0, 0.25, 0.5, 0.75, 1] as fraction}
                <line
                    x1="56"
                    x2={chartWidth - 16}
                    y1={y(ceiling * fraction)}
                    y2={y(ceiling * fraction)}
                    stroke="var(--border)"
                />
                {#if current}<text
                        x="44"
                        y={y(ceiling * fraction) + 4}
                        text-anchor="end"
                        class="fill-muted-foreground text-[12px]"
                        >{number.format(Math.round(ceiling * fraction))}</text
                    >{/if}
            {/each}
            {#if !loading && !message && plotted.length}
                <path
                    d={path}
                    fill="none"
                    stroke="var(--chart-3)"
                    stroke-width="1.8"
                    stroke-linejoin="round"
                    vector-effect="non-scaling-stroke"
                />
                {#if plotted.length === 1}<circle
                        cx={x(plotted[0].timestamp)}
                        cy={y(plotted[0].ccu)}
                        r="3"
                        fill="var(--chart-3)"
                    />{/if}
                {#if hovered}
                    <line
                        x1={x(hovered.timestamp)}
                        x2={x(hovered.timestamp)}
                        y1="24"
                        y2="330"
                        stroke="var(--muted-foreground)"
                        stroke-dasharray="3 4"
                    />
                    <circle
                        cx={x(hovered.timestamp)}
                        cy={y(hovered.ccu)}
                        r="4"
                        fill="var(--foreground)"
                    />
                {/if}
            {/if}
            {#if current && !loading && !message}
                {#each events as event (event.timestamp)}
                    {@const nearRightEdge =
                        x(event.timestamp) > chartWidth - 150}
                    {@const oppositeSide = event.label === "Christmas 2025"}
                    {@const labelOnLeft = oppositeSide ? !nearRightEdge : nearRightEdge}
                    <g>
                        <title>{event.label}: {stamp(event.timestamp)}</title>
                        <line
                            x1={x(event.timestamp)}
                            x2={x(event.timestamp)}
                            y1="24"
                            y2="330"
                            stroke="var(--muted-foreground)"
                            stroke-dasharray="5 5"
                            stroke-opacity="0.6"
                        />
                        <text
                            transform={`translate(${x(event.timestamp) + (labelOnLeft ? -6 : 6)}, ${nearRightEdge ? 105 : 32}) rotate(${oppositeSide ? -35 : 35})`}
                            text-anchor={labelOnLeft ? "end" : "start"}
                            class="fill-muted-foreground text-[11px]"
                            stroke="var(--background)"
                            stroke-width="3"
                            paint-order="stroke"
                            stroke-linejoin="round">{event.label}</text
                        >
                    </g>
                {/each}
            {/if}
            {#if selection}
                <rect
                    x={Math.min(selection.anchor, selection.cursor)}
                    y="24"
                    width={Math.abs(selection.cursor - selection.anchor)}
                    height="306"
                    fill="var(--foreground)"
                    fill-opacity="0.1"
                    pointer-events="none"
                />
                {#each [selection.anchor, selection.cursor] as edge}
                    <line
                        x1={edge}
                        x2={edge}
                        y1="24"
                        y2="330"
                        stroke="var(--muted-foreground)"
                        pointer-events="none"
                    />
                {/each}
            {/if}
            {#if current}
                {#each chartWidth < 500 ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1] as fraction}
                    {@const time = start + (end - start) * fraction}
                    <text
                        x={x(time)}
                        y="359"
                        text-anchor={fraction === 0
                            ? "start"
                            : fraction === 1
                              ? "end"
                              : "middle"}
                        class="fill-muted-foreground text-[12px]"
                        >{new Date(time).toLocaleString(
                            "en-GB",
                            end - start <= 86_400_000
                                ? { hour: "2-digit", minute: "2-digit" }
                                : { day: "numeric", month: "short" },
                        )}</text
                    >
                {/each}
            {/if}
        </svg>
        {#if !loading && !message && !visible.length}<p
                class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
            >
                No data in this timeframe.
            </p>{/if}
    </div>
</main>
