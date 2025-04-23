<script>
    // @ts-nocheck
    import { Label, Input } from 'flowbite-svelte';
    import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
    import { firebaseConfig } from "$lib/firebaseConfig";
    import { initializeApp, getApps, getApp } from "firebase/app";
    import { getFirestore, doc, setDoc } from "firebase/firestore"; 
    import { goto } from '$app/navigation';
    import { page } from '$app/stores'; 
    import { onMount } from 'svelte'; 

    const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    const auth = getAuth(app);
    const db = getFirestore(app); 

    let email = '';
    let password = '';
    let confirmPassword = '';
    let registrationMessage = '';
    let determinedRole = 'patient';
    let registrationTitle = 'USER REGISTRATION'; 

    const allowedRoles = ['dentist', 'patient', 'superuser', 'admin', 'secretary'];

    const roleMapping = {
        dentist: 'userDentist',
        patient: 'userPatient',
        superuser: 'userSuper',
        admin: 'userAdmin',
        secretary: 'userSecretary'
    };

    onMount(() => {
        const urlParams = $page.url.searchParams;
        const roleParam = urlParams.get('role')?.toLowerCase(); 

        if (roleParam && allowedRoles.includes(roleParam)) {
            determinedRole = roleParam;
            registrationTitle = `${roleParam.toUpperCase()} REGISTRATION`;
        } else {
        
            determinedRole = 'patient';
            registrationTitle = 'PATIENT REGISTRATION';
            if (roleParam) {
                 console.warn(`Invalid or unsupported role specified in URL: '${roleParam}'. Defaulting to 'patient'.`);
               
            }
        }
        console.log("Determined role for registration:", determinedRole); 
    });

    async function handleRegistration() {
        if (password !== confirmPassword) {
            registrationMessage = "Passwords do not match.";
            return;
        }
        if (!determinedRole || !roleMapping[determinedRole]) {
             registrationMessage = "Cannot determine user role for registration.";
             return;
        }

        const firestoreRole = roleMapping[determinedRole]; 

        try {
            registrationMessage = "Registering..."; 
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            const userData = {
                email: user.email,
                role: firestoreRole,
                createdAt: new Date().toISOString(),
                uid: user.uid 
     
            };

            if (firestoreRole === 'userPatient') {
                 const patientId = `patient_${user.uid}`;
                 userData.patientId = patientId;
            }
       
            await setDoc(doc(db, "users", user.uid), userData);

            registrationMessage = `Registration successful as ${determinedRole}! Welcome, ${user.email}`;

            let redirectPath = '/'; 
            switch(firestoreRole) {
                case 'userPatient':
                    redirectPath = '/patient/profile'; 
                    break;
                case 'userDentist':
                    redirectPath = '/dashboard'; 
                    break;
                case 'userAdmin':
                    redirectPath = '/admin/panel'; 
                    break;
                 case 'userSecretary':
                    redirectPath = '/secretary/dashboard'; 
                    break;
                 case 'userSuper':
                     redirectPath = '/superuser/panel';
                     break;
                default:
                    redirectPath = '/auth/profile'; 
            }

            setTimeout(() => goto(redirectPath), 1500);

        } catch (error) {
            console.error("Registration Error:", error);
            registrationMessage = "Registration failed: " + error.message;
        }
    }
</script>

<div class="min-h-screen bg-gradient-to-r from-[#094361] to-[#128AC7] flex items-center justify-center">
    <div class="bg-white p-8 rounded-lg shadow-lg w-full max-w-md">
        <div class="flex items-center mb-4">
            <img src="/images/lock.png" alt="Lock Icon" class="w-12 h-12 mr-4" />
            <!-- Use the dynamic registration title -->
            <h2 class="text-3xl font-semibold text-gray-800">{registrationTitle}</h2>
        </div>

        <!-- Email field -->
        <div class="mb-6">
            <Label for="email" class="block mb-2">Email</Label>
            <Input
                type="email"
                id="email"
                placeholder="Enter your email"
                class="border p-2 w-full"
                bind:value={email}
                required
            />
        </div>

        <!-- Password field -->
        <div class="mb-6">
            <Label for="password" class="block mb-2">Password</Label>
            <Input
                type="password"
                id="password"
                placeholder="Enter your password"
                class="border p-2 w-full"
                bind:value={password}
                required
            />
        </div>

        <!-- Confirm Password field -->
        <div class="mb-6">
            <Label for="confirmPassword" class="block mb-2">Confirm Password</Label>
            <Input
                type="password"
                id="confirmPassword"
                placeholder="Confirm your password"
                class="border p-2 w-full"
                bind:value={confirmPassword}
                required
            />
        </div>

        <!-- Register button -->
        <div class="mb-6">
            <button
                type="submit"
                class="w-full p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-300"
                on:click={handleRegistration}
            >
                Register as {determinedRole} 
            </button>
        </div>

        <div class="text-center pt-2">
            <span class="text-sm text-gray-600">Already have an account?</span>
            <a href="/login" class="ml-1 text-sm font-medium text-blue-600 hover:text-blue-500">
              Sign in
            </a>
        </div>
        {#if registrationMessage}
          <p class:text-red-500={registrationMessage.toLowerCase().includes('fail') || registrationMessage.toLowerCase().includes('match') || registrationMessage.toLowerCase().includes('error')}
             class:text-green-500={registrationMessage.toLowerCase().includes('success')}
             class="text-center mt-4">{registrationMessage}</p>
        {/if}
    </div>
</div>