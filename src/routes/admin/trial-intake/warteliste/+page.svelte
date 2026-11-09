<script lang="ts">
	import AdminWaitlist from '$lib/trial-intake/components/AdminWaitlist.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<AdminWaitlist {data} />
