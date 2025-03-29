<script>
    import { onMount } from 'svelte';
    
    export let isCollapsed = false;
    export let toggleSidebar;
    export let logout;

    // Load the saved state of isCollapsed from sessionStorage
    onMount(() => {
        const savedState = sessionStorage.getItem('isCollapsed');
        isCollapsed = savedState === 'true'; // Convert string to boolean
    });

    // Update toggleSidebar to save the state
    toggleSidebar = () => {
        isCollapsed = !isCollapsed;
        // @ts-ignore
        sessionStorage.setItem('isCollapsed', isCollapsed); // Save the state
    };
    export let hidePatientList = true; 
</script>

<style>
	.layout {
		/* display: flex; */ /* Flex isn't really needed here since sidebar is fixed */
		height: 100vh;
		overflow: hidden; /* Prevents potential scrollbars caused by layout shifts */
	}

	/* Sidebar styles */
	.sidebar {
		position: fixed; /* Takes sidebar out of normal flow */
		top: 0;
		left: 0;
		background-color: #00a2e8;
		color: white;
		width: 11.6rem; /* Exact width */
		height: 100vh;
		display: flex;
		flex-direction: column;
		transition: width 0.3s ease; /* Animate width change */
		z-index: 1000;
		box-shadow: 2px 0 5px rgba(0, 0, 0, 0.2);
		overflow-x: hidden; /* Hide content spilling out horizontally when collapsing */
	}

	.sidebar.collapsed {
		width: 4.22rem; /* Exact collapsed width */
	}

	/* Content area */
	.content {
		/* Set margin-left dynamically based on sidebar state */
		margin-left: 11.6rem; /* Default margin matching sidebar width */
		flex-grow: 1; /* Takes up remaining space (though not strictly needed now) */
		height: 100vh; /* Full height */
		overflow-y: auto; /* Allow content itself to scroll */
		transition: margin-left 0.3s ease; /* Animate margin change */
        background-color: #f4f7f6; /* Or your desired content background */
        padding: 1rem; /* Add some padding inside the content area */
	}

	.content.collapsed {
		margin-left: 4.22rem; /* Margin matching collapsed sidebar width */
	}


	/* --- Keep the rest of your existing styles for header, menu, logo etc. --- */

	.sidebar-header {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 20px 0; /* Adjust padding */
		flex-shrink: 0; /* Prevent header from shrinking */
	}

	.sidebar-header .circle-background {
		display: flex;
		justify-content: center;
		align-items: center;
		background-color: white;
		width: 80px; /* Default width */
		height: 80px; /* Default height */
		border-radius: 50%;
		/* padding: 10px; */ /* Padding might not be needed if img fits */
		transition: width 0.3s ease, height 0.3s ease; /* Smooth transition */
		overflow: hidden; /* Ensure image stays within circle */
		flex-shrink: 0;
	}

    .sidebar-header .circle-background img {
        display: block; /* Remove extra space below image */
        max-width: 90%; /* Adjust image size within circle */
        height: auto;
        transition: transform 0.3s ease; /* Optional: slight scale effect */
    }


	.sidebar.collapsed .circle-background {
		width: 50px; /* Smaller width when collapsed */
		height: 50px; /* Smaller height when collapsed */
	}
    /* .sidebar.collapsed .circle-background img {
        transform: scale(0.8); /* Optional: scale image down too */
   


	.name-container {
		margin-top: 11px;
		display: flex;
		flex-direction: column; /* Stack the names vertically */
		align-items: center; /* Center names */
        flex-shrink: 0;
	}

	

    .name-container span {
        margin-top: 2px; /* Small gap between names */
		font-size: 0.9rem; /* Slightly smaller font */
		white-space: nowrap;
		text-align: center;
    }


	/* Sidebar Menu */
	.sidebar-menu {
		list-style: none;
		padding: 0; /* Remove default padding */
		padding-top: 2rem; /* Adjust top padding */
		margin: 0;
		flex-grow: 1; /* Takes remaining space */
		overflow-y: auto; /* Allow menu to scroll if needed */
        overflow-x: hidden;
	}

	.sidebar-menu li {
		/* display: flex; */ /* Replaced by flex on 'a' tag */
		/* align-items: center; */
		padding: 0; /* Remove padding from li, add to 'a' */
		cursor: pointer;
		transition: background-color 0.2s ease; /* Faster transition */
	}

	.sidebar-menu li:hover {
		background-color: #007bb5;
	}

	.sidebar-menu a {
		display: flex; /* Flexbox for aligning icon and text horizontally */
		align-items: center; /* Center vertically */
		text-decoration: none;
		color: white;
		width: 100%;
		padding: 12px 20px; /* Consistent padding on the link */
		white-space: nowrap; /* Prevent text wrapping */
		overflow: hidden; /* Hide text overflow */
	}

	.sidebar-menu a .icon {
		width: 24px; /* Adjust icon size */
		height: 24px;
		margin-right: 15px; /* Spacing between icon and text */
        flex-shrink: 0; /* Prevent icon shrinking */
	}

	.sidebar-menu a .text {
		font-size: 0.95rem; /* Adjust font size */
		/* white-space: nowrap; */ /* Handled by 'a' tag */
        overflow: hidden;
        text-overflow: ellipsis; /* Add ellipsis if text is too long */
	}

	/* Collapsed Sidebar Adjustments */
	.sidebar.collapsed .sidebar-header {
		padding: 20px 0;
	}
	.sidebar.collapsed .sidebar-menu a {
		justify-content: center; /* Center icon when collapsed */
		padding: 12px 0;
	}
	.sidebar.collapsed .text {
		/* display: none; */ /* Text is hidden by overflow on 'a' */
        opacity: 0; /* Fade out text */
        width: 0;
	}

	.sidebar.collapsed .icon {
		margin-right: 0;
	}

	/* Logout Button */
	.logout-btn {
		background-color: transparent; /* Match sidebar */
        border: 1px solid rgba(255, 255, 255, 0.5); /* Subtle border */
		color: white;
		cursor: pointer;
		font-size: 0.95rem;
		padding: 8px 15px; /* Adjust padding */
		margin: 15px; /* Use margin for spacing */
        margin-top: auto; /* Pushes to bottom */
		border-radius: 20px; /* Adjust rounding */
		text-align: center;
		transition: background-color 0.2s ease, padding 0.3s ease, border-color 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
        flex-shrink: 0; /* Prevent shrinking */
        gap: 8px; /* Gap between icon and text if both shown */
	}

	.logout-btn:hover {
		background-color: #007bb5;
        border-color: #007bb5;
	}

	.logout-btn img.logout-icon {
		width: 18px; /* Adjust icon size */
		height: 18px;
	}

	.sidebar.collapsed .logout-btn {
		width: auto; /* Fit content */
		padding: 8px; /* Smaller padding for icon only */
        margin: 15px auto; /* Center horizontally */
	}
     .sidebar.collapsed .logout-btn span { /* Hide text span if you have one */
         display: none;
     }


	.toggle-btn {
		cursor: pointer;
		background-color: rgba(0, 0, 0, 0.1); /* Subtle background */
		border: none;
		color: white;
		font-size: 1rem;
		padding: 8px 0; /* Vertical padding only */
		text-align: center;
        flex-shrink: 0; /* Prevent shrinking */
        width: 100%; /* Full width */
        margin-top: 10px; /* Space above toggle */
	}
    .toggle-btn:hover {
        background-color: rgba(0, 0, 0, 0.2);
    }

