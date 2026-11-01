<script lang="ts">
    import { onMount } from 'svelte';
    import { Button } from '#lib/components/ui/button/index.js';
    import Sun from '@lucide/svelte/icons/sun';
    import Moon from '@lucide/svelte/icons/moon';

    let dark = $state(true);

    onMount(() => {
        dark = document.documentElement.classList.contains('dark');
    });

    function toggle() {
        dark = !dark;
        document.documentElement.classList.toggle('dark', dark);
        document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
        try {
            localStorage.setItem('gccu-theme', dark ? 'dark' : 'light');
        } catch {}
    }
</script>

<Button variant="ghost" size="icon" onclick={toggle} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
    {#if dark}<Sun />{:else}<Moon />{/if}
</Button>
