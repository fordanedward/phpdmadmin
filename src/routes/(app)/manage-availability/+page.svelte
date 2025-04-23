<script lang="ts">
  import { onMount } from 'svelte';
  import { getFirestore, doc, getDoc, setDoc, collection } from 'firebase/firestore';
  import { initializeApp, getApps, getApp } from 'firebase/app';
  import { firebaseConfig } from '$lib/firebaseConfig';
  import Swal from 'sweetalert2';

  // --- Constants ---
  const FIRESTORE_SETTINGS_COLLECTION = 'settings';
  const FIRESTORE_SCHEDULE_DEFAULTS_DOC = 'scheduleDefaults';
  const FIRESTORE_DAILY_SCHEDULES_COLLECTION = 'dailySchedules';

  const DAYS_OF_WEEK = [
      { label: 'Sunday', value: 0 },
      { label: 'Monday', value: 1 },
      { label: 'Tuesday', value: 2 },
      { label: 'Wednesday', value: 3 },
      { label: 'Thursday', value: 4 },
      { label: 'Friday', value: 5 },
      { label: 'Saturday', value: 6 }
  ];

  const ALL_POSSIBLE_MORNING_SLOTS = [
      "8:00 AM", "8:30 AM", "9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
  ];
  const ALL_POSSIBLE_AFTERNOON_SLOTS = [
      "1:00 PM", "1:30 PM", "2:00 PM", "2:30 PM", "3:00 PM", "3:30 PM", "4:00 PM", "4:30 PM",
  ];
  const ALL_POSSIBLE_SLOTS = [...ALL_POSSIBLE_MORNING_SLOTS, ...ALL_POSSIBLE_AFTERNOON_SLOTS];

  // --- Firebase Initialization ---
  let db: ReturnType<typeof getFirestore> | null = null;
  let settingsRef: ReturnType<typeof doc> | null = null;

  try {
      if (getApps().length === 0) {
          const app = initializeApp(firebaseConfig);
          db = getFirestore(app);
          console.log("Firebase Initialized");
      } else {
          db = getFirestore(getApp());
          console.log("Using existing Firebase instance");
      }
    
      if (db) {
          settingsRef = doc(db, FIRESTORE_SETTINGS_COLLECTION, FIRESTORE_SCHEDULE_DEFAULTS_DOC);
      } else {
           console.error("Database not initialized, cannot create settings reference.");
           Swal.fire('Error', 'Database connection failed.', 'error');
      }
  } catch (e) {
      console.error("Error initializing Firebase:", e);
      Swal.fire('Error', 'Could not initialize database connection.', 'error');
  }

  let selectedDate: string = new Date().toISOString().split('T')[0];
  let isLoadingSchedule: boolean = false; 
  let isLoadingDefaults: boolean = true; 
  let isSavingDefaults: boolean = false;
  let isSavingSchedule: boolean = false;
  let currentSlots: string[] = [];
  let isWorkingDay: boolean = true;
  let defaultWorkingDays: number[] = [1, 2, 3, 4, 5]; 
  let initialLoadComplete: boolean = false;
  let hasDefaultChanges: boolean = false; 


  function sortTimeSlots(slots: string[]): string[] {
      return [...slots].sort((a, b) => {
          try {
           
              const timeToMinutes = (timeStr: string): number => {
                  const [time, modifier] = timeStr.split(' ');
                  let [hours, minutes] = time.split(':').map(Number);
                  if (modifier === 'PM' && hours !== 12) hours += 12;
                  if (modifier === 'AM' && hours === 12) hours = 0; 
                  return hours * 60 + minutes;
              };
              return timeToMinutes(a) - timeToMinutes(b);
          } catch (e) {
              console.warn(`Error parsing time slots for sorting: ${a}, ${b}`, e);
              // Fallback to localeCompare if parsing fails
              return a.localeCompare(b);
          }
      });
  }

  // --- Firestore Logic ---
  async function loadDefaultSettings() {
      if (!db || !settingsRef) {
           console.warn("DB or settingsRef not available for loading defaults.");
           isLoadingDefaults = false;
           initialLoadComplete = true; 
           return;
      }
      isLoadingDefaults = true;
      hasDefaultChanges = false; 
      console.log("Loading default settings...");
      try {
          const settingsSnap = await getDoc(settingsRef);
          if (settingsSnap.exists()) {
              const data = settingsSnap.data();
              if (Array.isArray(data.defaultWorkingDays) && data.defaultWorkingDays.every(d => typeof d === 'number')) {
                  defaultWorkingDays = data.defaultWorkingDays;
                  console.log("Loaded default working days:", defaultWorkingDays);
              } else {
                  console.warn("Firestore 'scheduleDefaults' doc exists but 'defaultWorkingDays' is missing or invalid. Using code default [1,2,3,4,5].");
                  defaultWorkingDays = [1, 2, 3, 4, 5]; 
              }
          } else {
              console.log("No default settings found in Firestore. Using code default [1,2,3,4,5] and attempting initial save.");
              defaultWorkingDays = [1, 2, 3, 4, 5]; 
              await saveDefaultSettings(true);
          }
      } catch (error) {
          console.error("Error loading default settings:", error);
          Swal.fire('Warning', 'Could not load default working day settings. Using defaults (Mon-Fri).', 'warning');
           defaultWorkingDays = [1, 2, 3, 4, 5]; 
      } finally {
          isLoadingDefaults = false;
          initialLoadComplete = true; 
    
           if (selectedDate) {
              loadScheduleForDate();
          }
      }
  }

  async function saveDefaultSettings(isInitialSave = false) {
      if (!db || !settingsRef) {
          Swal.fire('Error', 'Database connection not ready.', 'error');
          return;
      }
      isSavingDefaults = true;
      console.log("Saving default working days:", defaultWorkingDays);
      try {
      
          const sortedDays = [...defaultWorkingDays].sort((a,b) => a - b);
          await setDoc(settingsRef, {
              defaultWorkingDays: sortedDays
          });
          console.log("Default settings saved successfully.");
          hasDefaultChanges = false; 
          if (!isInitialSave) {
              Swal.fire('Success', 'Default working days saved!', 'success');
          }
      } catch (error) {
          console.error("Error saving default settings:", error);
          if (!isInitialSave) {
              Swal.fire('Error', 'Could not save default working day settings.', 'error');
          } else {
              console.warn("Initial save of default settings failed (might be permissions?).");
          }
      } finally {
          isSavingDefaults = false;
      }
  }

  async function loadScheduleForDate() {
      if (!selectedDate || !db || !initialLoadComplete) return; 

      if (isLoadingDefaults) {
          console.log("Waiting for default settings to load before loading schedule...");
          return;
      }

      isLoadingSchedule = true;
      currentSlots = []; 

      let dayOfWeek: number;
      try {
  
          const dateObj = new Date(selectedDate + 'T00:00:00Z');
          dayOfWeek = dateObj.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
          isWorkingDay = defaultWorkingDays.includes(dayOfWeek);
          console.log(`Date: ${selectedDate}, Day of Week (UTC): ${dayOfWeek}, Default Working based on [${defaultWorkingDays}]: ${isWorkingDay}`);
      } catch (e) {
          console.error("Error parsing selected date:", e);
          Swal.fire('Error', 'Invalid date selected.', 'error');
          isWorkingDay = false; 
          isLoadingSchedule = false;
          return; 
      }

      try {
          const scheduleRef = doc(db, FIRESTORE_DAILY_SCHEDULES_COLLECTION, selectedDate);
          const scheduleSnap = await getDoc(scheduleRef);

          if (scheduleSnap.exists()) {
              const data = scheduleSnap.data();
              currentSlots = Array.isArray(data.availableSlots) ? sortTimeSlots(data.availableSlots) : [];
              if (data.isWorkingDay !== undefined) {
                  isWorkingDay = data.isWorkingDay;
              }
              console.log(`Loaded specific schedule for ${selectedDate}: Slots:`, currentSlots, `Final Working Day Status: ${isWorkingDay}`);
          } else {
               currentSlots = isWorkingDay ? [] : []; 
              console.log(`No specific schedule found for ${selectedDate}. Using default working status: ${isWorkingDay}. Initial slots empty.`);
          }
      } catch (error) {
          console.error("Error loading specific date schedule:", error);
          Swal.fire('Error', 'Could not load schedule for the selected date.', 'error');
          isWorkingDay = false; 
          currentSlots = [];
      } finally {
          isLoadingSchedule = false;
      }
  }

  async function saveSchedule() {
      if (!selectedDate || !db) return;
      isSavingSchedule = true;

      const slotsToSave = sortTimeSlots(currentSlots.filter(slot => slot && slot.trim() !== ''));

      try {
          const scheduleRef = doc(db, FIRESTORE_DAILY_SCHEDULES_COLLECTION, selectedDate);
          await setDoc(scheduleRef, {
              date: selectedDate,
              availableSlots: isWorkingDay ? slotsToSave : [],
              isWorkingDay: isWorkingDay 
          }, { merge: true });

          console.log(`Saved schedule for ${selectedDate}:`, slotsToSave, `Working Day: ${isWorkingDay}`);
          Swal.fire('Success', `Schedule for ${selectedDate} saved successfully!`, 'success');

      } catch (error) {
          console.error("Error saving schedule:", error);
          Swal.fire('Error', 'Could not save schedule.', 'error');
      } finally {
          isSavingSchedule = false;
      }
  }

  onMount(async () => {
      await loadDefaultSettings();
    
  });

  $: if (selectedDate && db && initialLoadComplete && !isLoadingDefaults) {
      loadScheduleForDate();
  }
  $: if (initialLoadComplete && !isLoadingDefaults) {
     const currentDefaultsString = JSON.stringify([...defaultWorkingDays].sort((a,b) => a - b));
   
  }

  function handleDefaultDaysChange() {
      if (initialLoadComplete && !isLoadingDefaults) {
           hasDefaultChanges = true;
      }
  }

