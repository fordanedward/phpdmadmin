<script lang="ts">
    import { Label, Input, Toast, Button } from 'flowbite-svelte';
    import {
        CheckOutline,
        CloseOutline,
        InfoCircleOutline,
        ExclamationCircleOutline,
        GoogleSolid
    } from "flowbite-svelte-icons";
    import {
        getAuth,
        signInWithEmailAndPassword,
        GoogleAuthProvider,
        signInWithPopup,
        signOut 
    } from 'firebase/auth';
    import { firebaseConfig } from "$lib/firebaseConfig";
    import { initializeApp, getApps, getApp } from "firebase/app";
    import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";  
    import { goto } from '$app/navigation';
    import { page } from '$app/stores'; 
    import { onMount } from 'svelte';

    type AllowedRoleLogin = 'dentist' | 'admin' | 'secretary' | 'user';  
    type FirestoreRole = 'userDentist' | 'userAdmin' | 'userSecretary' | 'userPatient' | 'userSuper';  
    type ToastType = 'info' | 'success' | 'warning' | 'error';

    const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    const auth = getAuth(app);
    const db = getFirestore(app);

    let email: string = '';
    let password: string = '';

    // Toast State
    let toastVisible: boolean = false;
    let toastMessage: string = '';
    let toastType: ToastType = 'info';
    let toastDuration: number = 3000;
    let toastTimeoutId: number | null = null;

    let isLoggingIn = false;
    let isGoogleLoggingIn = false; 

    function showToast(message: string, type: ToastType = 'info', duration: number = 3000) {
        toastMessage = message;
        toastType = type;
        toastVisible = true;
        toastDuration = duration;
        if (toastTimeoutId !== null) clearTimeout(toastTimeoutId);
        if (duration > 0) {
            toastTimeoutId = window.setTimeout(() => {
                toastVisible = false;
                toastTimeoutId = null;
            }, duration);
        }
    }

    function getRedirectPath(firestoreRole: FirestoreRole | string | undefined): string {
        switch(firestoreRole) {
            case 'userDentist': return '/dashboard';
           // case 'userAdmin': return '/admin/panel';
            case 'userSecretary': return '/dashboard';
           // case 'userPatient': return '/patient/profile'; 
           // case 'userSuper': return '/superuser/panel';
            default:
                console.warn(`Unknown or undefined role '${firestoreRole}' for redirection. Redirecting to generic profile.`);
                return '/auth/profile'; 
        }
    }

    onMount(() => {
        const urlParams = $page.url.searchParams;
        const roleParam = urlParams.get('role')?.toLowerCase();

        if (roleParam && (['dentist', 'secretary'] as readonly string[]).includes(roleParam)) {
            console.warn(`Invalid or unsupported role in login URL: '${roleParam}'. Using generic login title.`);
        }
    });

    async function processSuccessfulLogin(user: any, providerId: string = 'password') {
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            if (userData.role !== 'userDentist' && userData.role !== 'userSecretary') {
                showToast("Access denied. Only dentist and secretary accounts can log in.", "error", 6000);
                await signOut(auth);
                return;
            }
            await setDoc(userDocRef, {
                lastLoginAt: new Date().toISOString(),
                ...(providerId === 'google.com' && {
                    displayName: user.displayName || userData.displayName,
                    photoURL: user.photoURL || userData.photoURL,
                })
            }, { merge: true });

            showToast(`Login successful! Welcome back, ${userData.displayName || user.email}`, "success", 3000);
            const redirectPath = getRedirectPath(userData.role);
            window.setTimeout(() => {
                goto(redirectPath);
                toastVisible = false;
            }, 1500);
        } else {
            console.error(`User ${user.uid} authenticated but not found in Firestore. This shouldn't happen.`);
            showToast("Login successful, but user profile not found. Please contact support.", "error", 6000);
        }
    }

    async function handleEmailPasswordLogin() {
        if (!email || !password) {
            showToast("Please enter both email and password.", "warning");
            return;
        }
        isLoggingIn = true;
        showToast("Logging in...", "info", 0);
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            await processSuccessfulLogin(userCredential.user);
        } catch (err: any) {
            console.error("Email/Pass Login Error:", err);
            let userFriendlyMessage = "Login failed. Please check your credentials and try again.";
            if (err.code) {
                switch (err.code) {
                    case 'auth/user-not-found':
                    case 'auth/wrong-password':
                        userFriendlyMessage = "Invalid email or password. Please try again.";
                        break;
                    case 'auth/invalid-email':
                        userFriendlyMessage = "The email address format is not valid.";
                        break;
                    case 'auth/user-disabled':
                        userFriendlyMessage = "This account has been disabled. Please contact support.";
                        break;
                    case 'auth/too-many-requests':
                         userFriendlyMessage = "Access to this account has been temporarily disabled due to many failed login attempts. You can immediately restore it by resetting your password or you can try again later.";
                         break;
                    default:
                        userFriendlyMessage = "Login failed. Please try again later.";
                }
            }
            showToast(userFriendlyMessage, "error", 6000);
        } finally {
            isLoggingIn = false;
            if (toastMessage === "Logging in...") toastVisible = false;
        }
    }

    async function handleGoogleLogin() {
        isGoogleLoggingIn = true;
        showToast("Connecting to Google...", "info", 0);
        const provider = new GoogleAuthProvider();
        try {
            const result = await signInWithPopup(auth, provider);
            await processSuccessfulLogin(result.user, 'google.com');
        } catch (err: any) {
            console.error("Google Login Error:", err);
            let userFriendlyMessage = "Failed to sign in with Google. Please try again.";
            if (err.code) {
                switch (err.code) {
                    case 'auth/popup-closed-by-user':
                        userFriendlyMessage = "Google Sign-In cancelled.";
                        break;
                    case 'auth/account-exists-with-different-credential':
                        userFriendlyMessage = "An account with this email may exist with a different sign-in method.";
                        break;
                    case 'auth/popup-blocked':
                        userFriendlyMessage = "Google Sign-In popup was blocked. Please allow popups.";
                        break;
                    default:
                        userFriendlyMessage = "Google Sign-In failed. Please try again later.";
                }
            }
            showToast(userFriendlyMessage, "error", 6000);
        } finally {
            isGoogleLoggingIn = false;
            if (toastMessage === "Connecting to Google...") toastVisible = false;
        }
    }

