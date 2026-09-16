<script lang="ts">
	import IntakeForm from '$lib/trial-intake/components/IntakeForm.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<IntakeForm {data} />