</script>

<div class="container mx-auto p-6 space-y-8">

  <!-- Section for Default Working Days -->
  <div class="bg-gray-100 p-6 rounded shadow-md">
      <h2 class="text-xl font-semibold mb-4">Set Default Working Days</h2>
      {#if isLoadingDefaults}
          <p class="text-center text-gray-600">Loading default settings...</p>
      {:else}
          <p class="text-sm text-gray-600 mb-3">Select the days of the week that are typically available for booking. This applies to dates without specific settings.</p>
          <div class="flex flex-wrap gap-x-6 gap-y-2 mb-4">
              {#each DAYS_OF_WEEK as day (day.value)}
                  <label class="flex items-center space-x-2 cursor-pointer">
                      <input
                          type="checkbox"
                          value={day.value}
                          bind:group={defaultWorkingDays}
                          on:change={handleDefaultDaysChange}
                          class="form-checkbox h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                          disabled={isSavingDefaults}
                      />
                      <span class="text-sm">{day.label}</span>
                  </label>
              {/each}
          </div>
          <div class="mt-4 text-right">
               {#if isSavingDefaults}
                  <p class="text-sm text-blue-600 italic mr-4 inline-block">Saving...</p>
               {/if}
              <button
                  on:click={() => saveDefaultSettings(false)}
                  disabled={isSavingDefaults || !hasDefaultChanges}
                  class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-5 rounded disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50"
              >
                  Save Default Settings
              </button>
               {#if !hasDefaultChanges && !isSavingDefaults}
                  <p class="text-xs text-gray-500 mt-2 text-right">No changes to save.</p>
               {:else if hasDefaultChanges && !isSavingDefaults}
                   <p class="text-xs text-orange-600 mt-2 text-right">You have unsaved changes.</p>
               {/if}
          </div>
      {/if}
  </div>

  <!-- Section for Specific Date Availability -->
  <div>
      <h1 class="text-2xl font-bold mb-6">Manage Specific Date Availability</h1>

      <div class="mb-6 max-w-xs">
          <label for="scheduleDate" class="block text-sm font-medium text-gray-700 mb-1">Select Date:</label>
          <input
              type="date"
              id="scheduleDate"
              bind:value={selectedDate}
              min={new Date().toISOString().split('T')[0]}
              class="w-full border border-gray-300 rounded p-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={isLoadingSchedule || isLoadingDefaults || isSavingSchedule || isSavingDefaults}
          />
      </div>

      {#if isLoadingSchedule || isLoadingDefaults}
           <div class="text-center p-6 bg-white rounded shadow-md">
               <p class="text-gray-600">Loading schedule for {selectedDate}...</p>
               
           </div>
      {:else if selectedDate && db}
          <div class="bg-white p-6 rounded shadow-md">
              <h2 class="text-lg font-semibold mb-4">
                  Availability for <span class="font-mono">{selectedDate}</span>
                  {#if selectedDate}
                      ({new Date(selectedDate + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })})
                  {/if}
              </h2>

              <!-- Working Day Toggle -->
              <div class="mb-4 p-3 border rounded bg-yellow-50 border-yellow-200">
                  <label class="flex items-center space-x-2">
                      <input
                         type="checkbox"
                         bind:checked={isWorkingDay}
                         class="form-checkbox h-5 w-5 text-blue-600 rounded focus:ring-blue-500"
                         disabled={isSavingSchedule}
                      />
                      <span class="text-gray-800 font-medium">Is this a working day?</span>
                  </label>
                  {#if selectedDate}
                      {@const dayOfWeekForSelected = new Date(selectedDate + 'T00:00:00Z').getUTCDay()}
                      <p class="text-xs text-gray-600 mt-1 pl-7">
                          {#if !defaultWorkingDays.includes(dayOfWeekForSelected) && isWorkingDay}
                               (Override: This day is NOT usually a working day based on defaults, but you're enabling it.)
                          {:else if defaultWorkingDays.includes(dayOfWeekForSelected) && !isWorkingDay}
                               (Override: This day IS usually a working day based on defaults, but you're disabling it.)
                           {:else if defaultWorkingDays.includes(dayOfWeekForSelected) && isWorkingDay}
                              (Matches default: This day is a working day.)
                           {:else if !defaultWorkingDays.includes(dayOfWeekForSelected) && !isWorkingDay}
                              (Matches default: This day is not a working day.)
                          {/if}
                      </p>
                  {/if}
              </div>


              <!-- Time Slot Selection (only if it's a working day) -->
              {#if isWorkingDay}
                  <p class="text-sm text-gray-600 mb-3">Select available time slots for this specific date:</p>
                  <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-2">
                      {#each ALL_POSSIBLE_SLOTS as slotOption (slotOption)}
                          <label class="flex items-center space-x-2 p-2 border rounded hover:bg-gray-50 cursor-pointer transition-colors duration-150">
                              <input
                                  type="checkbox"
                                  value={slotOption}
                                  bind:group={currentSlots}
                                  class="form-checkbox h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                                  disabled={isSavingSchedule}
                              />
                              <span class="text-sm font-mono">{slotOption}</span>
                          </label>
                      {/each}
                  </div>

                  <!-- Display Selected Slots -->
                  <div class="mt-6">
                      <h3 class="font-medium mb-2">Selected Slots for {selectedDate}:</h3>
                      {#if currentSlots.length > 0}
                          <ul class="list-disc list-inside text-sm text-gray-700 space-y-1">
                              {#each sortTimeSlots(currentSlots) as selectedSlot (selectedSlot)}
                                  <li class="font-mono">{selectedSlot}</li>
                              {/each}
                          </ul>
                      {:else}
                          <p class="text-sm text-gray-500 italic">No time slots selected for this day.</p>
                      {/if}
                  </div>
              {:else}
                   <p class="text-sm text-gray-500 italic p-3 bg-gray-50 rounded border">Time slots cannot be selected because this date is marked as not a working day.</p>
              {/if}


              <!-- Save Button for Specific Date -->
              <div class="mt-8 text-right">
                  <button
                      on:click={saveSchedule}
                      disabled={isSavingSchedule || isLoadingSchedule || isSavingDefaults}
                      class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                  >
                      {#if isSavingSchedule}
                          <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Saving...
                      {:else}
                         Save Schedule for {selectedDate}
                      {/if}
                  </button>
              </div>
          </div>
      {:else if !selectedDate && !isLoadingDefaults && !isLoadingSchedule}
           <p class="text-gray-500">Please select a date.</p>
      {/if}
  </div>

</div>

<style>
  .form-checkbox:checked {
      background-color: #2563eb; 
      border-color: #2563eb;
  }
  .form-checkbox:focus {
       box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5);
  }
  .form-checkbox {
      appearance: none;
      background-color: #fff;
      border: 1px solid #ccc; 
      display: inline-block;
      position: relative;
      cursor: pointer;
      vertical-align: middle;
      color-adjust: exact;
      print-color-adjust: exact;
  }
  .form-checkbox.h-4 { height: 1rem; width: 1rem; }
  .form-checkbox.h-5 { height: 1.25rem; width: 1.25rem; }
  .form-checkbox.rounded { border-radius: 0.25rem; }

  .form-checkbox:checked::before {
      content: '✓';
      display: block;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: white;
      font-size: 0.75rem; 
       line-height: 1;
      font-weight: bold;
  }
  .form-checkbox:disabled {
      background-color: #e5e7eb; 
      border-color: #d1d5db;
      cursor: not-allowed;
  }
   .form-checkbox:disabled:checked::before {
      color: #9ca3af;
  }
 
</style>