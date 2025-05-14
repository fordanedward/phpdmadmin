<script lang="ts">
  import { onMount } from 'svelte';
  import { getFirestore, collection, addDoc, getDocs } from 'firebase/firestore';
  import { initializeApp } from 'firebase/app';
  import { firebaseConfig } from '$lib/firebaseConfig';

  let db: ReturnType<typeof getFirestore>;
  try {
      const app = initializeApp(firebaseConfig);
      db = getFirestore(app);
  } catch (e: any) {
      db = getFirestore();
  }

  let patientId = '';
  let date = '';
  let time = '';
  let service = '';
  let subServices = '';
  let remarks = '';
  let loading = false;
  let message = '';
  let error = '';

  // Optional: fetch patient list for dropdown
  let patients: any[] = [];
  onMount(async () => {
    const profilesRef = collection(db, 'patientProfiles');
    const querySnapshot = await getDocs(profilesRef);
    patients = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  });

  async function submitAppointment() {
    loading = true;
    message = '';
    error = '';
    if (!patientId || !date || !time || !service) {
      error = 'Please fill in all required fields.';
      loading = false;
      return;
    }
    try {
      await addDoc(collection(db, 'appointments'), {
        patientId,
        date,
        time,
        service,
        subServices: subServices ? subServices.split(',').map(s => s.trim()) : [],
        remarks,
        status: 'pending',
        paymentStatus: '',
        cancellationStatus: '',
        createdAt: new Date().toISOString(),
      });
      message = 'Appointment request submitted!';
      patientId = date = time = service = subServices = remarks = '';
    } catch (e) {
      error = 'Failed to submit appointment.';
    }
    loading = false;
  }
</script>

<div class="max-w-lg mx-auto p-6">
  <h1 class="text-2xl font-bold mb-6">Request New Appointment</h1>
  {#if message}
    <div class="mb-4 p-3 bg-green-100 text-green-800 rounded">{message}</div>
  {/if}
  {#if error}
    <div class="mb-4 p-3 bg-red-100 text-red-800 rounded">{error}</div>
  {/if}
  <form on:submit|preventDefault={submitAppointment} class="space-y-4">
    <div>
      <label class="block text-sm font-medium mb-1">Patient</label>
      <select bind:value={patientId} required class="w-full border rounded p-2">
        <option value="" disabled selected>Select patient</option>
        {#each patients as p}
          <option value={p.id}>{p.name} {p.lastName} ({p.id})</option>
        {/each}
      </select>
    </div>
    <div>
      <label class="block text-sm font-medium mb-1">Date</label>
      <input type="date" bind:value={date} required class="w-full border rounded p-2" />
    </div>
    <div>
      <label class="block text-sm font-medium mb-1">Time</label>
      <input type="time" bind:value={time} required class="w-full border rounded p-2" />
    </div>
    <div>
      <label class="block text-sm font-medium mb-1">Service</label>
      <input type="text" bind:value={service} required class="w-full border rounded p-2" />
    </div>
    <div>
      <label class="block text-sm font-medium mb-1">Sub-services (optional, comma separated)</label>
      <input type="text" bind:value={subServices} class="w-full border rounded p-2" />
    </div>
    <div>
      <label class="block text-sm font-medium mb-1">Remarks (optional)</label>
      <input type="text" bind:value={remarks} class="w-full border rounded p-2" />
    </div>
    <button type="submit" class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded" disabled={loading}>
      {loading ? 'Submitting...' : 'Submit Appointment'}
    </button>
  </form>
</div> 