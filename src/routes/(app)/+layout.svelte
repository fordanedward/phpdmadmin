<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import '../../app.css';

	import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
	import { doc, getDoc } from 'firebase/firestore';
	import Swal from 'sweetalert2';
    import { auth as firebaseAppAuth, db as firebaseAppDb } from '$lib/firebaseConfig.js';  
    import ChatDrawer from '$lib/components/ChatDrawer.svelte';
    import Notification from '$lib/Notification.svelte';
    import { notification as notificationStore } from '$lib/notificationStore.js';
 
    interface UserProfileForLayout {
        uid: string;
        email: string | null;
        displayName: string | null;
        photoURL: string | null;
        role?: 'userDentist' | 'userAdmin' | 'userSecretary' | 'userPatient' | 'userSuper'; 
        customUserId?: string; // five-digit account ID stored in Firestore
    }
    let layoutCurrentUser: UserProfileForLayout | null = null;
    let layoutAuthLoading: boolean = true;


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
				const savedState = sessionStorage.getItem('isDesktopSidebarCollapsed');
				isCollapsed = savedState === 'true';  
			}
		} else {
            
            if (!isMobile && sessionStorage.getItem('isDesktopSidebarCollapsed') === null) {
                sessionStorage.setItem('isDesktopSidebarCollapsed', 'false');
                isCollapsed = false;
            }
        }
	}

	function toggleSidebarDesktop() {
		if (!browser || isMobile) return; 
		isCollapsed = !isCollapsed;
		sessionStorage.setItem('isDesktopSidebarCollapsed', String(isCollapsed));
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

    async function handleLogout() {
        if (browser) {
            sessionStorage.removeItem('isDesktopSidebarCollapsed');  
            // sessionStorage.removeItem('isCollapsed');  
        }
        console.log('Logging out...');
        closeSidebarMobile();  
        try {
            await firebaseSignOut(firebaseAppAuth);  
            
            goto('/'); 
        } catch (error) {
            console.error("Logout error:", error);
           
        }
    }

    interface MenuItemDef {
        href: string;
        icon: string;
        alt: string;
        text: string;
        roles: Array<UserProfileForLayout['role']>; 
    }

    const allMenuItems: MenuItemDef[] = [
        { href: "/dashboard", icon: "/images/icon-dashboard.png", alt: "Dashboard", text: "Dashboard", roles: ['userDentist', 'userSecretary'] },

        { href: "/appointment", icon: "/images/appointment.png", alt: "Book Appointment", text: "Appointment", roles: ['userDentist'] }, // Assuming this is for booking FOR dentist view
       // { href: "/patient-list", icon: "/images/icon-patient.png", alt: "Patient List", text: "Patient List", roles: ['userDentist'] },
        { href: "/prescription", icon: "/images/prescription1.png", alt: "Prescriptions", text: "Prescriptions", roles: ['userDentist'] },
        { href: "/medicine-list", icon: "/images/medicinelist.png", alt: "Medicines List", text: "Medicines List", roles: ['userDentist'] },
        { href: "/appointment/manage", icon: "/images/calendar.png", alt: "Manage Appointments", text: "Appointments", roles: ['userSecretary'] }, // Icon needed
        { href: "/management/manage-availability", icon: "/images/24-hours.png", alt: "Manage Availability", text: "Availability", roles: ['userSecretary'] }, // Icon needed
        { href: "/chat", icon: "/images/icon-person.png", alt: "Chat", text: "Chat", roles: ['userSecretary'] }, // Chat for messaging all users - using person icon as placeholder
       // { href: "/management/payment", icon: "/images/wallet (1).png", alt: "Payments", text: "Payments", roles: ['userSecretary'] }, // Icon needed
    ];

    $: visibleMenuItems = layoutCurrentUser?.role
        ? allMenuItems.filter(item => item.roles.includes(layoutCurrentUser?.role))
        : [];

    let displayFirstName = '';
    let displayLastName = '';

    $: {  
        if (layoutCurrentUser?.displayName) {
            const nameParts = layoutCurrentUser.displayName.split(' ');
            displayFirstName = nameParts[0] || '';  
            displayLastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
        } else if (layoutCurrentUser?.email) {
            displayFirstName = layoutCurrentUser.email.split('@')[0];  
            displayLastName = '';
        } else {
            displayFirstName = 'User'; 
            displayLastName = '';
        }
    }

	// Map internal role identifiers to friendly labels for display in the UI.
	// Map 'userSecretary' => 'Management'
	$: layoutRoleLabel = layoutCurrentUser?.role
		? (layoutCurrentUser.role === 'userSecretary' ? 'Management' : layoutCurrentUser.role.replace('user', ''))
		: '';

	onMount(() => {
        const unsubscribeAuth = onAuthStateChanged(firebaseAppAuth, async (user) => {
			if (user) {
				const userDocRef = doc(firebaseAppDb, "users", user.uid);
				const userDocSnap = await getDoc(userDocRef);
				if (userDocSnap.exists()) {
					const userData = userDocSnap.data();

					// If the account is not active, sign out and redirect to login
					if (userData.status && String(userData.status).toLowerCase() !== 'active') {
						layoutCurrentUser = null;
						try {
							await firebaseSignOut(firebaseAppAuth);
						} catch (e) {
							console.error('Error signing out inactive user:', e);
						}
						if (browser) {
							await Swal.fire({
								icon: 'error',
								title: 'Account Inactive',
								text: 'Your account has been set to inactive. Please contact an administrator.',
								showConfirmButton: true
							});
							goto('/login');
						}
						layoutAuthLoading = false;
						return;
					}

					layoutCurrentUser = { uid: user.uid, ...userData } as UserProfileForLayout;
				} else {
					console.warn(`User ${user.uid} authenticated but profile not found in Firestore.`);
					layoutCurrentUser = {  
						uid: user.uid,
						email: user.email,
						displayName: user.displayName,
						photoURL: user.photoURL,
						role: undefined 
					};
				}
                
                const currentPath = $page.url.pathname;
                if (currentPath === '/' || currentPath.startsWith('/login') || currentPath.startsWith('/register') || currentPath.startsWith('/auth')) {
                    if (layoutCurrentUser?.role === 'userDentist') goto('/dashboard');
                    else if (layoutCurrentUser?.role === 'userSecretary') goto('/manage-availability');  
                    // else goto('/some-default-page');  
                }

            } else {
                layoutCurrentUser = null;
                const currentPath = $page.url.pathname;
                if (currentPath !== '/' && !currentPath.startsWith('/login') && !currentPath.startsWith('/register') && !currentPath.startsWith('/auth')) {
                   if(browser) goto('/login?redirect=' + encodeURIComponent(currentPath));  
                }
            }
            layoutAuthLoading = false;
        });

		checkLayoutMode();  
		window.addEventListener('resize', checkLayoutMode);

		const pageUnsubscribe = page.subscribe((currentPage) => {  
			if (browser && isMobile && isSidebarOpen) {
				closeSidebarMobile();  
			}
           
            if (!layoutCurrentUser && currentPage.url.pathname !== '/' && !currentPage.url.pathname.startsWith('/login') && !currentPage.url.pathname.startsWith('/register') && !currentPage.url.pathname.startsWith('/auth')) {
                
            }
		});

		return () => {  
			if (browser) {
				window.removeEventListener('resize', checkLayoutMode);
			}
			pageUnsubscribe();
            unsubscribeAuth();  
		};
	});

</script>

{#if layoutAuthLoading}
    <div class="loading-screen">  
        <p>Loading Application...</p>
    </div>
{:else}
    <div class="app-layout">
        {#if layoutCurrentUser} 
            {#if isMobile}
                <header class="app-header">
                    <button on:click={toggleSidebarMobile} class="hamburger-btn" aria-label="Toggle Menu" aria-expanded={isSidebarOpen}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                        </svg>
                    </button>
                 
                </header>
            {/if}

            <div class="sidebar {isMobile ? (isSidebarOpen ? 'open' : 'closed-mobile') : (isCollapsed ? 'collapsed' : 'open-desktop')}">
                <div class="sidebar-header">
                    {#if isMobile && isSidebarOpen} 
                        <button on:click={closeSidebarMobile} class="close-sidebar-btn" aria-label="Close Menu">×</button>
                    {/if}
                    <div class="circle-background">
                        <img src={layoutCurrentUser.photoURL || '/images/digital member portal.png'} alt="User or Logo" />
                    </div>

                    {#if (!isMobile && !isCollapsed) || (isMobile && isSidebarOpen)}
                        <div class="name-container">
                            <span>{displayFirstName}</span>
                            {#if displayLastName}<span>{displayLastName}</span>{/if}
							{#if layoutCurrentUser.role}
								<span style="font-size: 0.7rem; opacity: 0.8; margin-top:3px; text-transform: capitalize;">
									({layoutRoleLabel})
								</span>
							{/if}
                            {#if layoutCurrentUser.customUserId}
                                <span style="font-size: 0.7rem; opacity: 0.75; margin-top: 2px;">ID: {layoutCurrentUser.customUserId}</span>
                            {/if}
                        </div>
                    {/if}
                </div>

                <ul class="sidebar-menu">
                    {#each visibleMenuItems as item (item.href)}
                        <li>
                           
                            <a href={item.href} class:active={$page.url.pathname === item.href || ($page.url.pathname.startsWith(item.href) && item.href !== '/' && item.href.length > 1 && $page.url.pathname.charAt(item.href.length) === '/') }>
                                <img class="icon" src={item.icon} alt={item.alt} />
                                <span class="text">{item.text}</span>
                            </a>
                        </li>
                    {/each}
                </ul>

                <button class="logout-btn" on:click={handleLogout}>
                    {#if (isMobile && isSidebarOpen) || (!isMobile && !isCollapsed)}
                        <img src="/images/logout-icon.png" alt="Logout" class="logout-icon" />
                        <span>Logout</span>
                    {:else} 
                        <img src="/images/logout-icon.png" alt="Logout" class="logout-icon" />
                    {/if}
                </button>

                {#if !isMobile}  
                    <button class="toggle-btn" on:click={toggleSidebarDesktop} aria-label={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}>
                        {isCollapsed ? '→' : '←'}
                    </button>
                {/if}
            </div>

            {#if isMobile && isSidebarOpen}
                <div class="backdrop" on:click={closeSidebarMobile} aria-hidden="true"></div>
            {/if}
        {/if} <!-- End of #if layoutCurrentUser -->

        <main class="content {isMobile ? 'mobile' : (layoutCurrentUser && isCollapsed ? 'collapsed' : 'desktop')} {layoutCurrentUser ? '' : 'no-sidebar'}">
            <slot />
        </main>
        <ChatDrawer db={firebaseAppDb} currentUser={layoutCurrentUser} />
        <Notification message={$notificationStore.message} type={$notificationStore.type} show={$notificationStore.show} />
    </div>
{/if}

<style>
	:root {
		--sidebar-width-desktop: 11.6rem;
		--sidebar-width-collapsed: 4.22rem; 
		--sidebar-width-mobile: 250px;  
        --header-height-mobile: 56px; 
	
		--sidebar-bg-color: #1e3a66;  
		--sidebar-text-color: white;
		/* hover/active variants for visible feedback */
		--sidebar-hover-bg-color: #163153; /* slightly darker on hover */
		--sidebar-active-bg-color: #12273f; /* active/selected state */
		--content-bg-color: #f4f7f6;  
		--sidebar-transition: 0.3s ease-in-out;
	}

    .loading-screen {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        font-size: 1.2rem;
        color: #333;
    }

	.app-layout {
		min-height: 100vh;
		background-color: var(--content-bg-color);
	}

/* Mobile Header */
	.app-header {
		/* display: none; /* Controlled by #if isMobile in template */
		position: sticky; 
		top: 0;
		width: 100%;
		background-color: var(--sidebar-bg-color);
		color: var(--sidebar-text-color);
		padding: 0.75rem 1rem;
		height: var(--header-height-mobile);
		display: flex; 
		align-items: center;
		z-index: 900; 
		box-shadow: 0 2px 4px rgba(0,0,0,0.1);
	}
	.hamburger-btn {
		background: none; border: none; color: var(--sidebar-text-color); cursor: pointer;
		padding: 0.5rem; margin-right: 0.5rem;
	}
	.hamburger-btn svg { display: block; width: 24px; height: 24px; }
	/* .header-title { font-size: 1.1rem; font-weight: 500; margin-left: auto; margin-right: auto; } */


/* Sidebar General */
	.sidebar {
		position: fixed;
		top: 0; left: 0;
		background-color: var(--sidebar-bg-color);
		color: var(--sidebar-text-color);
		height: 100vh;
		display: flex;
		flex-direction: column;
		overflow-x: hidden; 
		overflow-y: auto;  
		box-shadow: 2px 0 5px rgba(0,0,0,0.2);
	}

/* Sidebar Header (User Info) */
	.sidebar-header {
		display: flex; flex-direction: column; align-items: center;
		padding: 20px 10px; /* Adjusted padding */
		flex-shrink: 0; 
		position: relative;
	}
	.sidebar-header .circle-background {
		display: flex; justify-content: center; align-items: center;
		background-color: white;
		border-radius: 50%;
		overflow: hidden;
		flex-shrink: 0;
		transition: width var(--sidebar-transition), height var(--sidebar-transition);
	}
	.sidebar-header .circle-background img {
		display: block; width: 100%; height: 100%; object-fit: cover;
	}
	.name-container {
		margin-top: 10px; display: flex; flex-direction: column; align-items: center;
		flex-shrink: 0; text-align: center;
	}
	.name-container span {
		margin-top: 2px; font-size: 0.9rem; white-space: nowrap;
        max-width: calc(var(--sidebar-width-desktop) - 40px); /* Prevent overflow */
        overflow: hidden; text-overflow: ellipsis;
	}
    .name-container span:last-child { font-size: 0.75rem; opacity: 0.8; text-transform: capitalize;}


/* Sidebar Menu Items */
	.sidebar-menu {
		list-style: none; padding: 0; margin: 0;
		padding-top: 0.5rem; /* Reduced */
		flex-grow: 1; 
	}
	.sidebar-menu li a {
		display: flex; align-items: center; text-decoration: none;
		color: var(--sidebar-text-color);
		width: 100%;
		padding: 10px 20px; /* Slightly less padding */
		white-space: nowrap; overflow: hidden; 
        transition: background-color 0.2s ease;
	}
	.sidebar-menu li a:hover { background-color: var(--sidebar-hover-bg-color); }
	.sidebar-menu li a.active { background-color: var(--sidebar-active-bg-color); font-weight: 500; }

	.sidebar-menu a .icon {
		width: 20px; height: 20px; /* Slightly smaller icons */
		flex-shrink: 0;
		transition: margin-right var(--sidebar-transition);
	}
	.sidebar-menu a .text {
		font-size: 0.9rem; /* Slightly smaller text */
		overflow: hidden; text-overflow: ellipsis;
		opacity: 1; 
		transition: opacity 0.1s ease 0.1s, width var(--sidebar-transition);  
		margin-left: 12px; /* Adjusted space */
	}

/* Logout & Toggle Buttons */
	.logout-btn {
		background-color: transparent;
		border: 1px solid rgba(255,255,255,0.3);
		color: var(--sidebar-text-color); cursor: pointer; font-size: 0.9rem;
		padding: 8px 15px; margin: 15px; margin-top: auto;  
		border-radius: 20px; text-align: center;
		transition: background-color 0.2s ease, padding var(--sidebar-transition), border-color 0.2s ease;
		display: flex; align-items: center; justify-content: center;
		flex-shrink: 0; gap: 8px;
	}
	.logout-btn:hover { background-color: var(--sidebar-hover-bg-color); border-color: var(--sidebar-hover-bg-color); }
	.logout-btn img.logout-icon { width: 16px; height: 16px; }  

	.toggle-btn {  
		display: none;  
		cursor: pointer; background-color: rgba(0,0,0,0.1); border: none;
		color: var(--sidebar-text-color); font-size: 1rem; padding: 8px 0;
		text-align: center; flex-shrink: 0; width: 100%;
		margin-top: 10px;  
	}
	.toggle-btn:hover { background-color: rgba(0,0,0,0.2); }

	@media (max-width: 767px) {
		.sidebar {
			width: var(--sidebar-width-mobile);
			transform: translateX(-100%); 
			z-index: 1000; 
			transition: transform var(--sidebar-transition);
		}
		.sidebar.open { transform: translateX(0); }  

		.sidebar-header .circle-background { width: 60px; height: 60px; margin-top: 20px; }  
        .name-container span { max-width: calc(var(--sidebar-width-mobile) - 40px); }
		.sidebar-menu a .text { opacity: 1; width: auto; margin-left: 12px; }  

		.logout-btn { justify-content: flex-start; padding: 10px 20px; }  
		.logout-btn span { display: inline; }

		.content.mobile {
			margin-left: 0;
			
			width: 100%;
		}
		.close-sidebar-btn {
			position: absolute; top: 5px; right: 10px;
			background: none; border: none; color: rgba(255,255,255,0.7);
			font-size: 1.8rem; cursor: pointer; padding: 5px; line-height: 1;
			display: block; z-index: 10;
		}
		.close-sidebar-btn:hover { color: var(--sidebar-text-color); }

		.backdrop {
			position: fixed; top: 0; left: 0; width: 100%; height: 100%;
			background-color: rgba(0,0,0,0.5); z-index: 999;
			opacity: 0; visibility: hidden;
			transition: opacity var(--sidebar-transition), visibility 0s linear var(--sidebar-transition);  
		}
		.sidebar.open ~ .backdrop {  
			opacity: 1; visibility: visible;
			transition: opacity var(--sidebar-transition), visibility 0s linear 0s; 
		}
	}

	@media (min-width: 768px) {
		.app-header { display: none; }
		.close-sidebar-btn { display: none; }
		.backdrop { display: none; }

		.sidebar {  
			transform: none; 
			width: var(--sidebar-width-desktop);
			z-index: 50; 
			transition: width var(--sidebar-transition);
		}
		.sidebar.collapsed { 
			width: var(--sidebar-width-collapsed);
		}
		.sidebar-header .circle-background { width: 70px; height: 70px; }  
		.sidebar.collapsed .sidebar-header .circle-background { width: 40px; height: 40px; }  
        .name-container span { max-width: calc(var(--sidebar-width-desktop) - 40px); }
        .sidebar.collapsed .name-container { display: none; }  


		.sidebar.collapsed .sidebar-menu a {
			justify-content: center; padding: 12px 10px;  
		}
		.sidebar.collapsed .sidebar-menu a .icon { margin-right: 0; }
		.sidebar.collapsed .sidebar-menu a .text {
			opacity: 0; width: 0; margin-left: 0;
            transition-delay: 0s;  
		}

		.logout-btn span { display: inline; }  
		.sidebar.collapsed .logout-btn {
			width: auto; padding: 8px; margin: 15px auto;  
		}
		.sidebar.collapsed .logout-btn span { display: none; } 

		.content { 
			padding-top: 0; 
			transition: margin-left var(--sidebar-transition);
		}
        .content.desktop { margin-left: var(--sidebar-width-desktop); } 
		.content.collapsed { margin-left: var(--sidebar-width-collapsed); }  
        .content.no-sidebar { margin-left: 0 !important; } 

		.toggle-btn { display: block; }  
	}
</style>