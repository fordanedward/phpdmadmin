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
  let userHasModifiedSlots: boolean = false;


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
      userHasModifiedSlots = false; 

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

<div class="bg-gradient-to-br from-blue-50 via-white to-gray-100 min-h-screen">
    <div class="max-w-6xl mx-auto px-3 sm:p-4 md:p-6 py-4 sm:py-6">
        <div class="mb-4 sm:mb-6 md:mb-8">
            <div class="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="color: #0b2d56;">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h1 class="text-2xl sm:text-3xl md:text-4xl font-bold" style="color: #0b2d56;">Availability Settings</h1>
            </div>
            <p class="text-gray-600 text-xs sm:text-sm md:text-base pl-8 sm:pl-11">Configure your working days and time slot availability for member bookings.</p>
        </div>

        <!-- Section for Default Working Days -->
        <div class="bg-white rounded-lg shadow-lg hover:shadow-xl transition-all p-3 sm:p-4 md:p-5 mb-4 sm:mb-5 md:mb-6">
            <h2 class="text-sm sm:text-base md:text-lg lg:text-xl font-bold mb-2 sm:mb-3 md:mb-4 text-blue-700">Default Working Days</h2>

            {#if isLoadingDefaults}
                <div class="text-center py-3 sm:py-4">
                    <div class="inline-block animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-3 sm:border-4 border-blue-500 border-t-transparent"></div>
                    <p class="mt-2 text-gray-600 text-xs sm:text-sm">Loading...</p>
                </div>
            {:else}
                <p class="text-xs sm:text-sm text-gray-600 mb-2 sm:mb-3 md:mb-4">Select days available for booking by default.</p>
                <div class="grid grid-cols-7 gap-1 sm:gap-2 mb-3 sm:mb-4">
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
                <div class="mt-3 sm:mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2">
                    {#if isSavingDefaults}
                        <p class="text-xs sm:text-sm text-blue-600 italic text-center sm:text-right">Saving...</p>
                    {/if}
                    <button
                        on:click={() => saveDefaultSettings(false)}
                        disabled={isSavingDefaults || !hasDefaultChanges}
                        class="bg-blue-500 hover:bg-blue-600 text-white px-3 sm:px-4 py-2 text-xs sm:text-sm rounded shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                    >
                        Save Default Settings
                    </button>
                    {#if !hasDefaultChanges && !isSavingDefaults}
                        <p class="text-[10px] sm:text-xs text-gray-500 text-center sm:text-right">No changes to save.</p>
                    {:else if hasDefaultChanges && !isSavingDefaults}
                        <p class="text-[10px] sm:text-xs text-orange-600 text-center sm:text-right">You have unsaved changes.</p>
                    {/if}
                </div>
            {/if}
        </div>

        <!-- Section for Specific Date Availability -->
        <div class="bg-white rounded-lg shadow-lg hover:shadow-xl transition-all p-3 sm:p-4 md:p-5">
            <h2 class="text-sm sm:text-base md:text-lg lg:text-xl font-bold mb-2 sm:mb-3 md:mb-4 text-blue-700">Specific Date Schedule</h2>

            <div class="mb-3 sm:mb-4 md:mb-6">
                <label for="scheduleDate" class="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">Select Date:</label>
                <input
                    type="date"
                    id="scheduleDate"
                    bind:value={selectedDate}
                    min={new Date().toISOString().split('T')[0]}
                    class="w-full sm:max-w-xs border border-gray-300 rounded px-3 py-2 text-xs sm:text-sm focus:ring-blue-500 focus:border-blue-500"
                    disabled={isLoadingSchedule || isLoadingDefaults || isSavingSchedule || isSavingDefaults}
                />
            </div>

            {#if isLoadingSchedule || isLoadingDefaults}
                <div class="text-center py-3 sm:py-4">
                    <div class="inline-block animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-3 sm:border-4 border-blue-500 border-t-transparent"></div>
                    <p class="mt-2 text-gray-600 text-xs sm:text-sm">Loading schedule for {selectedDate}...</p>
                </div>
            {:else if selectedDate && db}
                <div class="space-y-2 sm:space-y-3 md:space-y-4">
                    <!-- Working Day Toggle -->
                    <div class="p-2 sm:p-3 border rounded bg-blue-50 border-blue-200">
                        <label class="flex items-center space-x-2">
                            <input
                                type="checkbox"
                                bind:checked={isWorkingDay}
                                class="form-checkbox h-4 w-4 sm:h-5 sm:w-5 text-blue-600 rounded focus:ring-blue-500"
                                disabled={isSavingSchedule}
                            />
                            <span class="text-gray-800 font-medium text-xs sm:text-sm">Working day?</span>
                        </label>
                    </div>

                    <!-- Time Slot Selection -->
                    {#if isWorkingDay}
                        <div class="space-y-2 sm:space-y-3 md:space-y-4">
                            <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                <button
                                    type="button"
                                    class="select-all-btn text-xs sm:text-sm px-3 py-1.5 sm:px-4 sm:py-2 w-full sm:w-auto"
                                    on:click={toggleAllSlots}
                                    disabled={isSavingSchedule}
                                    aria-pressed={allSlotsSelected}
                                >
                                    {allSlotsSelected ? 'Unselect All' : 'Select All'}
                                </button>
                            </div>
                            
                            <!-- Morning Slots -->
                            <div>
                                <h4 class="text-xs sm:text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 sm:h-5 sm:w-5 text-yellow-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                                    </svg>
                                    Morning
                                </h4>
                                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5 sm:gap-2">
                                    {#each ALL_POSSIBLE_MORNING_SLOTS as slotOption (slotOption)}
                                        <button
                                            type="button"
                                            class="slot-chip text-xs sm:text-sm"
                                            class:selected={currentSlots.includes(slotOption)}
                                            on:click={() => toggleSlot(slotOption)}
                                            disabled={isSavingSchedule}
                                            aria-pressed={currentSlots.includes(slotOption)}
                                        >
                                            {slotOption}
                                        </button>
                                    {/each}
                                </div>
                            </div>
                            
                            <!-- Afternoon Slots -->
                            <div>
                                <h4 class="text-xs sm:text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 sm:h-5 sm:w-5 text-orange-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                                    </svg>
                                    Afternoon
                                </h4>
                                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5 sm:gap-2">
                                    {#each ALL_POSSIBLE_AFTERNOON_SLOTS as slotOption (slotOption)}
                                        <button
                                            type="button"
                                            class="slot-chip text-xs sm:text-sm"
                                            class:selected={currentSlots.includes(slotOption)}
                                            on:click={() => toggleSlot(slotOption)}
                                            disabled={isSavingSchedule}
                                            aria-pressed={currentSlots.includes(slotOption)}
                                        >
                                            {slotOption}
                                        </button>
                                    {/each}
                                </div>
                            </div>

                            <!-- Selected Slots Display -->
                            <div class="mt-2 sm:mt-3 md:mt-4 p-3 sm:p-4 bg-gray-50 rounded-lg">
                                <h3 class="font-medium mb-2 text-gray-700 text-xs sm:text-sm">
                                    Selected Slots {selectedDate ? `for ${new Date(selectedDate).toLocaleDateString()}` : ''}
                                </h3>
                                {#if currentSlots.length > 0}
                                    <div class="flex flex-wrap gap-1.5 sm:gap-2">
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
                                    <p class="text-xs sm:text-sm text-gray-500 italic">No time slots selected for this day.</p>
                                {/if}
                            </div>
                        </div>
                    {:else}
                        <p class="text-xs sm:text-sm text-gray-500 italic p-3 bg-gray-50 rounded border">Time slots cannot be selected because this date is marked as not a working day.</p>
                    {/if}

                    <!-- Save Button -->
                    <div class="mt-4 sm:mt-6 flex justify-center sm:justify-end">
                        <button
                            on:click={saveSchedule}
                            disabled={isSavingSchedule || isLoadingSchedule || isSavingDefaults}
                            class="bg-blue-500 hover:bg-blue-600 text-white px-4 sm:px-5 py-2 text-xs sm:text-sm rounded shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                        >
                            {#if isSavingSchedule}
                                <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Saving...
                            {:else}
                                Save Schedule
                            {/if}
                        </button>
                    </div>
                </div>
            {:else if !selectedDate && !isLoadingDefaults && !isLoadingSchedule}
                <p class="text-gray-500 text-sm">Please select a date.</p>
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
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        gap: 0.25rem;
        padding: 0.5rem 0.5rem;
        border-radius: 0.5rem;
        border: 1px solid #e5e7eb;
        background: #fff;
        cursor: pointer;
        transition: all 0.15s ease-in-out;
        box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
        min-width: fit-content;
    }
    @media (min-width: 640px) {
        .day-toggle {
            flex-direction: row;
            gap: 0.6rem;
            justify-content: flex-start;
            min-width: 110px;
            padding: 0.5rem 1rem;
        }
    }
    .day-toggle__dot {
        width: 0.65rem;
        height: 0.65rem;
        min-width: 0.65rem;
        min-height: 0.65rem;
        flex-shrink: 0;
        border-radius: 9999px;
        background: #d1d5db;
        transition: background 0.15s ease-in-out, transform 0.15s ease-in-out;
        margin-bottom: 0.1rem;
    }
    @media (min-width: 640px) {
        .day-toggle__dot {
            margin-bottom: 0;
            margin-right: 0.5rem;
        }
    }
    .day-toggle__label {
        font-size: 0.7rem;
        font-weight: 600;
        color: #1f2937;
        letter-spacing: 0.01em;
        text-align: center;
        line-height: 1.1;
    }
    @media (min-width: 640px) {
        .day-toggle__label {
            font-size: 1rem;
            text-align: left;
        }
    }
    .day-toggle:hover {
        border-color: #cbd5f5;
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.12);
    }
    .day-toggle--active {
        border-color: #2563eb;
        background: linear-gradient(135deg, rgba(37,99,235,0.12), rgba(59,130,246,0.08));
    }
    .day-toggle--active .day-toggle__dot {
        background: #2563eb;
        transform: scale(1.1);
    }
    .day-toggle--active .day-toggle__label {
        color: #1d4ed8;
    }

    .slot-chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0.4rem 0.6rem;
        border: 1px solid #d1d5db;
        border-radius: 9999px;
        font-size: 0.75rem;
        font-weight: 600;
        color: #1f2937;
        background-color: #fff;
        transition: all 0.15s ease-in-out;
        cursor: pointer;
        min-height: 32px;
    }
    @media (min-width: 640px) {
        .slot-chip {
            padding: 0.5rem 0.75rem;
            font-size: 0.85rem;
            min-height: auto;
        }
    }
    .slot-chip:hover:not(:disabled) {
        border-color: #2563eb;
        color: #1d4ed8;
        background-color: #f0f9ff;
    }
    .slot-chip.selected {
        background-color: #2563eb;
        border-color: #2563eb;
        color: #fff;
        box-shadow: 0 4px 12px rgba(37, 99,235, 0.25);
    }
    .slot-chip:disabled {
        cursor: not-allowed;
        opacity: 0.6;
    }

    .slot-label {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0.3rem 0.6rem;
        background-color: #e0f2fe;
        color: #075985;
        border-radius: 9999px;
        font-weight: 600;
        font-size: 0.75rem;
    }
    @media (min-width: 640px) {
        .slot-label {
            padding: 0.35rem 0.75rem;
            font-size: 0.85rem;
        }
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
        padding: 0.35rem 0.75rem;
        border-radius: 0.375rem;
        background-color: #2563eb;
        color: #fff;
        font-size: 0.75rem;
        font-weight: 600;
        transition: background-color 0.15s ease-in-out;
        border: none;
        cursor: pointer;
    }
    @media (min-width: 640px) {
        .select-all-btn {
            padding: 0.4rem 0.85rem;
            font-size: 0.85rem;
        }
    }
    .select-all-btn:hover:not(:disabled) {
        background-color: #1d4ed8;
    }
    .select-all-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    /* Responsive container padding */
    @media (max-width: 640px) {
        :global(.bg-gradient-to-br.from-blue-50) {
            padding-left: 0;
            padding-right: 0;
        }
    }
</style>