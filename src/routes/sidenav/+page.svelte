<script lang="ts">
    import { onMount } from 'svelte';
    import { fade, slide } from 'svelte/transition';

    // Props from parent layout
    export let isCollapsed = false;
    export let toggleSidebar: () => void; // Function passed from parent
    export let logout: () => Promise<void>;
    export let userRole: 'userDentist' | 'userAdmin' | 'userSecretary' | 'userPatient' | 'userSuper' | undefined;
    export let userName: string | null | undefined;
    export let userPhotoURL: string | null | undefined; // Assuming you want to display this

    // Your existing export let hidePatientList is no longer needed here
    // as we'll control menu items based on userRole.

    // Load the saved state of isCollapsed from sessionStorage
    onMount(() => {
        const savedState = sessionStorage.getItem('isSidenavCollapsed'); // Use a more specific key
        if (savedState !== null) {
            isCollapsed = savedState === 'true';
        }
    });

    // Modified toggleSidebar to save state.
    // The toggleSidebar prop from parent is the actual toggle logic.
    // This localToggle is to wrap it and save state.
    function localToggleSidebar() {
        toggleSidebar(); // Call the parent's toggle function
        sessionStorage.setItem('isSidenavCollapsed', (!isCollapsed).toString()); // Save the new state
    }

    // Define menu items based on roles
    interface MenuItem {
        href: string;
        icon: string;
        alt: string;
        text: string;
        roles: Array<typeof userRole>; // Array of roles that can see this item
    }

    const allMenuItems: MenuItem[] = [
        { href: '/dashboard', icon: '/images/icon-dashboard.png', alt: 'Dashboard', text: 'Dashboard', roles: ['userDentist', 'userSecretary'] },
        { href: '/appointment', icon: '/images/appointment.png', alt: 'Appointment', text: 'Appointment', roles: ['userDentist', 'userSecretary'] }, // Dentist only
        { href: '/appointment/manage', icon: '/images/appointment-manage.png', alt: 'Manage Appointments', text: 'Manage Appointments', roles: ['userSecretary'] }, // Secretary only
        { href: '/patient-list', icon: '/images/icon-patient.png', alt: 'Patient List', text: 'Patient List', roles: ['userDentist'] }, // Dentist only
        { href: '/prescription', icon: '/images/prescription1.png', alt: 'Prescriptions', text: 'Prescriptions', roles: ['userDentist'] },
        { href: '/medicine-list', icon: '/images/medicinelist.png', alt: 'Medicines List', text: 'Medicines List', roles: ['userDentist'] },
        // Secretary specific routes:
        { href: '/manage-availability', icon: '/images/availability.png', alt: 'Manage Availability', text: 'Manage Availability', roles: ['userSecretary', 'userDentist'] }, // Also for dentist?
        { href: '/payment', icon: '/images/payment.png', alt: 'Payments', text: 'Payments', roles: ['userSecretary'] },
    ];

    $: visibleMenuItems = allMenuItems.filter(item => item.roles.includes(userRole));

    // Determine user name display
    let displayFirstName = '';
    let displayLastName = '';

    if (userName) {
        const nameParts = userName.split(' ');
        displayFirstName = nameParts[0];
        if (nameParts.length > 1) {
            displayLastName = nameParts.slice(1).join(' ');
        }
    }

    // Map internal role identifiers to friendly labels for display in the UI.
    // Specifically map 'userSecretary' => 'Management'.
    $: roleLabel = userRole
        ? (userRole === 'userSecretary' ? 'Management' : userRole.replace('user', ''))
        : '';


</script>

<style>
    /* Your existing Sidenav styles are good. */
    /* Make sure the class names in HTML match your CSS, e.g., .sidebar, .content etc. */
