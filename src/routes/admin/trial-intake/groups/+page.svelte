<script lang="ts">
	import AdminGroups from '$lib/trial-intake/components/AdminGroups.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<AdminGroups {data} />
