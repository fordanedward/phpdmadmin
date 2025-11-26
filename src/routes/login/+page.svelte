<script lang="ts">
    // @ts-nocheck
    import Swal from 'sweetalert2'; 
    import { Label, Input, Button as FlowbiteButton, Toast } from 'flowbite-svelte'; 
    import {
        GoogleSolid,
        CheckOutline,
        CloseOutline,
        ExclamationCircleOutline,
        InfoCircleOutline
    } from "flowbite-svelte-icons";
    import {
        getAuth,
        signInWithEmailAndPassword,
        GoogleAuthProvider,
        signInWithPopup
    } from 'firebase/auth';
    import { firebaseConfig } from "$lib/firebaseConfig";
    import { initializeApp, getApps, getApp } from "firebase/app";
    import { getFirestore, doc, getDoc, setDoc, collection, query, where, getDocs, Timestamp } from "firebase/firestore";
    import { goto } from '$app/navigation';
    import { onMount } from 'svelte';

    const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    const auth = getAuth(app);
    const db = getFirestore(app);

    let emailOrAdminId = '';
    let password = '';
    let showPassword = false;
    let rememberMe = false;

    type ToastTypeFB = 'info' | 'success' | 'warning' | 'error'; 
    let toastVisibleFB: boolean = false;
    let toastMessageFB: string = '';
    let toastTypeFB: ToastTypeFB = 'info';
    let toastDurationFB: number = 3000;
    let toastTimeoutIdFB: number | null = null;

    let isLoggingIn = false;
    let isGoogleLoggingIn = false;
    let isPageLoaded = false;

    function showAppToast(message: string, type: ToastTypeFB = 'info', duration: number = 3000) {
        toastMessageFB = message;
        toastTypeFB = type;
        toastVisibleFB = true;
        toastDurationFB = duration;
        if (toastTimeoutIdFB !== null) clearTimeout(toastTimeoutIdFB);
        if (duration > 0) {
            toastTimeoutIdFB = window.setTimeout(() => {
                toastVisibleFB = false;
                toastTimeoutIdFB = null;
            }, duration);
        }
    }

    onMount(() => {
        if (typeof localStorage !== 'undefined' && localStorage.getItem('rememberMe') === 'true') {
            emailOrAdminId = localStorage.getItem('emailOrAdminId') || '';
            password = localStorage.getItem('password') || '';
            rememberMe = true;
        }
        
        // Trigger page load animation
        setTimeout(() => {
            isPageLoaded = true;
        }, 100);
    });

    async function processSuccessfulLogin(user: any, providerId: string) {
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();

            // Block login if account status is not active
            if (userData.status && String(userData.status).toLowerCase() !== 'active') {
                Swal.fire({
                    icon: 'error',
                    title: 'Account Inactive',
                    text: 'Your account is currently inactive. Please contact an administrator for assistance.',
                    showConfirmButton: true
                });
                await auth.signOut();
                return false;
            }

            // Check if user has admin role (userAdmin, userDentist, userSecretary, userSuper)
            if (userData.role !== 'userAdmin' && userData.role !== 'userDentist' && userData.role !== 'userSecretary' && userData.role !== 'userSuper') {
                Swal.fire({
                    icon: 'error',
                    title: 'Access Denied',
                    text: `This login is for admin users only. Your role is ${userData.role}.`,
                    showConfirmButton: true
                });
                await auth.signOut();
                return false;
            }

            await setDoc(userDocRef, {
                lastLoginAt: new Date().toISOString(),
                ...(providerId === 'google.com' && {
                    displayName: user.displayName || userData.displayName,
                    photoURL: user.photoURL || userData.photoURL,
                })
            }, { merge: true });

            // Create welcome message with ID number if available
            const welcomeName = userData.displayName || user.email;
            const idNumber = userData.customUserId ? ` (ID: ${userData.customUserId})` : '';
            
            Swal.fire({
                icon: 'success',
                title: 'Login Successful',
                text: `Welcome, ${welcomeName}${idNumber}`,
                showConfirmButton: false,
                timer: 2000,
                customClass: { popup: 'swal-custom' }
            });

            if (rememberMe && providerId === 'password') {
                localStorage.setItem('emailOrAdminId', emailOrAdminId);
                localStorage.setItem('password', password);
                localStorage.setItem('rememberMe', 'true');
            } else if (providerId === 'password') {
                localStorage.removeItem('emailOrAdminId');
                localStorage.removeItem('password');
                localStorage.removeItem('rememberMe');
            }

            setTimeout(() => {
                goto('/dashboard');
            }, 2000); 
            return true;

        } else {
            Swal.fire({
                icon: 'error',
                title: 'Profile Not Found',
                text: 'Your account exists, but your admin profile is missing. Please complete registration or contact support.',
                showConfirmButton: true
            });
            await auth.signOut();
            return false; 
        }
    }

    async function handleLogin() { 
        if (!emailOrAdminId.trim() || !password.trim()) {
            Swal.fire({ icon: 'warning', title: 'Input Required', text: 'Please enter both Admin ID/Email and password.', showConfirmButton: true });
            return;
        }
        isLoggingIn = true;

        try {
            let emailToUse = emailOrAdminId.trim();
            let isAdminIdLogin = false;
            
            // Check if input is a 5-digit Admin ID
            if (/^\d{5}$/.test(emailToUse)) {
                isAdminIdLogin = true;
                console.log('Attempting login with Admin ID:', emailToUse);
                
                // Query Firestore to find user with this customUserId
                const usersRef = collection(db, "users");
                const q = query(usersRef, where("customUserId", "==", emailToUse));
                const querySnapshot = await getDocs(q);
                
                if (querySnapshot.empty) {
                    console.log('Admin ID not found in database');
                    Swal.fire({
                        icon: 'error',
                        title: 'Admin ID Not Found',
                        text: 'No account found with this Admin ID. Please check and try again.',
                        showConfirmButton: true
                    });
                    isLoggingIn = false;
                    return;
                }
                
                // Get the email from the found user document
                const userDoc = querySnapshot.docs[0];
                const userData = userDoc.data();
                emailToUse = userData.email;
                
                console.log('Admin ID found, associated email:', emailToUse);
                
                if (!emailToUse) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Error',
                        text: 'Account found but email is missing. Please contact support.',
                        showConfirmButton: true
                    });
                    isLoggingIn = false;
                    return;
                }
            }

            console.log('Attempting Firebase authentication with email:', emailToUse);
            const userCredential = await signInWithEmailAndPassword(auth, emailToUse, password);
            console.log('Firebase authentication successful');
            await processSuccessfulLogin(userCredential.user, 'password');
        } catch (error) {
            console.error('Error during login:', error);
            console.error('Error code:', error.code);
            console.error('Error message:', error.message);
            
            let errorMessage = 'An error occurred. Please try again.';
            let isAdminIdLogin = /^\d{5}$/.test(emailOrAdminId.trim());
            
            if (error.code) {
                switch (error.code) {
                    case 'auth/invalid-credential':
                    case 'auth/user-not-found':
                    case 'auth/wrong-password':
                        errorMessage = isAdminIdLogin 
                            ? 'Admin ID found but password is incorrect. Please check your password and try again.'
                            : 'Invalid email or password. Please try again.';
                        break;
                    case 'auth/invalid-email':
                        errorMessage = 'The email address is not valid.';
                        break;
                    case 'auth/user-disabled':
                        errorMessage = 'This account has been disabled.';
                        break;
                    case 'auth/too-many-requests':
                        errorMessage = "Access temporarily disabled due to many failed login attempts.";
                        break;
                    case 'permission-denied':
                    case 'firestore/permission-denied':
                        errorMessage = 'Database permission error. Please verify Firestore rules allow querying by customUserId.';
                        break;
                    default: 
                        errorMessage = `An error occurred: ${error.message}. Please try again.`;
                }
            }
            Swal.fire({
                icon: 'error',
                title: 'Login Failed',
                text: errorMessage,
                showConfirmButton: true
            });
        } finally {
            isLoggingIn = false;
        }
    }

    async function handleGoogleLogin() {
        isGoogleLoggingIn = true;
        const provider = new GoogleAuthProvider();
        try {
            const result = await signInWithPopup(auth, provider);
            const success = await processSuccessfulLogin(result.user, 'google.com');
            if (!success) {
              
            }
        } catch (err: any) {
            console.error("Google Login Error:", err);
            let userFriendlyMessage = "Failed to sign in with Google. Please try again.";
            if (err.code) {
                switch (err.code) {
                    case 'auth/popup-closed-by-user':
                        userFriendlyMessage = "Google Sign-In cancelled.";
                        break;
                    case 'auth/account-exists-with-different-credential':
                        userFriendlyMessage = "An account may already exist with this email using a different sign-in method.";
                        break;
                    case 'auth/popup-blocked':
                        userFriendlyMessage = "Google Sign-In popup was blocked. Please allow popups.";
                        break;
                    default:
                        userFriendlyMessage = "Google Sign-In failed. Please try again later.";
                }
            }
            Swal.fire({ icon: 'error', title: 'Google Sign-In Failed', text: userFriendlyMessage, showConfirmButton: true });
        } finally {
            isGoogleLoggingIn = false;
           
        }
    }

