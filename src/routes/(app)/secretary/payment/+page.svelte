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

<div class="p-6">
  <h1 class="text-2xl font-bold mb-6">All Payments</h1>
  {#if loading}
    <p>Loading payments...</p>
  {:else if payments.length === 0}
    <p>No paid appointments found.</p>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each payments as payment}
        <div class="bg-white border border-gray-200 rounded-lg shadow p-5 flex flex-col gap-2">
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
          <div class="text-sm text-gray-700">
            <div><span class="font-medium">Date:</span> {payment.date}</div>
            <div><span class="font-medium">Time:</span> {payment.time}</div>
            <div><span class="font-medium">Service:</span> {payment.service}</div>
            <div><span class="font-medium">Amount:</span> {payment.amount || payment.paymentAmount || '-'}</div>
            {#if payment.cancellationStatus}
              <div>
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
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
.grid { display: grid; }
</style> 