<script lang="ts">
	import AdminDetail from '$lib/trial-intake/components/AdminDetail.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<AdminDetail {data} />
