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
      "8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM",
  ];
  const ALL_POSSIBLE_AFTERNOON_SLOTS = [
      "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM",
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

  // Helper function to get today's date in Philippines timezone (UTC+8)
  function getTodayInPhilippines(): string {
      const now = new Date();
      const philippinesDate = new Date(now.getTime() + (8 * 60 * 60 * 1000) - (now.getTimezoneOffset() * 60 * 1000));
      const year = philippinesDate.getUTCFullYear();
      const month = String(philippinesDate.getUTCMonth() + 1).padStart(2, '0');
      const day = String(philippinesDate.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
  }

  let selectedDate: string = getTodayInPhilippines();
  let isLoadingSchedule: boolean = false; 
  let isLoadingDefaults: boolean = true; 
  let isSavingDefaults: boolean = false;
  let isSavingSchedule: boolean = false;
  let currentSlots: string[] = [];
  let isWorkingDay: boolean = true;
  let defaultWorkingDays: number[] = [1, 2, 3, 4, 5]; 
  let initialLoadComplete: boolean = false;
  let hasDefaultChanges: boolean = false;
  let userHasModifiedSlots: boolean = false;
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;


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

  function toggleSlot(slot: string) {
      if (isSavingSchedule) return;
      currentSlots = currentSlots.includes(slot)
          ? currentSlots.filter((existing) => existing !== slot)
          : sortTimeSlots([...currentSlots, slot]);
  }

  function removeSlot(slot: string) {
      if (isSavingSchedule) return;
      currentSlots = currentSlots.filter((existing) => existing !== slot);
  }

  function toggleAllSlots() {
      if (isSavingSchedule) return;
      currentSlots = allSlotsSelected ? [] : sortTimeSlots(ALL_POSSIBLE_SLOTS);
      userHasModifiedSlots = true;
  }

  $: allSlotsSelected = currentSlots.length === ALL_POSSIBLE_SLOTS.length &&
      ALL_POSSIBLE_SLOTS.every((slot) => currentSlots.includes(slot));

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
      
      // Set timeout safeguard - if save takes longer than 30 seconds, force unlock
      saveTimeout = setTimeout(() => {
          console.warn("Save operation timeout - forcing unlock");
          isSavingDefaults = false;
          Swal.fire('Warning', 'Save is taking longer than expected. Please try again if it did not complete.', 'warning');
      }, 30000);
      
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
          if (saveTimeout) clearTimeout(saveTimeout);
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
      userHasModifiedSlots = false; 

      let dayOfWeek: number;
      try {
  
          // Parse date in Philippines timezone (UTC+8)
          const [year, month, day] = selectedDate.split('-').map(Number);
          const dateObj = new Date(year, month - 1, day);
          dayOfWeek = dateObj.getDay(); // 0 = Sunday, 1 = Monday, ...
          isWorkingDay = defaultWorkingDays.includes(dayOfWeek);
          console.log(`Date: ${selectedDate}, Day of Week: ${dayOfWeek}, Default Working based on [${defaultWorkingDays}]: ${isWorkingDay}`);
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

      let slotsToSave = sortTimeSlots(currentSlots.filter(slot => slot && slot.trim() !== ''));
      
      // If marked as working day but has no slots, default to all possible slots
      if (isWorkingDay && slotsToSave.length === 0) {
          console.warn(`Saving working day ${selectedDate} with no slots. Defaulting to all possible slots.`);
          slotsToSave = sortTimeSlots(ALL_POSSIBLE_SLOTS);
      }

      // Set timeout safeguard - if save takes longer than 30 seconds, force unlock
      saveTimeout = setTimeout(() => {
          console.warn("Save operation timeout - forcing unlock");
          isSavingSchedule = false;
          Swal.fire('Warning', 'Save is taking longer than expected. Please try again if it did not complete.', 'warning');
      }, 30000);

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
          if (saveTimeout) clearTimeout(saveTimeout);
          isSavingSchedule = false;
      }
  }

  onMount(async () => {
      await loadDefaultSettings();
    
  });

  $: if (selectedDate && db && initialLoadComplete && !isLoadingDefaults) {
      loadScheduleForDate();
  }
  
  $: if (isWorkingDay && initialLoadComplete && !isLoadingSchedule && currentSlots.length === 0 && !userHasModifiedSlots) {
      currentSlots = sortTimeSlots(ALL_POSSIBLE_SLOTS);
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

<div class="min-h-screen" style="background-color: #eef3ff;">
    <div class="max-w-6xl mx-auto px-3 sm:p-4 md:p-8 py-6 sm:py-8 md:py-10">
        <div class="mb-6 sm:mb-8 md:mb-10">
            <div class="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-5">
                <div class="p-2.5 sm:p-3 rounded-xl" style="background: linear-gradient(135deg, #0b2d56 0%, #1a4d7a 100%);">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7 sm:h-8 sm:w-8 md:h-9 md:w-9 flex-shrink-0 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <div>
                    <h1 class="text-3xl sm:text-4xl md:text-4xl font-bold" style="color: #0b2d56;">Availability Settings</h1>
                    <p class="text-gray-600 text-sm sm:text-base md:text-base pl-0 font-medium">Configure your working days and time slot availability for member's appointment.</p>
                </div>
            </div>
        </div>

        <!-- Section for Default Working Days -->
        <div class="bg-white rounded-2xl shadow-md hover:shadow-lg transition-all duration-300 p-5 sm:p-6 md:p-7 mb-5 sm:mb-6 md:mb-7 border border-gray-100">
            <div class="flex items-center justify-between mb-5 sm:mb-6">
                <div>
                    <h2 class="text-lg sm:text-xl md:text-2xl font-bold" style="color: #0b2d56;">Default Working Days</h2>
                    <p class="text-xs sm:text-sm text-gray-500 mt-1">Select days available for appointment by default.</p>
                </div>
            </div>

            {#if isLoadingDefaults}
                <div class="text-center py-8 sm:py-10">
                    <div class="inline-flex items-center justify-center">
                        <div class="inline-block animate-spin rounded-full h-8 w-8 sm:h-10 sm:w-10" style="border: 3px solid #e9ecf1; border-top: 3px solid #0b2d56;"></div>
                    </div>
                    <p class="mt-3 text-gray-600 text-sm sm:text-base font-medium">Loading your preferences...</p>
                </div>
            {:else}
                <div class="space-y-5 sm:space-y-6">
                    <div class="grid grid-cols-7 gap-1.5 sm:gap-3 bg-gradient-to-r from-blue-50 to-transparent p-3 sm:p-5 rounded-xl">
                        {#each DAYS_OF_WEEK as day (day.value)}
                            <label class="day-toggle" class:day-toggle--active={defaultWorkingDays.includes(day.value)}>
                                <input
                                    type="checkbox"
                                    value={day.value}
                                    bind:group={defaultWorkingDays}
                                    on:change={handleDefaultDaysChange}
                                    class="sr-only"
                                    disabled={isSavingDefaults}
                                />
                                <span class="day-toggle__dot" aria-hidden="true"></span>
                                <span class="day-toggle__label">{day.label.slice(0, 3)}</span>
                            </label>
                        {/each}
                    </div>
                    <div class="flex flex-col sm:flex-row gap-3 sm:gap-4 sm:items-center sm:justify-between pt-2">
                        <div class="flex-1 flex items-center gap-2">
                            {#if isSavingDefaults}
                                <div class="inline-block animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5" style="border: 2px solid #e9ecf1; border-top: 2px solid #0b2d56;"></div>
                                <p class="text-xs sm:text-sm font-medium" style="color: #0b2d56;">Saving your changes...</p>
                            {:else if !hasDefaultChanges && !isSavingDefaults}
                                <p class="text-xs sm:text-sm text-gray-500">All changes saved</p>
                            {:else if hasDefaultChanges && !isSavingDefaults}
                                <div class="inline-flex items-center gap-2 px-3 py-1.5 bg-orange-50 rounded-lg border border-orange-200">
                                    <div class="h-2 w-2 rounded-full" style="background-color: #ff8c00;"></div>
                                    <p class="text-xs sm:text-sm text-orange-700 font-medium">Unsaved changes</p>
                                </div>
                            {/if}
                        </div>
                        <button
                            on:click={() => saveDefaultSettings(false)}
                            disabled={isSavingDefaults || !hasDefaultChanges}
                            class="text-white px-5 sm:px-6 py-2.5 sm:py-2 text-xs sm:text-sm rounded-lg font-semibold whitespace-nowrap min-h-[44px] sm:min-h-[40px] flex items-center justify-center transition-all duration-200 active:scale-95 disabled:active:scale-100 shadow-sm hover:shadow-md disabled:shadow-none"
                            style="background: linear-gradient(135deg, #0b2d56 0%, #1a4d7a 100%); opacity: {isSavingDefaults || !hasDefaultChanges ? '0.65' : '1'};"
                            title={isSavingDefaults ? 'Saving... please wait' : (!hasDefaultChanges ? 'No changes to save' : 'Click to save changes')}
                        >
                            {#if isSavingDefaults}
                                <span>Saving...</span>
                            {:else}
                                <span>Save Settings</span>
                            {/if}
                        </button>
                    </div>
                </div>
            {/if}
        </div>

        <!-- Section for Specific Date Availability/Availability Hours -->
        <div class="bg-white rounded-2xl shadow-md hover:shadow-lg transition-all duration-300 p-5 sm:p-6 md:p-7 border border-gray-100">
            <h2 class="text-lg sm:text-xl md:text-2xl font-bold mb-5 sm:mb-6" style="color: #0b2d56;">Availability Hours</h2>
            
            <!-- Purpose & How It Works -->
            <div class="mb-6 sm:mb-7 md:mb-8 p-4 sm:p-5 rounded-xl border-l-4" style="background: linear-gradient(to right, #f0f4f8, transparent); border-color: #0b2d56;">
                <h3 class="text-sm sm:text-base font-semibold mb-3" style="color: #0b2d56;">How Availability Hours Work:</h3>
                <ul class="text-xs sm:text-sm text-gray-700 space-y-2 ml-4 list-disc">
                    <li><strong>Select a Date:</strong> Choose a specific date to configure its availability.</li>
                    <li><strong>Mark as Working Day:</strong> Toggle whether this date is a working day or a non-working day (holiday, day off, etc.).</li>
                    <li><strong>Select Time Slots:</strong> If it's a working day, choose which appointment time slots are available (Morning: 8 AM - 11 AM, Afternoon: 12 PM - 4 PM).</li>
                    <li><strong>Members see availability:</strong> When members schedule an appointment, they can only select dates and times you've marked as available.</li>
                </ul>
            </div>

            <div class="mb-6 sm:mb-7">
                <label for="scheduleDate" class="block text-sm sm:text-base font-semibold text-gray-700 mb-2.5" style="color: #0b2d56;">Select a Date:</label>
                <input
                    type="date"
                    id="scheduleDate"
                    bind:value={selectedDate}
                    min={getTodayInPhilippines()}
                    class="w-full sm:max-w-sm border-2 border-gray-200 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus:border-blue-400 hover:border-gray-300"
                    style="--input-focus-color: #0b2d56;"
                    disabled={isLoadingSchedule || isLoadingDefaults || isSavingSchedule || isSavingDefaults}
                />
            </div>

            {#if isLoadingSchedule || isLoadingDefaults}
                <div class="text-center py-10 sm:py-12">
                    <div class="inline-flex items-center justify-center mb-4">
                        <div class="inline-block animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12" style="border: 3px solid #e9ecf1; border-top: 3px solid #0b2d56;"></div>
                    </div>
                    <p class="text-gray-600 text-sm sm:text-base font-medium">Loading schedule for {selectedDate}...</p>
                </div>
            {:else if selectedDate && db}
                <div class="space-y-5 sm:space-y-6 md:space-y-7">
                    <!-- Working Day Toggle -->
                    <div class="p-4 sm:p-5 rounded-xl border-2 border-gray-100 bg-gradient-to-r from-blue-50 to-transparent hover:border-blue-200 transition-colors">
                        <label class="flex items-center cursor-pointer gap-3">
                            <input
                                type="checkbox"
                                bind:checked={isWorkingDay}
                                class="form-checkbox h-5 w-5 sm:h-6 sm:w-6 rounded cursor-pointer transition-all"
                                style="accent-color: #0b2d56; width: 20px; height: 20px;"
                                disabled={isSavingSchedule}
                            />
                            <span class="text-gray-800 font-semibold text-sm sm:text-base">This is a working day</span>
                        </label>
                    </div>

                    <!-- Non-working Day Note -->
                    {#if !isWorkingDay}
                        <div class="p-4 sm:p-5 rounded-xl border-l-4 bg-amber-50" style="border-color: #f59e0b;">
                            <p class="text-sm sm:text-base font-medium text-amber-900">
                                This date is marked as a <strong>non-working day</strong>. No appointment slots will be available for members to book on this date.
                            </p>
                        </div>
                    {/if}

                    <!-- Time Slot Selection -->
                    {#if isWorkingDay}
                        <div class="space-y-5 sm:space-y-6 md:space-y-7">
                            <div class="flex gap-2.5">
                                <button
                                    type="button"
                                    class="select-all-btn text-xs sm:text-sm px-5 sm:px-6 py-2.5 sm:py-2 min-h-[44px] sm:min-h-[40px] font-semibold"
                                    on:click={toggleAllSlots}
                                    disabled={isSavingSchedule}
                                    aria-pressed={allSlotsSelected}
                                >
                                    {allSlotsSelected ? 'Deselect All' : 'Select All'}
                                </button>
                            </div>
                            
                            <!-- Morning Slots -->
                            <div class="morning-section bg-gradient-to-br from-yellow-50 via-yellow-25 to-transparent p-4 sm:p-6 md:p-7 rounded-2xl border-2 border-yellow-200 hover:border-yellow-300 transition-all">
                                <h4 class="text-sm sm:text-base md:text-lg font-bold text-gray-900 mb-5 sm:mb-6 flex items-center gap-3">
                                    <div class="p-2.5 sm:p-3 rounded-full bg-yellow-100">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 sm:h-6 sm:w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                                        </svg>
                                    </div>
                                    <span>Morning (8 AM - 11 AM)</span>
                                </h4>
                                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-3.5 md:gap-4">
                                    {#each ALL_POSSIBLE_MORNING_SLOTS as slotOption (slotOption)}
                                        <button
                                            type="button"
                                            class="time-slot-label"
                                            class:time-slot-label--active={currentSlots.includes(slotOption)}
                                            on:click={() => toggleSlot(slotOption)}
                                            disabled={isSavingSchedule}
                                            aria-pressed={currentSlots.includes(slotOption)}
                                        >
                                            <span class="time-slot-label__dot"></span>
                                            <span class="time-slot-label__text">{slotOption}</span>
                                        </button>
                                    {/each}
                                </div>
                            </div>
                            
                            <!-- Afternoon Slots -->
                            <div class="afternoon-section bg-gradient-to-br from-orange-50 via-orange-25 to-transparent p-4 sm:p-6 md:p-7 rounded-2xl border-2 border-orange-200 hover:border-orange-300 transition-all">
                                <h4 class="text-sm sm:text-base md:text-lg font-bold text-gray-900 mb-5 sm:mb-6 flex items-center gap-3">
                                    <div class="p-2.5 sm:p-3 rounded-full bg-orange-100">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 sm:h-6 sm:w-6 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                                        </svg>
                                    </div>
                                    <span>Afternoon (12 PM - 4 PM)</span>
                                </h4>
                                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-3.5 md:gap-4">
                                    {#each ALL_POSSIBLE_AFTERNOON_SLOTS as slotOption (slotOption)}
                                        <button
                                            type="button"
                                            class="time-slot-label"
                                            class:time-slot-label--active={currentSlots.includes(slotOption)}
                                            on:click={() => toggleSlot(slotOption)}
                                            disabled={isSavingSchedule}
                                            aria-pressed={currentSlots.includes(slotOption)}
                                        >
                                            <span class="time-slot-label__dot"></span>
                                            <span class="time-slot-label__text">{slotOption}</span>
                                        </button>
                                    {/each}
                                </div>
                            </div>

                            <!-- Selected Slots Display -->
                            <div class="mt-2 sm:mt-3 md:mt-4 p-5 sm:p-6 bg-gradient-to-r from-blue-50 to-transparent rounded-xl border border-gray-200">
                                <h3 class="font-semibold text-gray-700 text-sm sm:text-base mb-3.5">
                                    Selected Slots {selectedDate ? `for ${new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}` : ''}
                                </h3>
                                {#if currentSlots.length > 0}
                                    <div class="flex flex-wrap gap-2 sm:gap-2.5">
                                        {#each sortTimeSlots(currentSlots) as selectedSlot (selectedSlot)}
                                            <span class="slot-label text-xs sm:text-sm">
                                                {selectedSlot}
                                                <button
                                                    type="button"
                                                    class="slot-label__remove"
                                                    on:click={() => removeSlot(selectedSlot)}
                                                    aria-label={`Remove ${selectedSlot}`}
                                                    disabled={isSavingSchedule}
                                                >
                                                    ×
                                                </button>
                                            </span>
                                        {/each}
                                    </div>
                                {:else}
                                    <p class="text-xs sm:text-sm text-gray-500 italic">No time slots selected yet</p>
                                {/if}
                            </div>
                        </div>
                    {:else}
                        <div class="p-5 sm:p-6 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 text-center">
                            <p class="text-sm sm:text-base text-gray-600">Select time slots only available on working days</p>
                        </div>
                    {/if}

                    <!-- Save Button -->
                    <div class="flex flex-col gap-4 pt-3 border-t border-gray-200">
                        <button
                            on:click={saveSchedule}
                            disabled={isSavingSchedule || isLoadingSchedule || isSavingDefaults}
                            class="text-white px-6 sm:px-7 py-3 sm:py-2.5 text-xs sm:text-sm rounded-lg font-semibold flex items-center justify-center gap-2 min-h-[48px] sm:min-h-[44px] transition-all duration-200 active:scale-95 disabled:active:scale-100 shadow-md hover:shadow-lg disabled:shadow-none"
                            style="background: linear-gradient(135deg, #0b2d56 0%, #1a4d7a 100%); opacity: {isSavingSchedule || isLoadingSchedule || isSavingDefaults ? '0.65' : '1'};"
                            title={isSavingSchedule ? 'Saving... please wait' : (isLoadingSchedule ? 'Loading schedule...' : 'Click to save schedule')}
                        >
                            {#if isSavingSchedule}
                                <svg class="animate-spin h-4 w-4 sm:h-5 sm:w-5 text-white flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span>Saving...</span>
                            {:else if isLoadingSchedule}
                                <span>Loading...</span>
                            {:else}
                                <span>Save Availability</span>
                            {/if}
                        </button>
                        {#if isSavingSchedule}
                            <p class="text-xs text-center text-gray-600">This may take a moment...</p>
                        {/if}
                    </div>
                </div>
            {:else if !selectedDate && !isLoadingDefaults && !isLoadingSchedule}
                <div class="text-center py-8 sm:py-10">
                    <p class="text-gray-600 text-base font-medium">Please select a date to get started</p>
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        border: 0;
    }

    .day-toggle {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        gap: 0.25rem;
        padding: 0.5rem 0.25rem;
        border-radius: 0.5rem;
        border: 2px solid #e5e7eb;
        background: #fff;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        width: 100%;
        font-weight: 600;
    }
    @media (min-width: 640px) {
        .day-toggle {
            flex-direction: row;
            gap: 0.7rem;
            justify-content: flex-start;
            min-width: 110px;
            padding: 0.6rem 1.1rem;
            border-radius: 0.75rem;
            width: auto;
        }
    }
    .day-toggle__dot {
        width: 0.5rem;
        height: 0.5rem;
        min-width: 0.5rem;
        min-height: 0.5rem;
        flex-shrink: 0;
        border-radius: 9999px;
        background: #d1d5db;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        margin: 0;
    }
    @media (min-width: 640px) {
        .day-toggle__dot {
            width: 0.65rem;
            height: 0.65rem;
            min-width: 0.65rem;
            min-height: 0.65rem;
            margin-right: 0.5rem;
        }
    }
    .day-toggle__label {
        font-size: 0.625rem;
        font-weight: 700;
        color: #374151;
        letter-spacing: 0.01em;
        text-align: center;
        line-height: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
    }
    @media (min-width: 640px) {
        .day-toggle__label {
            font-size: 0.95rem;
            text-align: left;
        }
    }
    .day-toggle:hover {
        border-color: #93c5fd;
        box-shadow: 0 4px 12px rgba(11, 45, 86, 0.08);
    }
    .day-toggle--active {
        border-color: #0b2d56;
        background: linear-gradient(135deg, rgba(11,45,86,0.08), rgba(11,45,86,0.04));
    }
    .day-toggle--active .day-toggle__dot {
        background: #0b2d56;
        transform: scale(1.2);
        box-shadow: 0 2px 4px rgba(11, 45, 86, 0.2);
    }
    .day-toggle--active .day-toggle__label {
        color: #0b2d56;
    }

    /* Time Slot Buttons - Label Style (matching day-toggle) */
    .time-slot-label {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        gap: 0.25rem;
        padding: 0.5rem 0.6rem;
        border-radius: 0.65rem;
        border: 2px solid #e5e7eb;
        background: #fff;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        min-width: fit-content;
        font-weight: 600;
    }
    @media (min-width: 640px) {
        .time-slot-label {
            flex-direction: row;
            gap: 0.6rem;
            justify-content: flex-start;
            min-width: fit-content;
            padding: 0.6rem 1rem;
            border-radius: 0.75rem;
        }
    }
    .time-slot-label__dot {
        width: 0.5rem;
        height: 0.5rem;
        min-width: 0.5rem;
        min-height: 0.5rem;
        flex-shrink: 0;
        border-radius: 9999px;
        background: #d1d5db;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        margin-bottom: 0.05rem;
    }
    @media (min-width: 640px) {
        .time-slot-label__dot {
            width: 0.65rem;
            height: 0.65rem;
            min-width: 0.65rem;
            min-height: 0.65rem;
            margin-bottom: 0;
            margin-right: 0.3rem;
        }
    }
    .time-slot-label__text {
        font-size: 0.65rem;
        font-weight: 700;
        color: #374151;
        letter-spacing: 0.01em;
        text-align: center;
        line-height: 1;
    }
    @media (min-width: 640px) {
        .time-slot-label__text {
            font-size: 0.9rem;
            text-align: left;
            line-height: 1.1;
        }
    }
    .time-slot-label:hover {
        border-color: #93c5fd;
        box-shadow: 0 2px 6px rgba(11, 45, 86, 0.08);
    }
    .time-slot-label--active {
        border-color: #0b2d56;
        background: linear-gradient(135deg, rgba(11,45,86,0.08), rgba(11,45,86,0.04));
    }
    .time-slot-label--active .time-slot-label__dot {
        background: #0b2d56;
        transform: scale(1.15);
        box-shadow: 0 1px 3px rgba(11, 45, 86, 0.2);
    }
    .time-slot-label--active .time-slot-label__text {
        color: #0b2d56;
    }
    .time-slot-label:disabled {
        cursor: not-allowed;
        opacity: 0.55;
    }
    /* Section Styling */
    .morning-section {
        border-top-width: 3px;
        border-top-color: #fbbf24;
    }
    .afternoon-section {
        border-top-width: 3px;
        border-top-color: #f97316;
    }
    .morning-section:hover,
    .afternoon-section:hover {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    }

    .slot-label {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.45rem 0.85rem;
        background: linear-gradient(135deg, #f0f4f8, transparent);
        color: #0b2d56;
        border: 2px solid #c5d4e8;
        border-radius: 0.625rem;
        font-weight: 700;
        font-size: 0.8rem;
        min-height: 34px;
        transition: all 0.2s ease;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    }
    @media (min-width: 640px) {
        .slot-label {
            padding: 0.45rem 0.95rem;
            font-size: 0.9rem;
            min-height: auto;
        }
    }
    .slot-label:hover {
        border-color: #a8c9e3;
        box-shadow: 0 2px 4px rgba(11, 45, 86, 0.08);
    }
    .slot-label__remove {
        border: none;
        background: transparent;
        color: inherit;
        font-size: 1rem;
        line-height: 1;
        cursor: pointer;
        padding: 0;
        margin-left: 0.2rem;
    }
    .slot-label__remove:disabled {
        cursor: not-allowed;
        opacity: 0.5;
    }

    .select-all-btn {
        padding: 0.65rem 1.2rem;
        border-radius: 0.625rem;
        background: linear-gradient(135deg, #0b2d56 0%, #1a4d7a 100%);
        color: #fff;
        font-size: 0.8rem;
        font-weight: 700;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        border: none;
        cursor: pointer;
        min-height: 44px;
        touch-action: manipulation;
        box-shadow: 0 2px 8px rgba(11, 45, 86, 0.15);
        letter-spacing: 0.01em;
    }
    @media (min-width: 640px) {
        .select-all-btn {
            padding: 0.6rem 1.25rem;
            font-size: 0.9rem;
            min-height: 40px;
        }
    }
    .select-all-btn:hover:not(:disabled) {
        background: linear-gradient(135deg, #051f35 0%, #0d3d5c 100%);
        box-shadow: 0 4px 12px rgba(11, 45, 86, 0.25);
        transform: translateY(-2px);
    }
    .select-all-btn:active:not(:disabled) {
        transform: translateY(0) scale(0.98);
    }
    .select-all-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    /* Responsive container padding */
    @media (max-width: 640px) {
        :global(.min-h-screen) {
            padding-left: 0;
            padding-right: 0;
        }
    }
</style>