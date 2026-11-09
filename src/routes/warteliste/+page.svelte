<script lang="ts">
	import WaitlistForm from '$lib/trial-intake/components/WaitlistForm.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<WaitlistForm {data} />