</script>

<style>
:global(body, html) {
    margin: 0;
    padding: 0;
    height: 100%;
}

/* Animation styles */
.login-container {
    opacity: 0;
    transform: translateY(30px) scale(0.95);
    transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.login-container.loaded {
    opacity: 1;
    transform: translateY(0) scale(1);
}

.login-form {
    opacity: 0;
    transform: translateY(20px);
    transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1) 0.2s;
}

.login-form.loaded {
    opacity: 1;
    transform: translateY(0);
}

.login-logo {
    opacity: 0;
    transform: scale(0.8) rotate(-5deg);
    transition: all 0.7s cubic-bezier(0.4, 0, 0.2, 1) 0.1s;
}

.login-logo.loaded {
    opacity: 1;
    transform: scale(1) rotate(0deg);
}

.login-title {
    opacity: 0;
    transform: translateY(15px);
    transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1) 0.3s;
}

.login-title.loaded {
    opacity: 1;
    transform: translateY(0);
}

.form-field {
    opacity: 0;
    transform: translateX(-20px);
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.form-field.loaded {
    opacity: 1;
    transform: translateX(0);
}

.form-field:nth-child(1) { transition-delay: 0.4s; }
.form-field:nth-child(2) { transition-delay: 0.5s; }
.form-field:nth-child(3) { transition-delay: 0.6s; }
.form-field:nth-child(4) { transition-delay: 0.7s; }
.form-field:nth-child(5) { transition-delay: 0.8s; }
.form-field:nth-child(6) { transition-delay: 0.9s; }

.login-button {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
    transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1) 1s;
}

