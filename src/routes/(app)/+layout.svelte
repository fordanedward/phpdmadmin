<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { browser } from '$app/environment'; 
	import '../../app.css';

	let isMobile = false;
	let isCollapsed = false;
	let isSidebarOpen = false;

	const MOBILE_BREAKPOINT = 768;

	function checkLayoutMode() {
		if (!browser) return;

		const screenWidth = window.innerWidth; 
		const currentlyMobile = screenWidth < MOBILE_BREAKPOINT;

		if (currentlyMobile !== isMobile) {
			isMobile = currentlyMobile;

			if (isMobile) {
				isCollapsed = true;
				isSidebarOpen = false;
			} else {
				isSidebarOpen = false;
				const savedState = sessionStorage.getItem('isCollapsed');
				isCollapsed = savedState === 'true';
			}
		} else {
			if (!isMobile && sessionStorage.getItem('isCollapsed') === null) { 
				sessionStorage.setItem('isCollapsed', 'false'); 
				isCollapsed = false;
			}
		}
	}

	function toggleSidebarDesktop() {
		if (!browser || isMobile) return; 
		isCollapsed = !isCollapsed;
		sessionStorage.setItem('isCollapsed', String(isCollapsed));
	}

	function toggleSidebarMobile() {
		if (!browser || !isMobile) return; 
		isSidebarOpen = !isSidebarOpen;
	}

	function closeSidebarMobile() {
		if (isSidebarOpen) {
			isSidebarOpen = false;
		}
	}

	function logout() {
		if (browser) { 
			sessionStorage.removeItem('isCollapsed');
		}
		console.log('Logging out...');
		closeSidebarMobile();
		goto('/');
	}

	onMount(() => {
     
		checkLayoutMode(); 
		window.addEventListener('resize', checkLayoutMode); 

		const pageUnsubscribe = page.subscribe(() => {
			if (browser && isMobile && isSidebarOpen) { 
				closeSidebarMobile();
			}
		});

		return () => {
			if (browser) { 
				window.removeEventListener('resize', checkLayoutMode);
			}
			pageUnsubscribe();
		};
	});

</script>