:global(.layout) {
		height: 100vh;
		overflow: hidden; 
	}
	.sidebar {
		position: fixed; 
		top: 0;
		left: 0;
        /* centralize sidenav color for easy updates */
        --sidenav-bg: #1e3a66;
        --sidenav-accent: #ffbc22;
        /* hover and active variants for visible feedback */
        --sidenav-hover: #163153; /* slightly darker for hover */
        --sidenav-active: #12273f; /* active/selected state */
        background-color: var(--sidenav-bg);
		color: white;
		width: 11.6rem; 
		height: 100vh;
		display: flex;
		flex-direction: column;
		transition: width 0.3s ease; 
		z-index: 1000;
		box-shadow: 2px 0 5px rgba(0, 0, 0, 0.2);
		overflow-x: hidden; 
	}
	.sidebar.collapsed {
		width: 4.22rem; 
	}
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
    .sidebar-menu li:hover {
        background-color: var(--sidenav-hover);
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
        transition: background-color 0.3s ease, color 0.3s ease;
	}
    .sidebar-menu a .text {
        transition: color 0.3s ease;
    }
    .sidebar-menu a:hover .text,
    .sidebar-menu a:focus-visible .text {
        color: var(--sidenav-accent);
    }
	.sidebar-menu a .icon {
		width: 24px; 
		height: 24px;
		margin-right: 15px; 
        flex-shrink: 0; 
        transition: transform 0.35s ease, filter 0.3s ease;
        transform: translateX(0) scale(1);
	}
    .sidebar-menu a:hover .icon,
    .sidebar-menu a:focus-visible .icon,
    .sidebar-menu li:focus-within .icon {
        transform: translateX(6px) scale(1.08);
        filter: drop-shadow(0 4px 8px rgba(0,0,0,0.25));
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
    .sidebar.collapsed .sidebar-menu a .icon {
        transform: translateX(-4px) scale(0.95);
    }
    .sidebar.collapsed .sidebar-menu a:hover .icon,
    .sidebar.collapsed .sidebar-menu a:focus-visible .icon,
    .sidebar.collapsed .sidebar-menu li:focus-within .icon {
        transform: translateX(2px) scale(1.05);
    }
	.sidebar.collapsed .text {
        opacity: 0; 
        width: 0;
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
        margin-top: auto; 
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
        background-color: var(--sidenav-hover);
        border-color: var(--sidenav-hover);
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

</style>

<!-- Sidebar HTML - This div is not inside a .layout div anymore, 
     as .layout is handled by the parent +layout.svelte file.
     The parent will place the Sidenav and then the <slot/> for content.
-->
<div class="sidebar {isCollapsed ? 'collapsed' : ''}">
    <div class="sidebar-header">
        <div class="circle-background" in:fade>
            <img src={userPhotoURL || '/images/logo(landing).png'} alt="User or Logo" />
        </div>
        {#if !isCollapsed && userName}
            <div class="name-container" in:fade out:fade>
                <!-- Displaying first and last name if available -->
                <span>{displayFirstName}</span>
                {#if displayLastName}
                    <span>{displayLastName}</span>
                {/if}
                {#if userRole}
                    <span style="font-size: 0.75rem; opacity: 0.8; margin-top: 4px;">
                        ({roleLabel})
                    </span>
                {/if}
            </div>
        {/if}
    </div>

    <!-- Sidebar Menu -->
    <ul class="sidebar-menu">
        {#each visibleMenuItems as item (item.href)}
            <li in:slide|local={{ delay: 50 }} out:fade|local>
                <a href={item.href}>
                    <img class="icon" src={item.icon} alt={item.alt} />
                    <span class="text">{item.text}</span>
                </a>
            </li>
        {/each}
    </ul>

    <!-- Logout Button -->
    <button class="logout-btn" on:click={logout} in:fade>
        {#if isCollapsed}
            <img src="/images/logout-icon.png" alt="Logout" class="logout-icon" />
        {:else}
            <span>Logout</span>
        {/if}
    </button>

    <!-- Toggle Sidebar Button -->
    <button class="toggle-btn" on:click={localToggleSidebar} aria-label={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}>
        {isCollapsed ? '➡️' : '⬅️'}
    </button>
</div>

<!-- The <slot /> and .content div are now handled by the parent +layout.svelte -->