.login-button.loaded {
    opacity: 1;
    transform: translateY(0) scale(1);
}

.google-button {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
    transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1) 1.1s;
}

.google-button.loaded {
    opacity: 1;
    transform: translateY(0) scale(1);
}

.register-link {
    opacity: 0;
    transform: translateY(15px);
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1) 1.2s;
}

.register-link.loaded {
    opacity: 1;
    transform: translateY(0);
}

@media (max-width: 768px) {
    :global(.swal-custom) { 
        width: 80% !important;
        font-size: 0.9rem !important;
    }
}

@media (max-width: 480px) {
    :global(.swal-custom) {
        width: 90% !important;
        font-size: 0.8rem !important;
    }
}
</style>

{#if toastVisibleFB} 
    <div class="fixed top-5 right-5 z-50">
        <Toast
            color={toastTypeFB === 'success' ? 'green' : toastTypeFB === 'error' ? 'red' : toastTypeFB === 'warning' ? 'yellow' : 'blue'}
            dismissable
            on:close={() => { toastVisibleFB = false; if (toastTimeoutIdFB !== null) clearTimeout(toastTimeoutIdFB); }}
        >
            <svelte:fragment slot="icon">
                {#if toastTypeFB === 'success'} <CheckOutline class="h-5 w-5" />
                {:else if toastTypeFB === 'error'} <CloseOutline class="h-5 w-5" />
                {:else if toastTypeFB === 'warning'} <ExclamationCircleOutline class="h-5 w-5" />
                {:else} <InfoCircleOutline class="h-5 w-5" /> {/if}
            </svelte:fragment>
            {toastMessageFB}
        </Toast>
    </div>
{/if}

<div class="min-h-screen bg-[#ffbc22] flex items-center justify-center px-4 sm:px-8 md:px-16 lg:px-24">
    <div class="login-container {isPageLoaded ? 'loaded' : ''} bg-white p-8 rounded-lg shadow-lg w-full max-w-md"> 
        <div class="flex flex-col items-center mb-4">
            <img src="/images/digital member portal.png" alt="PHPDGM Icon" class="login-logo {isPageLoaded ? 'loaded' : ''} w-24 h-24 mb-2" />
            <h2 class="login-title {isPageLoaded ? 'loaded' : ''} text-3xl font-semibold text-gray-800 text-center">Welcome Admin!</h2>
          </div>
          

        <div class="login-form {isPageLoaded ? 'loaded' : ''}">
            <div class="form-field {isPageLoaded ? 'loaded' : ''} mb-6">
                <Label for="emailOrAdminId" class="block mb-2">Email</Label>
                <Input
                    type="text"
                    id="emailOrAdminId"
                    placeholder="Enter your 5-digit Admin ID or email"
                    class="border p-2 w-full"
                    bind:value={emailOrAdminId}
                    required
                />
            </div>

            <!-- Password field -->
            <div class="form-field {isPageLoaded ? 'loaded' : ''} mb-6">
                <Label for="password" class="block mb-2">Password</Label>
                <div class="relative">
                    <Input
                        type={showPassword ? 'text' : 'password'}
                        id="password"
                        placeholder="Enter your password"
                        class="border p-2 w-full"
                        bind:value={password}
                        required
                    />
                    <button
                        type="button"
                        class="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-600 focus:outline-none"
                        on:click={() => showPassword = !showPassword}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                        {#if showPassword}
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19.5c-5.162 0-9.246-3.697-10.125-8.55a1.286 1.286 0 010-.9c.879-4.853 4.963-8.55 10.125-8.55a10.05 10.05 0 011.875.175M15 12a3 3 0 11-6 0 3 3 0 016 0zm6-6.75L4.5 19.5" />
                            </svg>
                        {:else}
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                        {/if}
                    </button>
                </div>
            </div>

            <div class="form-field {isPageLoaded ? 'loaded' : ''} mb-6 flex items-center">
                <input
                    type="checkbox"
                    id="remember"
                    class="mr-2"
                    bind:checked={rememberMe}
                />
                <label for="remember" class="text-gray-600">Remember me</label>
            </div>

            <div class="login-button {isPageLoaded ? 'loaded' : ''} mb-6">
                <button
                    type="button" 
                    class="w-full p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-300"
                    on:click={handleLogin}
                    disabled={isLoggingIn}
                >
                    {isLoggingIn ? 'Logging in...' : 'Login'}
                </button>
            </div>

            <div class="my-6 flex items-center">
                <hr class="flex-grow border-gray-300">
                <span class="mx-4 text-gray-500 text-sm">OR</span>
                <hr class="flex-grow border-gray-300">
            </div>

            <div class="google-button {isPageLoaded ? 'loaded' : ''} mb-6">
                <FlowbiteButton
                    on:click={handleGoogleLogin}
                    disabled={isGoogleLoggingIn}
                    color="light" 
                    class="w-full flex items-center justify-center"
                >
                    <GoogleSolid class="w-5 h-10 mr-2" />
                    {isGoogleLoggingIn ? 'Connecting...' : 'Sign in with Google'}
                </FlowbiteButton>
            </div>

            <div class="register-link {isPageLoaded ? 'loaded' : ''} text-center">
                <p class="text-gray-600 mb-2">Need admin access?</p>
                <a href="/register" class="ml-1 text-sm font-medium text-blue-600 hover:text-blue-500">
                    Register
                </a>
            </div>
        </div>
    </div>
</div>