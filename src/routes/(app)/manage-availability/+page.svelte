<script lang="ts">
    import { onMount } from 'svelte';
    import { getFirestore, doc, getDoc, setDoc, collection } from 'firebase/firestore';
    import { initializeApp } from 'firebase/app';
    import { firebaseConfig } from '$lib/firebaseConfig'; // Assuming you have this
    import Swal from 'sweetalert2';
  
    // Initialize Firebase only if it hasn't been initialized elsewhere globally
    // Consider a shared Firebase initialization module ($lib/firebase.ts)
    let db: ReturnType<typeof getFirestore> | undefined;
    try {
      const app = initializeApp(firebaseConfig);
      db = getFirestore(app);
    } catch (e) {
      // Handle Firebase already initialized error if necessary
      console.warn("Firebase might be already initialized.");
      // Or get the existing instance if you have a central setup
      // db = getFirestore();
    }
  
  
    let selectedDate: string = new Date().toISOString().split('T')[0]; // Default to today
    let isLoading: boolean = false;
    let currentSlots: string[] = []; // Slots loaded for the selected date
    let isWorkingDay: boolean = true; // Default to working day
  
    // --- Define the Potential Slots an Admin Can Choose From ---
    // These are just the options presented in the UI, NOT the final availability
    const allPossibleMorningSlots = [
      "8:00 AM", "8:30 AM", "9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
    ];
    const allPossibleAfternoonSlots = [
      "1:00 PM", "1:30 PM", "2:00 PM", "2:30 PM", "3:00 PM", "3:30 PM", "4:00 PM", "4:30 PM",
    ];
    const allPossibleSlots = [...allPossibleMorningSlots, ...allPossibleAfternoonSlots];
    // --- ---
  
    // Function to load the schedule for the selected date
    async function loadScheduleForDate() {
      if (!selectedDate || !db) return;
      isLoading = true;
      currentSlots = []; // Reset
      isWorkingDay = true; // Reset default
  
      try {
        const scheduleRef = doc(db, 'dailySchedules', selectedDate);
        const scheduleSnap = await getDoc(scheduleRef);
  
        if (scheduleSnap.exists()) {
          const data = scheduleSnap.data();
          currentSlots = data.availableSlots || [];
          isWorkingDay = data.isWorkingDay !== undefined ? data.isWorkingDay : true; // Handle potential missing field
          console.log(`Loaded schedule for ${selectedDate}:`, currentSlots, `Working Day: ${isWorkingDay}`);
        } else {
          console.log(`No schedule found for ${selectedDate}. Defaulting to empty/working.`);
          // Keep currentSlots empty and isWorkingDay true (or set defaults as needed)
        }
      } catch (error) {
        console.error("Error loading schedule:", error);
        Swal.fire('Error', 'Could not load schedule for the selected date.', 'error');
        isWorkingDay = false; // Assume not working if error occurs
      } finally {
        isLoading = false;
      }
    }
  
    // Function to save the schedule for the selected date
    async function saveSchedule() {
      if (!selectedDate || !db) return;
      isLoading = true;
  
      // Filter out any potentially empty strings if checkboxes somehow allow it
      const slotsToSave = currentSlots.filter(slot => slot && slot.trim() !== '');
  
      // Sort the slots for consistency (optional but good practice)
      slotsToSave.sort((a, b) => {
          const timeA = new Date(`1970-01-01 ${a}`);
          const timeB = new Date(`1970-01-01 ${b}`);
          return timeA.getTime() - timeB.getTime();
      });
  
  
      try {
        const scheduleRef = doc(db, 'dailySchedules', selectedDate);
        await setDoc(scheduleRef, {
          date: selectedDate,
          availableSlots: isWorkingDay ? slotsToSave : [], // Save empty array if not a working day
          isWorkingDay: isWorkingDay
        });
  
        console.log(`Saved schedule for ${selectedDate}:`, slotsToSave, `Working Day: ${isWorkingDay}`);
        Swal.fire('Success', `Schedule for ${selectedDate} saved successfully!`, 'success');
  
      } catch (error) {
         console.error("Error saving schedule:", error);
         Swal.fire('Error', 'Could not save schedule.', 'error');
      } finally {
         isLoading = false;
      }
    }
  
    // Load schedule when the component mounts or date changes
    onMount(() => {
      if (selectedDate) {
        loadScheduleForDate();
      }
    });
  
    // $: acts like a watcher in Vue/React. It reruns when selectedDate changes.
    $: if (selectedDate && db) {
        loadScheduleForDate();
    }
  
  </script>
  
  <div class="container mx-auto p-6">
    <h1 class="text-2xl font-bold mb-6">Manage Daily Availability</h1>
  
    <div class="mb-6 max-w-xs">
      <label for="scheduleDate" class="block text-sm font-medium text-gray-700 mb-1">Select Date:</label>
      <input
        type="date"
        id="scheduleDate"
        bind:value={selectedDate}
        min={new Date().toISOString().split('T')[0]}
        class="w-full border border-gray-300 rounded p-2 focus:ring-blue-500 focus:border-blue-500"
        disabled={isLoading}
      />
    </div>
  
    {#if isLoading}
      <p>Loading schedule...</p>
    {:else if selectedDate}
      <div class="bg-white p-6 rounded shadow-md">
        <h2 class="text-lg font-semibold mb-4">Available Slots for {selectedDate}</h2>
  
        <div class="mb-4">
            <label class="flex items-center space-x-2">
               <input type="checkbox" bind:checked={isWorkingDay} class="form-checkbox h-5 w-5 text-blue-600"/>
               <span class="text-gray-700">Is this a working day?</span>
            </label>
            {#if !isWorkingDay}
               <p class="text-sm text-orange-600 mt-1">Marking this as not a working day will remove all time slots and prevent booking.</p>
            {/if}
        </div>
  
  
        {#if isWorkingDay}
          <p class="text-sm text-gray-600 mb-3">Select the time slots that should be available for booking on this date:</p>
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2">
            {#each allPossibleSlots as slotOption (slotOption)}
              <label class="flex items-center space-x-2 p-2 border rounded hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  value={slotOption}
                  bind:group={currentSlots}
                  class="form-checkbox h-4 w-4 text-blue-600"
                />
                <span class="text-sm">{slotOption}</span>
              </label>
            {/each}
          </div>
  
          <div class="mt-6">
              <h3 class="font-medium mb-2">Selected Slots:</h3>
              {#if currentSlots.length > 0}
                <ul class="list-disc list-inside text-sm text-gray-700">
                    {#each currentSlots.slice().sort((a, b) => new Date(`1970-01-01 ${a}`).getTime() - new Date(`1970-01-01 ${b}`).getTime()) as selectedSlot}
                        <li>{selectedSlot}</li>
                    {/each}
                </ul>
              {:else}
                <p class="text-sm text-gray-500">No slots selected for this working day.</p>
              {/if}
          </div>
        {/if}
  
  
        <div class="mt-8 text-right">
          <button
            on:click={saveSchedule}
            disabled={isLoading}
            class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
          >
            {isLoading ? 'Saving...' : 'Save Schedule'}
          </button>
        </div>
      </div>
    {/if}
  
  </div>
  
  <style>
    /* Add any specific styles if needed */
    .form-checkbox {
        appearance: none;
        background-color: #fff;
        border: 1px solid #ccc;
        border-radius: 0.25rem;
        display: inline-block;
        position: relative;
        cursor: pointer;
    }
    .form-checkbox:checked {
        background-color: #3b82f6; /* bg-blue-500 */
        border-color: #3b82f6;
    }
     .form-checkbox:checked::before {
        content: '✓';
        display: block;
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: white;
        font-size: 0.75rem; /* Adjust size as needed */
        font-weight: bold;
    }
     .form-checkbox.h-4 { height: 1rem; }
     .form-checkbox.w-4 { width: 1rem; }
     .form-checkbox.h-5 { height: 1.25rem; }
     .form-checkbox.w-5 { width: 1.25rem; }
  </style>