</style>

<div class="layout">
	<!-- Sidebar -->
	<div class="sidebar {isCollapsed ? 'collapsed' : ''}">
		<div class="sidebar-header">
			<div class="circle-background">
				<!-- Consider using a single logo source and controlling size via CSS if possible -->
				<img src={'/images/logo(landing).png'} alt="Logo" />
			</div>
			{#if !isCollapsed}
				<div class="name-container">
					<span>Alfred Domingo</span>
					<span>Fernalyn Domingo</span>
				</div>
			{/if}
		</div>

		<!-- Sidebar Menu -->
		<ul class="sidebar-menu">
			<li>
				<a href="./dashboard">
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
			<!-- Patient List is likely always visible for admin? -->
			<!-- Use {#if} block if hidePatientList needs to be reactive -->
			{#if !hidePatientList}
				<li>
					<a href="./patient-list">
						<img class="icon" src="/images/icon-patient.png" alt="Patient List" />
						<span class="text">Patient List</span>
					</a>
				</li>
			{/if}
			<li>
				<a href="./prescription">
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

		<!-- Logout Button -->
		<button class="logout-btn" on:click={logout}>
			{#if isCollapsed}
				<img src="/images/logout-icon.png" alt="Logout" class="logout-icon" />
			{:else}
				<!-- You can add an icon here too if desired -->
                <!-- <img src="/images/logout-icon.png" alt="" class="logout-icon" /> -->
				<span>Logout</span>
			{/if}
		</button>

		<!-- Toggle Sidebar Button -->
		<button class="toggle-btn" on:click={toggleSidebar} aria-label={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}>
			{isCollapsed ? '➡️' : '⬅️'}
		</button>
	</div>

	<!-- Content Area -->
	<!-- Bind the class directly based on isCollapsed -->
	<div class="content {isCollapsed ? 'collapsed' : ''}">
		<slot />
		<!-- Slot for the main content -->
	</div>
</div>