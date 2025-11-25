<script lang="ts">
  import { onMount } from 'svelte';
  import { getFirestore, collection, getDocs } from 'firebase/firestore';
  import { initializeApp } from 'firebase/app';
  import { firebaseConfig } from '$lib/firebaseConfig';

  let db: ReturnType<typeof getFirestore>;
  try {
      const app = initializeApp(firebaseConfig);
      db = getFirestore(app);
  } catch (e: any) {
      db = getFirestore();
  }

  let payments: any[] = [];
  let loading = true;

  interface PatientProfile {
    id: string;
    name: string;
    lastName: string;
    age: number;
    email: string;
  }
  let patientProfiles: PatientProfile[] = [];

  async function fetchPatientProfiles() {
    const profilesRef = collection(db, 'patientProfiles');
    const querySnapshot = await getDocs(profilesRef);
    patientProfiles = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name || '',
        lastName: data.lastName || '',
        age: data.age || 0,
        email: data.email || ''
      } as PatientProfile;
    });
  }

  onMount(async () => {
    loading = true;
    await fetchPatientProfiles();
    const appointmentsRef = collection(db, 'appointments');
    const snapshot = await getDocs(appointmentsRef);
    payments = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as Record<string, any>))
      .filter(app => app.paymentStatus === 'paid')
      .map(app => {
        const patient = patientProfiles.find(p => p.id === app.patientId);
        return {
          ...app,
          patientName: patient ? `${patient.name} ${patient.lastName}`.trim() : 'Unknown Patient',
          patientAge: patient?.age || '',
          patientEmail: patient?.email || ''
        };
      });
    loading = false;
  });
</script>

<div class="bg-gradient-to-br from-blue-50 via-white to-gray-100 min-h-screen">
    <div class="max-w-6xl mx-auto p-4 sm:p-6">
        <h1 class="text-2xl sm:text-3xl font-extrabold mb-6 sm:mb-8 text-blue-800 tracking-tight flex items-center gap-2 sm:gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 sm:h-7 sm:w-7 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            All Payments
        </h1>

        {#if loading}
            <div class="text-center py-4">
                <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
                <p class="mt-2 text-gray-600">Loading payments...</p>
            </div>
        {:else if payments.length === 0}
            <div class="bg-white rounded-lg shadow-lg p-6 text-center">
                <p class="text-gray-500">No paid appointments found.</p>
            </div>
        {:else}
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {#each payments as payment}
                    <div class="bg-white rounded-lg shadow-lg hover:shadow-xl transition-all p-4 sm:p-5">
                        {#if payment.cancellationStatus === 'requested'}
                            <span class="inline-block px-2 py-1 rounded bg-yellow-100 text-yellow-800 text-xs font-semibold mb-2">
                                Refund Requested
                            </span>
                        {/if}
                        <div class="flex items-center gap-3 mb-2">
                            <div class="flex-1">
                                <p class="font-semibold text-lg text-gray-800">{payment.patientName}</p>
                                {#if payment.patientAge}
                                    <p class="text-sm text-gray-500">Age: {payment.patientAge}</p>
                                {/if}
                                {#if payment.patientEmail}
                                    <p class="text-sm text-gray-500">Email: {payment.patientEmail}</p>
                                {/if}
                            </div>
                            <span class="inline-block px-2 py-1 rounded bg-green-100 text-green-800 text-xs font-semibold">Paid</span>
                        </div>
                        <div class="text-sm text-gray-700 space-y-1">
                            <div class="flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <span><span class="font-medium">Date:</span> {payment.date}</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span><span class="font-medium">Time:</span> {payment.time}</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                                <span><span class="font-medium">Service:</span> {payment.service}</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span><span class="font-medium">Amount:</span> {payment.amount || payment.paymentAmount || '-'}</span>
                            </div>
                            {#if payment.cancellationStatus}
                                <div class="flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span>
                                        <span class="font-medium">Refund Status:</span>
                                        <span class="ml-1 px-2 py-1 rounded
                                            {payment.cancellationStatus === 'requested' ? 'bg-yellow-100 text-yellow-800' : ''}
                                            {payment.cancellationStatus === 'Approved' ? 'bg-green-100 text-green-800' : ''}
                                            {payment.cancellationStatus === 'Declined' ? 'bg-red-100 text-red-800' : ''}
                                        ">
                                            {payment.cancellationStatus === 'requested' ? 'Refund Requested'
                                                : payment.cancellationStatus === 'Approved' ? 'Refund Approved'
                                                : payment.cancellationStatus === 'Declined' ? 'Refund Declined'
                                                : payment.cancellationStatus}
                                        </span>
                                    </span>
                                </div>
                            {/if}
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
    </div>
</div>

<style>
    .grid { display: grid; }
</style> 