<div class="app-layout">
	{#if isMobile}
		<header class="app-header">
			<button on:click={toggleSidebarMobile} class="hamburger-btn" aria-label="Toggle Menu" aria-expanded={isSidebarOpen}>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
					<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
				</svg>
			</button>
			<!--<span class="header-title">Patient Management</span>-->
		</header>
	{/if}

	<div class="sidebar {isMobile ? (isSidebarOpen ? 'open' : 'closed-mobile') : (isCollapsed ? 'collapsed' : 'open-desktop')}">
		<div class="sidebar-header">
            {#if isMobile}
                 <button on:click={closeSidebarMobile} class="close-sidebar-btn" aria-label="Close Menu">✕</button>
            {/if}
			<div class="circle-background">
				<img src={'/images/logo(landing).png'} alt="Logo" />
			</div>

			<!-- 	{#if (!isMobile && !isCollapsed) || (isMobile && isSidebarOpen)}
				<div class="name-container">
					<span>Alfred Domingo</span>
					<span>Fernalyn Domingo</span>
				</div>
			{/if}-->
		</div>

		<ul class="sidebar-menu">
            <li><a href="/dashboard"><img class="icon" src="/images/icon-dashboard.png" alt="Dashboard" /><span class="text">Dashboard</span></a></li>
            <li><a href="/appointment"><img class="icon" src="/images/appointment.png" alt="Appointment" /><span class="text">Appointment</span></a></li>
            <li><a href="/prescription"><img class="icon" src="/images/prescription1.png" alt="Prescriptions" /><span class="text">Prescriptions</span></a></li>
            <li><a href="/medicine-list"><img class="icon" src="/images/medicinelist.png" alt="Medicines List" /><span class="text">Medicines List</span></a></li>
		</ul>

		<button class="logout-btn" on:click={logout}>
			{#if (isMobile && isSidebarOpen) || (!isMobile && !isCollapsed)}
				<img src="/images/logout-icon.png" alt="Logout" class="logout-icon" />
                <span>Logout</span>
			{:else if !isMobile && isCollapsed}
                <img src="/images/logout-icon.png" alt="Logout" class="logout-icon" />
			{/if}
		</button>

		{#if !isMobile}
			<button class="toggle-btn" on:click={toggleSidebarDesktop} aria-label={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}>
				{isCollapsed ? '➡️' : '⬅️'}
			</button>
		{/if}
	</div>

    {#if isMobile && isSidebarOpen}
        <div class="backdrop" on:click={closeSidebarMobile} aria-hidden="true"></div>
    {/if}

	<main class="content {isMobile ? 'mobile' : (isCollapsed ? 'collapsed' : 'desktop')}">
		<slot />
	</main>
</div>
<style>
	:root {
		--sidebar-width-desktop: 11.6rem;
		--sidebar-width-collapsed: 4.22rem;
		--sidebar-width-mobile: 250px;
	
		--sidebar-bg-color: #334eac;
		--sidebar-text-color: white;
		--content-bg-color: #f4f7f6;
		--sidebar-transition: 0.3s ease-in-out;
	}

	.app-layout {
		min-height: 100vh;
		background-color: var(--content-bg-color);
	}

	.app-header {
		display: none;
		position: sticky;
		top: 0;
		width: 100%;
		background-color: var(--sidebar-bg-color);
		color: var(--sidebar-text-color);
		padding: 0.75rem 1rem;
		align-items: center;
		z-index: 900;
		box-shadow: 0 2px 4px rgba(0,0,0,0.1);
	}

	.hamburger-btn {
		background: none;
		border: none;
		color: white;
		cursor: pointer;
		padding: 0.5rem;
		margin-right: 1rem;
	}

	.hamburger-btn svg {
		display: block;
		width: 24px;
		height: 24px;
	}

	.header-title {
		font-size: 1.1rem;
		font-weight: 500;
	}

	.sidebar {
		position: fixed;
		top: 0;
		left: 0;
		background-color: var(--sidebar-bg-color);
		color: var(--sidebar-text-color);
		height: 100vh;
		display: flex;
		flex-direction: column;
		overflow-x: hidden;
		overflow-y: auto;
		box-shadow: 2px 0 5px rgba(0, 0, 0, 0.2);
		transition: transform var(--sidebar-transition), width var(--sidebar-transition);
	}

	.sidebar-header {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 20px 0;
		flex-shrink: 0;
		position: relative;
	}

	.sidebar-header .circle-background {
		display: flex;
		justify-content: center;
		align-items: center;
		background-color: white;
		border-radius: 50%;
		overflow: hidden;
		flex-shrink: 0;
		transition: width 0.3s ease, height 0.3s ease;
	}

	.sidebar-header .circle-background img {
		display: block;
		max-width: 90%;
		height: auto;
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
		flex-shrink: 0;
		transition: margin-right var(--sidebar-transition);
	}

	.sidebar-menu a .text {
		font-size: 0.95rem;
		overflow: hidden;
		text-overflow: ellipsis;
		opacity: 1;
		transition: opacity 0.1s ease, width var(--sidebar-transition);
		margin-left: 15px;
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
		transition: background-color 0.2s ease, padding var(--sidebar-transition), border-color 0.2s ease;
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

	@media (max-width: 767px) {
		.app-header {
			display: flex;
		}

		.sidebar {
			width: var(--sidebar-width-mobile);
			transform: translateX(-100%);
			z-index: 1000;
			transition: transform var(--sidebar-transition);
		}

		.sidebar.open {
			transform: translateX(0);
		}

		.sidebar-header .circle-background {
			width: 80px;
			height: 80px;
		}

		.sidebar-menu a .icon {
			margin-right: 15px;
		}

		.sidebar-menu a .text {
			opacity: 1;
			width: auto;
			margin-left: 15px;
		}

		.logout-btn {
			padding: 8px 15px;
		}

		.logout-btn span {
			display: inline;
		}

		.content.mobile {
			margin-left: 0;
			padding-top: var(--header-height-mobile);
			transition: filter var(--sidebar-transition);
			width: 100%;
		}

		.close-sidebar-btn {
			position: absolute;
			top: 10px;
			right: 15px;
			background: none;
			border: none;
			color: rgba(255, 255, 255, 0.7);
			font-size: 1.5rem;
			cursor: pointer;
			padding: 5px;
			line-height: 1;
			display: block;
		}

		.close-sidebar-btn:hover {
			color: white;
		}

		.toggle-btn {
			display: none;
		}

		.backdrop {
			position: fixed;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			background-color: rgba(0, 0, 0, 0.5);
			z-index: 999;
			opacity: 0;
			visibility: hidden;
			transition: opacity 0.3s ease-in-out, visibility 0s linear 0.3s;
		}

		.sidebar.open + .backdrop {
			opacity: 1;
			visibility: visible;
			transition: opacity 0.3s ease-in-out, visibility 0s linear 0s;
		}
	}

	@media (min-width: 768px) {
		.sidebar {
			transform: none;
			width: var(--sidebar-width-desktop);
			z-index: 50;
			transition: width var(--sidebar-transition);
		}

		.sidebar.collapsed {
			width: var(--sidebar-width-collapsed);
			overflow: hidden;
		}

		.sidebar-header .circle-background {
			width: 80px;
			height: 80px;
		}

		.sidebar.collapsed .sidebar-header .circle-background {
			width: 50px;
			height: 50px;
		}

		.sidebar-menu a .icon {
			margin-right: 15px;
		}

		.sidebar.collapsed .sidebar-menu a {
			justify-content: center;
			padding: 12px 0;
		}

		.sidebar.collapsed .sidebar-menu a .icon {
			margin-right: 0;
		}

		.sidebar.collapsed .sidebar-menu a .text {
			opacity: 0;
			width: 0;
			margin-left: 0;
		}

		.logout-btn {
			padding: 8px 15px;
		}

		.logout-btn span {
			display: inline;
		}

		.sidebar.collapsed .logout-btn {
			width: auto;
			padding: 8px;
			margin: 15px auto;
		}

		.sidebar.collapsed .logout-btn span {
			display: none;
		}

		.content.desktop {
			margin-left: var(--sidebar-width-desktop);
			padding-top: 0;
			transition: margin-left var(--sidebar-transition);
			width: auto;
		}

		.content.collapsed {
			margin-left: var(--sidebar-width-collapsed);
		}

		.close-sidebar-btn {
			display: none;
		}

		.backdrop {
			display: none;
		}

		.toggle-btn {
			display: block;
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
	}
</style>
