<script lang="ts">
	import Withdrawal from '$lib/trial-intake/components/Withdrawal.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<Withdrawal {data} />
