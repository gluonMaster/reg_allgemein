<script lang="ts">
	import AdminList from '$lib/trial-intake/components/AdminList.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<AdminList {data} />
