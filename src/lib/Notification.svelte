<script lang="ts">
	export let message = '';
	export let type: 'success' | 'error' | 'info' = 'info';
	export let show = false;
	let timeout: NodeJS.Timeout;

	$: if (show && message) {
		clearTimeout(timeout);
		timeout = setTimeout(() => show = false, 3000);
	}
</script>

{#if show}
	<div class="fixed top-6 right-6 z-50 px-4 py-3 rounded shadow-lg text-white transition-all duration-300"
		class:bg-green-500={type === 'success'}
		class:bg-red-500={type === 'error'}
		class:bg-blue-500={type === 'info'}>
		{message}
	</div>
{/if}

<style>
	div { min-width: 220px; max-width: 350px; font-size: 1rem; }
</style> 