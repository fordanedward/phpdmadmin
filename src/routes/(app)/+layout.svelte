<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
    import '../../app.css';

	let isCollapsed = false;

	// Function to check screen width
	function checkScreenSize() {
		if (window.innerWidth < 768) {  // Assume mobile screens are <768px
			isCollapsed = true;
		} else {
			const savedState = sessionStorage.getItem('isCollapsed');
			isCollapsed = savedState === 'true';
		}
	}

	// Run on mount
	onMount(() => {
		checkScreenSize();
		window.addEventListener('resize', checkScreenSize); // Update on resize
	});

	// Toggle function
	function toggleSidebar() {
		isCollapsed = !isCollapsed;
		sessionStorage.setItem('isCollapsed', String(isCollapsed));
	}

	function logout() {
		console.log('Logging out...');
		sessionStorage.removeItem('isCollapsed');
		goto('/');
	}
</script>


<div class="app-layout">
	<!-- Sidebar moved here -->
	<div class="sidebar {isCollapsed ? 'collapsed' : ''}">
		<div class="sidebar-header">
			<div class="circle-background">
				<!-- Simplified logo logic, adjust if needed -->
				<img src={'/images/logo(landing).png'} alt="Logo" />
			</div>
			{#if !isCollapsed}
				<div class="name-container">
					<span>Alfred Domingo</span>
					<span>Fernalyn Domingo</span>
				</div>
			{/if}
		</div>

		<ul class="sidebar-menu">
			<li>
				<a href="/dashboard"> 
					<img class="icon" src="/images/icon-dashboard.png" alt="Dashboard" />
					<span class="text">Dashboard</span>
				</a>
			</li>
			<li>
				<a href="/appointment"> 
					<img class="icon" src="/images/appointment.png" alt="Appointment" />
					<span class="text">Appointment</span>
				</a>
			</li>
            <!-- Example: Conditionally show Patient List -->
			<!-- {#if !someConditionMaybeBasedOnUserRole}
				<li>
					<a href="/patient-list">
						<img class="icon" src="/images/icon-patient.png" alt="Patient List" />
						<span class="text">Patient List</span>
					</a>
				</li>
			{/if} -->
            <li>
				<a href="/patient-list"> 
					<img class="icon" src="/images/icon-patient.png" alt="Patient List" />
					<span class="text">Patient List</span>
				</a>
			</li>
			<li>
				<a href="/prescription"> 
					<img class="icon" src="/images/prescription1.png" alt="Prescriptions" />
					<span class="text">Prescriptions</span>
				</a>
			</li>
			<li>
				<a href="/medicine-list"> 
					<img class="icon" src="/images/medicinelist.png" alt="Medicines List" />
					<span class="text">Medicines List</span>
				</a>
			</li>
		</ul>

		<button class="logout-btn" on:click={logout}>
			{#if isCollapsed}
				<img src="/images/logout-icon.png" alt="Logout" class="logout-icon" />
			{:else}
				<span>Logout</span>
			{/if}
		</button>

		<button class="toggle-btn" on:click={toggleSidebar} aria-label={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}>
			{isCollapsed ? '➡️' : '⬅️'}
		</button>
	</div>

	<!-- Main Content Area wrapper -->
	<main class="content  {isCollapsed ? 'collapsed' : ''}">
		<slot />
		<!-- Dito papasok yung content ng bawat +page.svelte -->
	</main>
</div>

<style>
	/* Ililipat natin ang CSS dito mamaya */
    .app-layout {
        /* No flex needed here if using fixed sidebar + margin */
		min-height: 100vh; /* Use min-height */
        background-color: #f4f7f6; /* Base background */
	}

	/* Sidebar styles - Copied from previous fix */
	.sidebar {
		position: fixed;
		top: 0;
		left: 0;
		background-color: #00a2e8;
		color: white;
		width: 11.6rem; /* Exact width */
		height: 100vh;
		display: flex;
		flex-direction: column;
		transition: width 0.3s ease;
		z-index: 1000;
		box-shadow: 2px 0 5px rgba(0, 0, 0, 0.2);
		overflow-x: hidden;
	}

	.sidebar.collapsed {
		width: 4.22rem; /* Exact collapsed width */
	}

	/* Content area - Copied from previous fix */
	.content {
		margin-left: 11.6rem; /* Default margin matching sidebar width */
		/* flex-grow: 1; */ /* Not needed if just using margin */
        min-height: 100vh; /* Ensure content area can fill height */
		/* overflow-y: auto; */ /* Let the main page content scroll if needed, not this wrapper */
		transition: margin-left 0.3s ease;
        /* background-color: #f4f7f6; */ /* Set on app-layout or body */
        /* padding: 1rem; */ /* Padding should be on the actual page content or a wrapper inside <slot> */
	}

	.content.collapsed {
		margin-left: 4.22rem; /* Margin matching collapsed sidebar width */
	}


	/* --- Styles for elements INSIDE the sidebar (header, menu, buttons) --- */
    /* --- Copy the rest of the styles from your original sidebar component here --- */
    /* --- ( .sidebar-header, .circle-background, .name-container, etc. ) --- */

    .sidebar-header {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 20px 0;
		flex-shrink: 0;
	}

	.sidebar-header .circle-background {
		display: flex;
		justify-content: center;
		align-items: center;
		background-color: white;
		width: 80px;
		height: 80px;
		border-radius: 50%;
		transition: width 0.3s ease, height 0.3s ease;
		overflow: hidden;
		flex-shrink: 0;
	}

    .sidebar-header .circle-background img {
        display: block;
        max-width: 90%;
        height: auto;
        transition: transform 0.3s ease;
    }

	.sidebar.collapsed .circle-background {
		width: 50px;
		height: 50px;
	}

	.name-container {
		margin-top: 11px;
		display: flex;
		flex-direction: column;
		align-items: center;
        flex-shrink: 0;
	}

    .name-container span {
        margin-top: 2px;
		font-size: 0.9rem;
		white-space: nowrap;
		text-align: center;
    }

	.sidebar-menu {
		list-style: none;
		padding: 0;
		padding-top: 2rem;
		margin: 0;
		flex-grow: 1;
		overflow-y: auto;
        overflow-x: hidden;
	}

	.sidebar-menu li {
		padding: 0;
		cursor: pointer;
		transition: background-color 0.2s ease;
	}

	.sidebar-menu li:hover {
		background-color: #007bb5;
	}

	.sidebar-menu a {
		display: flex;
		align-items: center;
		text-decoration: none;
		color: white;
		width: 100%;
		padding: 12px 20px;
		white-space: nowrap;
		overflow: hidden;
	}

	.sidebar-menu a .icon {
		width: 24px;
		height: 24px;
		margin-right: 15px;
        flex-shrink: 0;
	}

	.sidebar-menu a .text {
		font-size: 0.95rem;
        overflow: hidden;
        text-overflow: ellipsis;
	}

	.sidebar.collapsed .sidebar-header {
		padding: 20px 0;
	}
	.sidebar.collapsed .sidebar-menu a {
		justify-content: center;
		padding: 12px 0;
	}
	.sidebar.collapsed .text {
        opacity: 0;
        width: 0;
        /* Ensure transition if desired */
        transition: opacity 0.1s ease, width 0.3s ease;
	}

	.sidebar.collapsed .icon {
		margin-right: 0;
	}

	.logout-btn {
		background-color: transparent;
        border: 1px solid rgba(255, 255, 255, 0.5);
		color: white;
		cursor: pointer;
		font-size: 0.95rem;
		padding: 8px 15px;
		margin: 15px;
        margin-top: auto; /* Pushes to bottom */
		border-radius: 20px;
		text-align: center;
		transition: background-color 0.2s ease, padding 0.3s ease, border-color 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
        flex-shrink: 0;
        gap: 8px;
	}

	.logout-btn:hover {
		background-color: #007bb5;
        border-color: #007bb5;
	}

	.logout-btn img.logout-icon {
		width: 18px;
		height: 18px;
	}

	.sidebar.collapsed .logout-btn {
		width: auto;
		padding: 8px;
        margin: 15px auto;
	}
     .sidebar.collapsed .logout-btn span {
         display: none;
     }


	.toggle-btn {
		cursor: pointer;
		background-color: rgba(0, 0, 0, 0.1);
		border: none;
		color: white;
		font-size: 1rem;
		padding: 8px 0;
		text-align: center;
        flex-shrink: 0;
        width: 100%;
        margin-top: 10px;
	}
    .toggle-btn:hover {
        background-color: rgba(0, 0, 0, 0.2);
    }
	@media (max-width: 768px) {
    .sidebar {
        width: 4.22rem; /* Default to collapsed */
    }

    .content {
        margin-left: 4.22rem;
    }
}

</style>