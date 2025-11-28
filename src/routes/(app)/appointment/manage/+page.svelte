<script lang="ts">
    import { onMount } from 'svelte';
    import { getFirestore, collection, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
    import { initializeApp } from 'firebase/app';
    import { firebaseConfig } from '$lib/firebaseConfig'; // Make sure this path is correct
    import { addPopupNotification } from '$lib/popupNotificationStore.js';
    import Swal from 'sweetalert2';
  
    let db: ReturnType<typeof getFirestore>;
    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
    } catch (e: any) {
        db = getFirestore(); 
    }
  
    let patientProfiles: PatientProfile[] = [];
    let appointments: any[] = [];
    let loading = true;
    let message = '';
    let error = '';
    let currentTab = 0;
    let showReasonModal = false;
    let rejectionReason = '';
    let pendingAppointmentId = '';
    let search = '';
    let selectedService = '';
    let sortBy = 'dateDesc';
    let uniqueServices: string[] = [];
  
    let isMobile = false;
  
  interface PatientProfile {
    id: string;
    name: string;
    lastName: string;
    age: number;
    email: string;
    gender?: string;
  }    function checkMobile() {
      if (typeof window !== 'undefined') {
        isMobile = window.innerWidth < 768;
      }
    }
  
    function updateUniqueServices() {
      // Predefined list of all available services
      const allServices = [
        'Laboratory',
        'Imaging',
        'Doctor\'s Consultation'
      ];
      
      uniqueServices = allServices.sort();
    }
  
    function filterAndSort(list: any[]) {
      let filtered = list;
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        filtered = filtered.filter(a =>
          (a.patientName && a.patientName.toLowerCase().includes(s)) ||
          (a.patientEmail && a.patientEmail.toLowerCase().includes(s)) ||
          (a.patientId && a.patientId.toLowerCase().includes(s))
        );
      }
      if (selectedService) {
        filtered = filtered.filter(a => a.service === selectedService);
      }
      if (sortBy === 'dateAsc') {
        filtered = filtered.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      } else if (sortBy === 'dateDesc') {
        filtered = filtered.slice().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      } else if (sortBy === 'name') {
        filtered = filtered.slice().sort((a, b) => (a.patientName || '').localeCompare(b.patientName || ''));
      }
      return filtered;
    }
  
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
        email: data.email || '',
        gender: data.gender || ''
      } as PatientProfile;
    });
  }  async function fetchAppointments() {
    const appointmentsRef = collection(db, 'appointments');
    const snapshot = await getDocs(appointmentsRef);
    appointments = snapshot.docs.map(doc => {
      const data = doc.data();
      const patient = patientProfiles.find(p => p.id === data.patientId);
      return {
        id: doc.id,
        ...data,
        patientName: patient ? `${patient.name} ${patient.lastName}`.trim() : 'Unknown Patient',
        patientAge: patient?.age && patient.age > 0 ? patient.age : 'N/A',
        patientGender: patient?.gender && patient.gender.trim() ? patient.gender : 'N/A',
        patientEmail: patient?.email || ''
      };
    });
    updateUniqueServices();
  }    // MODIFIED onMount structure
    onMount(() => {
      const initializePage = async () => {
        loading = true;
        
        // Mobile detection setup
        if (typeof window !== 'undefined') {
          checkMobile(); // Initial check
          // The event listener for resize is now added directly in onMount's scope below
        }
    
        try {
          await fetchPatientProfiles(); // Fetch profiles first
          await fetchAppointments();    // Then fetch appointments
        } catch (err: any) {
          console.error("Error fetching data on mount:", err);
          error = `Failed to load initial data: ${err.message || 'Unknown error'}`;
        } finally {
          loading = false;
        }
      };
  
      initializePage(); // Call the async initialization function
  
      // Add event listener directly in the synchronous onMount scope
      if (typeof window !== 'undefined') {
        window.addEventListener('resize', checkMobile);
      }
  
      // Return the cleanup function directly from the synchronous onMount callback
      return () => {
        if (typeof window !== 'undefined') {
          window.removeEventListener('resize', checkMobile);
        }
      };
    });
  
    async function handleAccept(appointment: any) {
      const result = await Swal.fire({
        title: 'Accept Appointment?',
        text: 'Are you sure you want to accept this appointment?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Yes, Accept',
        confirmButtonColor: '#3B82F6',
        cancelButtonColor: '#6B7280',
      });
      if (result.isConfirmed) {
        await updateStatus(appointment.id, { status: 'Accepted', cancellationStatus: '' });
      }
    }
  
    function openReasonModal(id: string) {
      pendingAppointmentId = id;
      rejectionReason = '';
      showReasonModal = true;
    }
  
    async function confirmRejection() {
      if (!rejectionReason.trim()) {
        await Swal.fire('Error!', 'Please provide a reason for declining.', 'error');
        return;
      }
      showReasonModal = false;
      await updateStatus(pendingAppointmentId, { status: 'Decline', reason: rejectionReason, cancellationStatus: '' });
    }
  
    async function handleRescheduleAccept(appointment: any) {
      const result = await Swal.fire({
        title: 'Accept Reschedule?',
        text: 'Are you sure you want to accept this reschedule request?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Yes, Accept',
        confirmButtonColor: '#10B981',
        cancelButtonColor: '#6B7280',
      });
      if (result.isConfirmed) {
        await updateStatus(appointment.id, { status: 'Rescheduled' });
      }
    }
  
    async function handleRescheduleReject(appointment: any) {
      const result = await Swal.fire({
        title: 'Decline Reschedule?',
        text: 'Are you sure you want to decline this reschedule request? The appointment will revert to its previous status.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Yes, Decline',
        confirmButtonColor: '#EF4444',
        cancelButtonColor: '#6B7280',
      });
      if (result.isConfirmed) {
        await updateStatus(appointment.id, { status: 'Accepted' }); 
      }
    }
  
    async function handleCancelApprove(appointment: any) {
      const result = await Swal.fire({
        title: 'Approve Cancellation?',
        text: 'Are you sure you want to approve this cancellation request? This will cancel the appointment.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Yes, Approve',
        confirmButtonColor: '#10B981', 
        cancelButtonColor: '#6B7280',
      });
      if (result.isConfirmed) {
        await updateStatus(appointment.id, { cancellationStatus: 'Approved', status: 'Cancelled' });
      }
    }
  
    async function handleCancelDecline(appointment: any) {
      const result = await Swal.fire({
        title: 'Decline Cancellation?',
        text: 'Are you sure you want to decline this cancellation request?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Yes, Decline',
        confirmButtonColor: '#EF4444',
        cancelButtonColor: '#6B7280',
      });
      if (result.isConfirmed) {
        await updateStatus(appointment.id, { cancellationStatus: 'Declined' });
      }
    }
  
    async function updateStatus(id: string, update: any) {
      loading = true;
      message = '';
      error = '';
      try {
        await updateDoc(doc(db, 'appointments', id), update);
        message = 'Status updated successfully!';
        
        // Show popup notification for status update
        const statusText = update.status || update.cancellationStatus || 'updated';
        addPopupNotification(
          `Appointment status changed to ${statusText}`,
          'success',
          5000
        );
        
        await fetchAppointments();
      } catch (e: any) {
        console.error("Failed to update status:", e);
        error = `Failed to update status: ${e.message || 'Unknown error'}`;
        addPopupNotification(
          'Failed to update appointment status',
          'error',
          4000
        );
      } finally {
        loading = false;
      }
    }

    async function handleMarkComplete(appointment: any) {
      const { value: remarks } = await Swal.fire({
        title: 'Mark as Completed?',
        html: `
          <p class="mb-3">Confirm that ${appointment.patientName || 'this patient'} has completed their appointment on ${appointment.date} at ${appointment.time}?</p>
          <textarea id="completion-remarks" class="swal2-input" placeholder="Enter remarks (optional)..." style="height: 50px; resize: vertical;"></textarea>
        `,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Yes, Mark Complete',
        confirmButtonColor: '#10B981',
        cancelButtonColor: '#6B7280',
        focusConfirm: false,
        preConfirm: () => {
          const textarea = document.getElementById('completion-remarks') as HTMLTextAreaElement;
          return textarea.value.trim();
        }
      });
      
      if (remarks !== undefined) { // User clicked confirm (remarks can be empty string)
        const now = new Date().toISOString();
        await updateStatus(appointment.id, { 
          status: 'Completed',
          completionTime: now,
          completionRemarks: remarks || ''
        });
      }
    }

    async function handleDelete(appointment: any) {
      const result = await Swal.fire({
        title: 'Delete Appointment?',
        text: `Are you sure you want to permanently delete this appointment for ${appointment.patientName || 'this patient'}? This action cannot be undone.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Yes, Delete',
        confirmButtonColor: '#EF4444',
        cancelButtonColor: '#6B7280',
      });
      if (result.isConfirmed) {
        loading = true;
        message = '';
        error = '';
        try {
          await deleteDoc(doc(db, 'appointments', appointment.id));
          message = 'Appointment deleted successfully!';
          addPopupNotification(
            `Appointment for ${appointment.patientName || 'patient'} deleted`,
            'success',
            5000
          );
          await fetchAppointments();
        } catch (e: any) {
          console.error("Failed to delete appointment:", e);
          error = `Failed to delete appointment: ${e.message || 'Unknown error'}`;
          addPopupNotification(
            'Failed to delete appointment',
            'error',
            4000
          );
          loading = false;
        }
      }
    }
  </script>
  
  <!-- HTML Part remains the same -->
  <div class="bg-gradient-to-br from-blue-50 via-white to-gray-100 min-h-screen">
    <div class="p-4 sm:p-6">
      <div class="max-w-6xl mx-auto">
        <h1 class="text-2xl sm:text-3xl font-extrabold mb-6 sm:mb-8 text-blue-800 tracking-tight flex items-center gap-2 sm:gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 sm:h-7 sm:w-7 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            Appointment Management
          </h1>
  
      <div class="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-gray-200 rounded-lg shadow-sm flex flex-wrap gap-3 sm:gap-4 mb-6 sm:mb-8 items-end px-3 sm:px-4 py-3">
        <div class="relative flex-1 min-w-[180px] sm:min-w-[200px]">
          <label for="search-input" class="block text-xs font-semibold text-gray-600 mb-1">Search</label>
          <input id="search-input" type="text" bind:value={search} placeholder="Name, email, or ID" class="w-full border rounded px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500 shadow-sm" />
        </div>
        <div class="min-w-[140px] sm:min-w-[150px]">
          <label for="service-select" class="block text-xs font-semibold text-gray-600 mb-1">Service</label>
          <select id="service-select" bind:value={selectedService} class="border rounded px-3 py-2 w-full text-sm focus:ring-blue-500 focus:border-blue-500 shadow-sm">
            <option value="">All Services</option>
            {#each uniqueServices as s (s)}
              <option value={s}>{s}</option>
            {/each}
          </select>
        </div>
        <div class="min-w-[140px] sm:min-w-[150px]">
          <label for="sort-select" class="block text-xs font-semibold text-gray-600 mb-1">Sort By</label>
          <select id="sort-select" bind:value={sortBy} class="border rounded px-3 py-2 w-full text-sm focus:ring-blue-500 focus:border-blue-500 shadow-sm">
            <option value="dateDesc">Date (Newest)</option>
            <option value="dateAsc">Date (Oldest)</option>
            <option value="name">Patient Name</option>
          </select>
        </div>
      </div>
  
      {#if message}
        <div class="mb-4 p-3 bg-green-100 text-green-800 rounded-md shadow-sm text-sm">{message}</div>
      {/if}
      {#if error}
        <div class="mb-4 p-3 bg-red-100 text-red-800 rounded-md shadow-sm text-sm">{error}</div>
      {/if}
  
      {#if loading && appointments.length === 0} 
        <p class="text-center text-lg text-gray-500 py-10">Loading appointments...</p>
      {:else}
        <div class="mb-6 sm:mb-8 flex flex-wrap md:flex-nowrap gap-1 sm:gap-2 border-b border-gray-300">
          <button 
            class="py-2 px-2 text-sm sm:text-base sm:px-3 md:px-6 -mb-px border-b-2 font-semibold focus:outline-none transition-colors duration-150 flex-grow md:flex-grow-0 text-center whitespace-nowrap {currentTab === 0 ? 'border-blue-500 text-blue-700 bg-blue-50' : 'border-transparent text-gray-500 hover:text-blue-600 hover:bg-gray-100'}" 
            on:click={() => currentTab = 0}>
            {isMobile ? 'Pending' : 'Pending Appointments'}
          </button>
          <button 
            class="py-2 px-2 text-sm sm:text-base sm:px-3 md:px-6 -mb-px border-b-2 font-semibold focus:outline-none transition-colors duration-150 flex-grow md:flex-grow-0 text-center whitespace-nowrap {currentTab === 1 ? 'border-blue-500 text-blue-700 bg-blue-50' : 'border-transparent text-gray-500 hover:text-blue-600 hover:bg-gray-100'}" 
            on:click={() => currentTab = 1}>
            {isMobile ? 'Reschedule' : 'Pending Reschedule'}
          </button>
          <button 
            class="py-2 px-2 text-sm sm:text-base sm:px-3 md:px-6 -mb-px border-b-2 font-semibold focus:outline-none transition-colors duration-150 flex-grow md:flex-grow-0 text-center whitespace-nowrap {currentTab === 2 ? 'border-blue-500 text-blue-700 bg-blue-50' : 'border-transparent text-gray-500 hover:text-blue-600 hover:bg-gray-100'}" 
            on:click={() => currentTab = 2}>
            {isMobile ? 'Cancellation' : 'Pending Cancellation'}
          </button>
          <button 
            class="py-2 px-2 text-sm sm:text-base sm:px-3 md:px-6 -mb-px border-b-2 font-semibold focus:outline-none transition-colors duration-150 flex-grow md:flex-grow-0 text-center whitespace-nowrap {currentTab === 3 ? 'border-blue-500 text-blue-700 bg-blue-50' : 'border-transparent text-gray-500 hover:text-blue-600 hover:bg-gray-100'}" 
            on:click={() => currentTab = 3}>
            {isMobile ? 'History' : 'Appointment History'}
          </button>
        </div>
  
        {#if currentTab === 0}
          {@const pendingAppointments = filterAndSort(appointments.filter(a => a.status === 'pending' && (!a.cancellationStatus || a.cancellationStatus === 'Declined')))}
          <section class="mb-12">
            <h2 class="text-lg sm:text-xl font-bold mb-4 text-blue-700 flex items-center gap-2">
              <svg xmlns='http://www.w3.org/2000/svg' class='h-5 w-5 sm:h-6 sm:w-6 text-blue-400' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z'/></svg>
              Pending Appointments ({pendingAppointments.length})
            </h2>
            {#if pendingAppointments.length > 0}
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {#each pendingAppointments as appointment (appointment.id)}
                <div class="bg-white border-l-4 border-blue-400 border-opacity-60 rounded-lg shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all p-3 sm:p-4 flex flex-col gap-1 sm:gap-2">
                  {#if appointment.patientName && appointment.patientName !== 'Unknown Patient'}
                    <div class="font-bold text-md sm:text-lg text-gray-800 flex items-center gap-2">
                      <span>{appointment.patientName}</span>
                      <span class="text-xs font-normal text-gray-500">({appointment.patientAge !== 'N/A' ? `${appointment.patientAge} yrs` : 'Age: N/A'}, {appointment.patientGender})</span>
                    </div>
                    {#if appointment.patientEmail}
                      <div class="text-xs text-gray-500 break-all">{appointment.patientEmail}</div>
                    {/if}
                  {:else}
                    <div class="font-semibold text-sm sm:text-base text-gray-800 italic">Patient ID: {appointment.patientId} <span class="text-xs text-gray-500">(Profile missing)</span></div>
                  {/if}
                  <div class="flex flex-col gap-1 text-xs sm:text-sm mt-1">
                    <span class="inline-block px-2 py-1 rounded bg-blue-100 text-blue-700 font-medium">{appointment.date} at {appointment.time}</span>
                    <span class="inline-block px-2 py-1 rounded bg-gray-100 text-gray-700">Service: {appointment.service}</span>
                    {#if appointment.subServices && Array.isArray(appointment.subServices) && appointment.subServices.length > 0 && appointment.subServices.join(', ').trim() !== ''}
                      <span class="inline-block px-2 py-1 rounded bg-gray-50 text-gray-700">Selected: {appointment.subServices.join(', ')}</span>
                    {/if}
                  </div>
                  <div class="flex-1"></div>
                  <div class="flex gap-2 justify-end">
                    <button class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 text-xs sm:text-sm rounded shadow-sm transition" title="Accept Appointment" on:click={() => handleAccept(appointment)}>
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 sm:h-5 sm:w-5 inline-block mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>Accept
                    </button>
                    <button class="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 text-xs sm:text-sm rounded shadow-sm transition" title="Decline Appointment" on:click={() => openReasonModal(appointment.id)}>
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 sm:h-5 sm:w-5 inline-block mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>Decline
                    </button>
                  </div>
                </div>
              {/each}
            </div>
            {:else}
              <div class="text-gray-500 col-span-full text-center py-5">No pending appointments.</div>
            {/if}
          </section>
  
        {:else if currentTab === 1}
          {@const rescheduleRequests = filterAndSort(appointments.filter(a => a.status === 'Reschedule Requested'))}
          <section class="mb-12">
            <h2 class="text-lg sm:text-xl font-bold mb-4 text-yellow-600 flex items-center gap-2">
              <svg xmlns='http://www.w3.org/2000/svg' class='h-5 w-5 sm:h-6 sm:w-6 text-yellow-400' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z'/></svg>
              Pending Reschedule Requests ({rescheduleRequests.length})
            </h2>
            {#if rescheduleRequests.length > 0}
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {#each rescheduleRequests as appointment (appointment.id)}
                <div class="bg-white border-l-4 border-yellow-400 border-opacity-60 rounded-lg shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all p-3 sm:p-4 flex flex-col gap-1 sm:gap-2">
                  {#if appointment.patientName && appointment.patientName !== 'Unknown Patient'}
                    <div class="font-bold text-md sm:text-lg text-gray-800 flex items-center gap-2">
                      <span>{appointment.patientName}</span>
                      <span class="text-xs font-normal text-gray-500">({appointment.patientAge !== 'N/A' ? `${appointment.patientAge} yrs` : 'Age: N/A'}, {appointment.patientGender})</span>
                    </div>
                    {#if appointment.patientEmail}
                      <div class="text-xs text-gray-500 break-all">{appointment.patientEmail}</div>
                    {/if}
                  {:else}
                    <div class="font-semibold text-sm sm:text-base text-gray-800 italic">Patient ID: {appointment.patientId} <span class="text-xs text-gray-500">(Profile missing)</span></div>
                  {/if}
                  <div class="flex flex-col gap-1 text-xs sm:text-sm mt-1">
                    {#if appointment.originalDate && appointment.originalTime}
                      <span class="text-gray-600">Original: <span class="font-medium">{appointment.originalDate} at {appointment.originalTime}</span></span>
                    {/if}
                    <span class="inline-block px-2 py-1 rounded bg-yellow-100 text-yellow-800 font-medium">Requests to: {appointment.date} at {appointment.time}</span>
                    <span class="inline-block px-2 py-1 rounded bg-gray-100 text-gray-700">Service: {appointment.service}</span>
                    {#if appointment.subServices && Array.isArray(appointment.subServices) && appointment.subServices.length > 0 && appointment.subServices.join(', ').trim() !== ''}
                      <span class="inline-block px-2 py-1 rounded bg-gray-50 text-gray-700">Selected: {appointment.subServices.join(', ')}</span>
                    {/if}
                  </div>
                  <div class="flex-1"></div>
                  <div class="flex gap-2 justify-end">
                    <button class="bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 text-xs sm:text-sm rounded shadow-sm transition" title="Accept Reschedule" on:click={() => handleRescheduleAccept(appointment)}>
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 sm:h-5 sm:w-5 inline-block mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>Accept
                    </button>
                    <button class="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 text-xs sm:text-sm rounded shadow-sm transition" title="Decline Reschedule" on:click={() => handleRescheduleReject(appointment)}>
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 sm:h-5 sm:w-5 inline-block mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>Decline
                    </button>
                  </div>
                </div>
              {/each}
            </div>
            {:else}
              <div class="text-gray-500 col-span-full text-center py-5">No pending reschedule requests.</div>
            {/if}
          </section>
  
        {:else if currentTab === 2}
          {@const cancellationRequests = filterAndSort(appointments.filter(a => a.cancellationStatus === 'requested'))}
          <section>
            <h2 class="text-lg sm:text-xl font-bold mb-4 text-red-700 flex items-center gap-2">
              <svg xmlns='http://www.w3.org/2000/svg' class='h-5 w-5 sm:h-6 sm:w-6 text-red-400' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z'/></svg>
              Pending Cancellation Requests ({cancellationRequests.length})
            </h2>
            {#if cancellationRequests.length > 0}
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {#each cancellationRequests as appointment (appointment.id)}
                <div class="bg-white border-l-4 border-red-400 border-opacity-60 rounded-lg shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all p-3 sm:p-4 flex flex-col gap-1 sm:gap-2">
                  {#if appointment.patientName && appointment.patientName !== 'Unknown Patient'}
                    <div class="font-bold text-md sm:text-lg text-gray-800 flex items-center gap-2">
                      <span>{appointment.patientName}</span>
                      <span class="text-xs font-normal text-gray-500">({appointment.patientAge !== 'N/A' ? `${appointment.patientAge} yrs` : 'Age: N/A'}, {appointment.patientGender})</span>
                    </div>
                    {#if appointment.patientEmail}
                      <div class="text-xs text-gray-500 break-all">{appointment.patientEmail}</div>
                    {/if}
                  {:else}
                    <div class="font-semibold text-sm sm:text-base text-gray-800 italic">Patient ID: {appointment.patientId} <span class="text-xs text-gray-500">(Profile missing)</span></div>
                  {/if}
                  <div class="flex flex-col gap-1 text-xs sm:text-sm mt-1">
                    <span class="inline-block px-2 py-1 rounded bg-red-100 text-red-700 font-medium">{appointment.date} at {appointment.time}</span>
                    <span class="inline-block px-2 py-1 rounded bg-gray-100 text-gray-700">Service: {appointment.service}</span>
                    {#if appointment.subServices && Array.isArray(appointment.subServices) && appointment.subServices.length > 0 && appointment.subServices.join(', ').trim() !== ''}
                      <span class="inline-block px-2 py-1 rounded bg-gray-50 text-gray-700">Selected: {appointment.subServices.join(', ')}</span>
                    {/if}
                  </div>
                   {#if appointment.cancellationReason}
                    <p class="text-xs text-gray-600 mt-1">Reason: <span class="italic">{appointment.cancellationReason}</span></p>
                  {/if}
                  <div class="flex-1"></div>
                  <div class="flex gap-2 justify-end">
                    <button class="bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 text-xs sm:text-sm rounded shadow-sm transition" title="Approve Cancellation" on:click={() => handleCancelApprove(appointment)}>
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 sm:h-5 sm:w-5 inline-block mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>Approve
                    </button>
                    <button class="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 text-xs sm:text-sm rounded shadow-sm transition" title="Decline Cancellation" on:click={() => handleCancelDecline(appointment)}>
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 sm:h-5 sm:w-5 inline-block mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>Decline
                    </button>
                  </div>
                </div>
              {/each}
            </div>
            {:else}
              <div class="text-gray-500 col-span-full text-center py-5">No pending cancellation requests.</div>
            {/if}
          </section>
  
        {:else if currentTab === 3}
          {@const completedAppointments = filterAndSort(appointments.filter(a => 
            a.status === 'Accepted' || 
            a.status === 'Decline' || 
            a.status === 'Cancelled' || 
            a.status === 'Completed' || 
            a.status === 'Rescheduled'
          ))}
          <section class="w-full bg-white bg-opacity-50 py-6 sm:py-8 px-4 sm:px-6 mt-6 sm:mt-8 -mx-4 sm:-mx-6">
            <div class="max-w-full mx-auto">
                <h2 class="text-lg sm:text-xl font-bold mb-4 text-green-700 flex items-center gap-2">
                  <svg xmlns='http://www.w3.org/2000/svg' class='h-5 w-5 sm:h-6 sm:w-6 text-green-400' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'/></svg>
                  Appointment History ({completedAppointments.length})
                </h2>
                {#if completedAppointments.length > 0}
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {#each completedAppointments as appointment (appointment.id)}
                {@const statusColor = 
                  appointment.status === 'Accepted' ? 'green' : 
                  appointment.status === 'Completed' ? 'blue' :
                  appointment.status === 'Rescheduled' ? 'yellow' :
                  appointment.status === 'Decline' ? 'red' : 
                  appointment.status === 'Cancelled' ? 'gray' : 'gray'}
                {@const borderClass = `border-${statusColor}-400`}
                {@const badgeClass = `bg-${statusColor}-100 text-${statusColor}-700`}
                <div class="bg-white border-l-4 {borderClass} border-opacity-60 rounded-lg shadow-lg hover:shadow-xl transition-all p-4 sm:p-5 flex flex-col gap-2 sm:gap-3">
                  {#if appointment.patientName && appointment.patientName !== 'Unknown Patient'}
                    <div class="font-bold text-md sm:text-lg text-gray-800 flex items-center gap-2">
                      <span>{appointment.patientName}</span>
                      <span class="text-xs font-normal text-gray-500">({appointment.patientAge !== 'N/A' ? `${appointment.patientAge} yrs` : 'Age: N/A'}, {appointment.patientGender})</span>
                    </div>
                    {#if appointment.patientEmail}
                      <div class="text-xs text-gray-500 break-all">{appointment.patientEmail}</div>
                    {/if}
                  {:else}
                    <div class="font-semibold text-sm sm:text-base text-gray-800 italic">Patient ID: {appointment.patientId} <span class="text-xs text-gray-500">(Profile missing)</span></div>
                  {/if}
                  <div class="flex flex-wrap gap-2 items-center text-xs sm:text-sm mt-1 sm:mt-2">
                    <span class="inline-block px-2 py-1 rounded bg-gray-100 text-gray-700 font-medium">{appointment.date} at {appointment.time}</span>
                    <span class="inline-block px-2 py-1 rounded {badgeClass} font-semibold">
                      {appointment.status}
                    </span>
                  </div>
                  <div class="text-xs text-gray-600 mt-1">
                    <span class="font-medium">Service:</span> {appointment.service}
                    {#if appointment.subServices && Array.isArray(appointment.subServices) && appointment.subServices.length > 0 && appointment.subServices.join(', ').trim() !== ''}
                      <div class="mt-1"><span class="font-medium">Selected:</span> {appointment.subServices.join(', ')}</div>
                    {/if}
                  </div>
                  {#if appointment.reason}
                    <div class="text-xs text-red-600 bg-red-50 p-2 rounded mt-2">
                      <span class="font-medium">Decline Reason:</span> {appointment.reason}
                    </div>
                  {/if}
                  {#if appointment.cancellationReason}
                    <div class="text-xs text-gray-600 bg-gray-50 p-2 rounded mt-2">
                      <span class="font-medium">Cancellation Reason:</span> {appointment.cancellationReason}
                    </div>
                  {/if}
                  {#if appointment.completionTime}
                    <div class="text-xs text-green-600 bg-green-50 p-2 rounded mt-2 flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      <span class="font-medium">Completed on:</span> {new Date(appointment.completionTime).toLocaleString()}
                    </div>
                  {/if}
                  {#if appointment.completionRemarks && appointment.completionRemarks.trim()}
                    <div class="text-xs text-blue-600 bg-blue-50 p-2 rounded mt-2">
                      <span class="font-medium">Remarks:</span> {appointment.completionRemarks}
                    </div>
                  {/if}
                  <div class="flex gap-2 mt-3 justify-between">
                    {#if appointment.status === 'Accepted' && !appointment.completionTime}
                      <button class="bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 text-xs sm:text-sm rounded shadow-sm transition flex items-center gap-1" title="Mark as Completed" on:click={() => handleMarkComplete(appointment)}>
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Mark Complete
                      </button>
                    {:else}
                      <div></div>
                    {/if}
                    <button class="bg-red-500 hover:bg-red-600 text-white px-2 py-1.5 rounded shadow-sm transition" title="Delete Appointment" aria-label="Delete Appointment" on:click={() => handleDelete(appointment)}>
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                  {#if appointment.createdAt}
                    <div class="text-xs text-gray-400 mt-2 border-t pt-2">
                      Created: {(() => {
                        try {
                          // Handle Firestore Timestamp objects
                          if (appointment.createdAt?.toDate) {
                            return appointment.createdAt.toDate().toLocaleString();
                          }
                          // Handle ISO string or regular date
                          const date = new Date(appointment.createdAt);
                          return isNaN(date.getTime()) ? 'N/A' : date.toLocaleString();
                        } catch (e) {
                          return 'N/A';
                        }
                      })()}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
            {:else}
              <div class="text-gray-500 col-span-full text-center py-5">No appointment history found.</div>
            {/if}
            </div>
          </section>
        {/if}
      {/if}
  
      {#if showReasonModal}
        <div class="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50 p-4 transition-opacity duration-300 ease-out" 
             style="opacity: 1;">
          <div class="bg-white rounded-lg p-5 sm:p-6 w-full max-w-md shadow-xl transform transition-all duration-300 ease-out scale-100">
            <h2 class="text-lg font-semibold mb-4 text-gray-800">Reason for Decline</h2>
            <textarea
              class="w-full border border-gray-300 rounded p-2 mb-4 focus:ring-blue-500 focus:border-blue-500 text-sm"
              rows="4"
              bind:value={rejectionReason}
              placeholder="Enter the reason for declining this appointment..."
            ></textarea>
            <div class="flex justify-end space-x-3">
              <button type="button" class="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded text-sm font-medium transition-colors" on:click={() => (showReasonModal = false)}>Cancel</button>
              <button type="button" class="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded text-sm font-medium transition-colors" on:click={confirmRejection}>Submit</button>
            </div>
          </div>
        </div>
      {/if}
      </div>
    </div>
  </div>
  
  <style>
    :global(body), :global(html) {
      margin: 0;
      padding: 0;
      min-height: 100%;
    }
    .sticky { 
      position: -webkit-sticky; 
      position: sticky; 
      top: 0; 
    }
  </style>