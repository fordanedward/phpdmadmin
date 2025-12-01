<script lang="ts">
  import { onMount } from 'svelte';
  import { getFirestore, collection, addDoc, getDocs, doc, getDoc, query, where } from 'firebase/firestore';
  import { initializeApp } from 'firebase/app';
  import { firebaseConfig } from '$lib/firebaseConfig';
  import { addPopupNotification } from '$lib/popupNotificationStore.js';

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
  let availableSlots: string[] = [];
  let loadingSlotsForDate = false;

  // Optional: fetch patient list for dropdown
  let patients: any[] = [];
  onMount(async () => {
    const profilesRef = collection(db, 'patientProfiles');
    const querySnapshot = await getDocs(profilesRef);
    patients = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  });

  // Reactive: Load available slots whenever date changes
  $: if (date) {
    loadAvailableSlotsForDate(date);
  }

  // Function to load available slots for a specific date
  async function loadAvailableSlotsForDate(selectedDate: string) {
    availableSlots = [];
    loadingSlotsForDate = true;

    if (!selectedDate) {
      loadingSlotsForDate = false;
      return;
    }

    try {
      const scheduleRef = doc(db, 'dailySchedules', selectedDate);
      const scheduleSnap = await getDoc(scheduleRef);

      if (scheduleSnap.exists()) {
        const scheduleData = scheduleSnap.data();
        if (scheduleData.isWorkingDay === false) {
          console.log(`${selectedDate} is marked as a non-working day.`);
          loadingSlotsForDate = false;
          return;
        }
        
        const scheduledSlotsForDay = scheduleData.availableSlots || [];
        
        if (scheduledSlotsForDay.length === 0) {
          console.warn(`${selectedDate} is marked as working day but has no slots. Using all possible slots as fallback.`);
          const ALL_POSSIBLE_SLOTS = [
            "8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM",
            "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM"
          ];
          availableSlots = ALL_POSSIBLE_SLOTS;
        } else {
          availableSlots = scheduledSlotsForDay;
        }

        // Get booked slots for this date
        const q = query(
          collection(db, "appointments"),
          where("date", "==", selectedDate),
          where("status", "in", ["Accepted", "Pending", "Scheduled", "Rescheduled", "Completed: Need Follow-up"])
        );

        const querySnapshot = await getDocs(q);
        const bookedSlots = querySnapshot.docs.map((doc) => doc.data().time);
        console.log(`Booked slots on ${selectedDate}:`, bookedSlots);

        // Filter out booked slots
        availableSlots = availableSlots.filter(
          (slot) => !bookedSlots.includes(slot)
        );
        
        // Sort slots chronologically
        availableSlots.sort((a, b) => new Date(`1970-01-01T${a}`).getTime() - new Date(`1970-01-01T${b}`).getTime());

        console.log(`Final available slots for ${selectedDate}:`, availableSlots);
      } else {
        console.log(`No schedule defined in dailySchedules for ${selectedDate}. No slots available.`);
      }
    } catch (error) {
      console.error(`Error loading available slots for ${selectedDate}:`, error);
    } finally {
      loadingSlotsForDate = false;
    }
  }

  async function submitAppointment() {
    loading = true;
    message = '';
    error = '';
    if (!patientId || !date || !time || !service) {
      error = 'Please fill in all required fields.';
      addPopupNotification('Please fill in all required fields.', 'error', 4000);
      loading = false;
      return;
    }
    try {
      const appointmentData = {
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
      };
      
      await addDoc(collection(db, 'appointments'), appointmentData);
      
      message = 'Appointment request submitted!';
      addPopupNotification(
        `Appointment request created for ${date} at ${time}`,
        'success',
        5000
      );
      
      patientId = date = time = service = subServices = remarks = '';
    } catch (e) {
      error = 'Failed to submit appointment.';
      addPopupNotification('Failed to submit appointment request.', 'error', 4000);
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
      <label for="patientId" class="block text-sm font-medium mb-1">Patient</label>
      <select id="patientId" bind:value={patientId} required class="w-full border rounded p-2">
        <option value="" disabled selected>Select patient</option>
        {#each patients as p}
          <option value={p.id}>{p.name} {p.lastName} ({p.id})</option>
        {/each}
      </select>
    </div>
    <div>
      <label for="date" class="block text-sm font-medium mb-1">Date</label>
      <input id="date" type="date" bind:value={date} required class="w-full border rounded p-2" />
      {#if loadingSlotsForDate}
        <p class="text-xs text-blue-600 mt-1">Loading available slots...</p>
      {:else if date && availableSlots.length === 0}
        <p class="text-xs text-red-600 mt-1">No available slots for this date.</p>
      {:else if date && availableSlots.length > 0}
        <p class="text-xs text-green-600 mt-1">{availableSlots.length} slot(s) available</p>
      {/if}
    </div>
    <div>
      <label for="time" class="block text-sm font-medium mb-1">Time</label>
      {#if date && availableSlots.length > 0}
        <select id="time" bind:value={time} required class="w-full border rounded p-2">
          <option value="" disabled selected>Select an available time</option>
          {#each availableSlots as slot}
            <option value={slot}>{slot}</option>
          {/each}
        </select>
      {:else if date && loadingSlotsForDate}
        <select id="time" disabled class="w-full border rounded p-2 bg-gray-100 text-gray-500">
          <option>Loading slots...</option>
        </select>
      {:else if date && availableSlots.length === 0}
        <select id="time" disabled class="w-full border rounded p-2 bg-gray-100 text-gray-500">
          <option>No available times for this date</option>
        </select>
      {:else}
        <select id="time" disabled class="w-full border rounded p-2 bg-gray-100 text-gray-500">
          <option>Select a date first</option>
        </select>
      {/if}
    </div>
    <div>
      <label for="service" class="block text-sm font-medium mb-1">Service</label>
      <input id="service" type="text" bind:value={service} required class="w-full border rounded p-2" />
    </div>
    <div>
      <label for="subServices" class="block text-sm font-medium mb-1">Sub-services (optional, comma separated)</label>
      <input id="subServices" type="text" bind:value={subServices} class="w-full border rounded p-2" />
    </div>
    <div>
      <label for="remarks" class="block text-sm font-medium mb-1">Remarks (optional)</label>
      <input id="remarks" type="text" bind:value={remarks} class="w-full border rounded p-2" />
    </div>
    <button type="submit" class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded" disabled={loading}>
      {loading ? 'Submitting...' : 'Submit Appointment'}
    </button>
  </form>
</div> 