</script>

{#if toastVisible}
    <div class="fixed top-5 right-5 z-50">
       
        <Toast
            color={toastType === 'success' ? 'green' : toastType === 'error' ? 'red' : toastType === 'warning' ? 'yellow' : 'blue'}
            dismissable
            on:close={() => { toastVisible = false; if (toastTimeoutId !== null) clearTimeout(toastTimeoutId); }}
        >
            <svelte:fragment slot="icon">
                {#if toastType === 'success'} <CheckOutline class="h-5 w-5" />
                {:else if toastType === 'error'} <CloseOutline class="h-5 w-5" />
                {:else if toastType === 'warning'} <ExclamationCircleOutline class="h-5 w-5" />
                {:else} <InfoCircleOutline class="h-5 w-5" /> {/if}
            </svelte:fragment>
            {toastMessage}
        </Toast>
    </div>
{/if}

<div class="min-h-screen bg-gradient-to-r from-[#094361] to-[#128AC7] flex items-center justify-center px-4 py-8">
    <div class="bg-white p-8 rounded-lg shadow-lg w-full max-w-md">
        <div class="flex items-center mb-6">
            <img src="/images/lock.png" alt="Lock Icon" class="w-12 h-12 mr-4" />
            <h2 class="text-3xl font-semibold text-gray-800">LOGIN</h2>
        </div>

        <form on:submit|preventDefault={handleEmailPasswordLogin}>
            <div class="mb-6">
                <Label for="email-login" class="block mb-2">Email</Label>
                <Input type="email" id="email-login" placeholder="name@example.com" class="border p-2 w-full" bind:value={email} required />
            </div>

            <div class="mb-6">
                <Label for="password-login" class="block mb-2">Password</Label>
                <Input type="password" id="password-login" placeholder="••••••••" class="border p-2 w-full" bind:value={password} required />
            </div>

            <div class="mb-6">
                <Button type="submit" disabled={isLoggingIn} class="w-full p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                    {isLoggingIn ? 'Logging in...' : 'Login'}
                </Button>
            </div>
        </form>

        <div class="my-6 flex items-center">
            <hr class="flex-grow border-gray-300">
            <span class="mx-4 text-gray-500 text-sm">OR</span>
            <hr class="flex-grow border-gray-300">
        </div>

        <div class="mb-6">
            <Button
                on:click={handleGoogleLogin}
                disabled={isGoogleLoggingIn}
                color="light"
                class="w-full p-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300 flex items-center justify-center"
            >
                <GoogleSolid class="w-5 h-5 mr-2" />
                {isGoogleLoggingIn ? 'Connecting...' : 'Sign in with Google'}
            </Button>
        </div>

        <div class="text-center text-sm">
            Don't have an account?
            <a href="/register" class="font-medium text-blue-600 hover:underline">
                Sign up
            </a>
        </div>
        <!-- <div class="text-center text-sm mt-2">
            <a href="/forgot-password" class="font-medium text-sm text-blue-600 hover:underline">
                Forgot password?
            </a>
        </div>-->
    </div>
</div>