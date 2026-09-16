<script lang="ts">
	import Verification from '$lib/trial-intake/components/Verification.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<Verification {data} />
