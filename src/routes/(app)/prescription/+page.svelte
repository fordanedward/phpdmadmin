<script lang="ts">
	import { onMount } from 'svelte';
	import { firebaseConfig } from '$lib/firebaseConfig';
	import { initializeApp } from 'firebase/app';
	import { getFirestore, collection, updateDoc, getDocs, doc } from 'firebase/firestore';
	import Swal from 'sweetalert2';

	// --- Firebase Initialization ---
	const app = initializeApp(firebaseConfig);
	const db = getFirestore(app);

	// --- Component State ---
	let patients: any[] = [];
	let prescribedPatients: any[] = [];
	let filteredPatients: any[] = []; // This will hold the patients to be displayed

	let searchTerm = '';
	let currentCategory: 'Active' | 'Archived' = 'Active';
	let sortCriteria = 'name_asc'; // Default sort: name ascending (e.g., 'name_asc', 'name_desc', 'age_asc', 'age_desc')

	// Modals State
	let showRemarkModal = false;
	let selectedPatientForRemark: any = null;
	let remark = '';

	let showPrescriptionModal = false;
	let currentPatientForModal: any = {};

	// --- Lifecycle Hooks ---
	onMount(async () => {
		await fetchPatients();
		await fetchPrescribedPatients();
		applyFiltersAndSorting(); 
	});

	async function fetchPatients() {
		try {
			const querySnapshot = await getDocs(collection(db, 'patientProfiles'));
			patients = querySnapshot.docs.map((doc) => ({
				id: doc.id,
				name: doc.data().name || '', // Ensure default values
				lastName: doc.data().lastName || '',
				fullName: `${doc.data().name || ''} ${doc.data().lastName || ''}`.trim(), 
				address: doc.data().address || 'N/A',
				phone: doc.data().phone || 'N/A',
				age: doc.data().age || 0,
				birthday: doc.data().birthday || 'N/A',
				isArchived: doc.data().isArchived || false,
				remark: doc.data().remark || 'No remark provided'
			}));
			console.log('Fetched Patients:', patients.length);
		} catch (error) {
			console.error('Error fetching patients:', error);
			Swal.fire('Error', 'Could not fetch patient data.', 'error');
		}
	}

	async function fetchPrescribedPatients() {
		try {
			// Fetch prescriptions
			const prescriptionsSnapshot = await getDocs(collection(db, "prescriptions"));
			const prescriptionsData = prescriptionsSnapshot.docs.map(doc => {
				const data = doc.data();
				const medicines = data.medicines || [];
				return {
					id: doc.id,
					appointmentId: data.appointmentId,
					instructions: medicines.map((m: { instructions: any; }) => m.instructions || 'N/A').join(', '),
					medications: medicines.map((m: { medicine: any; }) => m.medicine || 'N/A').join(', '),
					prescriber: data.prescriber || 'N/A',
					dosage: medicines.map((m: { dosage: any; }) => m.dosage || 'N/A').join(', '), // Using dosage as requested
				};
			});

			// Fetch appointments to link prescriptions to patients and get dates
			const appointmentsSnapshot = await getDocs(collection(db, "appointments"));
			const appointmentsMap = new Map();
			appointmentsSnapshot.docs.forEach(doc => {
				const data = doc.data();
				appointmentsMap.set(doc.id, {
					patientId: data.patientId,
					date: data.date ? new Date(data.date.seconds * 1000).toLocaleDateString() : 'N/A', // Format date
				});
			});

			// Create a map of patients for quick lookup
			const patientsMap = new Map(patients.map(p => [p.id, p]));

			// Aggregate prescriptions by patient
			const patientPrescriptionsMap = new Map();

			prescriptionsData.forEach(prescription => {
				const appointment = appointmentsMap.get(prescription.appointmentId);
				if (appointment && appointment.patientId) {
					const patientId = appointment.patientId;
					if (!patientPrescriptionsMap.has(patientId)) {
						patientPrescriptionsMap.set(patientId, []);
					}
					patientPrescriptionsMap.get(patientId).push({
						...prescription,
						dateVisited: appointment.date,
					});
				}
			});

			// Populate prescribedPatients array with patient details and their prescriptions
			prescribedPatients = patients
				.filter(p => patientPrescriptionsMap.has(p.id)) // Only include patients who have prescriptions
				.map(patient => ({
					...patient,
					prescriptions: patientPrescriptionsMap.get(patient.id) || [],
				}));

			console.log("Processed Prescribed Patients:", prescribedPatients.length);

		} catch (error) {
			console.error("Error fetching prescribed patients details:", error);
			Swal.fire("Error", "Could not fetch prescription details.", "error");
		}
	}


	// --- Filtering and Sorting ---
	function applyFiltersAndSorting() {
		console.log(`Applying filters. Category: ${currentCategory}, Search: "${searchTerm}", Sort: ${sortCriteria}`);

		let baseList = [];

		// 1. Filter by Category (Active/Archived)
		if (currentCategory === 'Active') {
			// Active means NOT archived AND has prescriptions
			const prescribedPatientIds = new Set(prescribedPatients.map(p => p.id));
			baseList = patients.filter(p => !p.isArchived && prescribedPatientIds.has(p.id));
			console.log(`Active category base count: ${baseList.length}`);
		} else {
			// Archived means IS archived
			baseList = patients.filter(p => p.isArchived);
			console.log(`Archived category base count: ${baseList.length}`);
		}

		// 2. Filter by Search Term
		let searchedList = baseList;
		if (searchTerm.trim() !== '') {
			const lowerSearchTerm = searchTerm.toLowerCase();
			searchedList = baseList.filter(patient =>
				Object.values(patient).some(value => {
					if (typeof value === 'string') {
						return value.toLowerCase().includes(lowerSearchTerm);
					}
					if (typeof value === 'number') {
						return value.toString().includes(lowerSearchTerm); // Allow searching numbers as strings
					}
					return false;
				})
			);
			console.log(`After search term filter count: ${searchedList.length}`);
		} else {
			console.log(`No search term applied.`);
		}


		// 3. Sort
		const [column, direction] = sortCriteria.split('_'); // e.g., 'name_asc' -> ['name', 'asc']

		searchedList.sort((a, b) => {
			let valA = a[column];
			let valB = b[column];

			// Handle case-insensitive string sorting for name/lastName/fullName
			if (column === 'name' || column === 'lastName' || column === 'fullName') {
				valA = String(valA).toLowerCase();
				valB = String(valB).toLowerCase();
			}

            // Handle numeric sorting for age
			if (column === 'age') {
				valA = Number(valA);
				valB = Number(valB);
				return direction === 'asc' ? valA - valB : valB - valA;
			}

            // Default string comparison
			if (valA < valB) return direction === 'asc' ? -1 : 1;
			if (valA > valB) return direction === 'asc' ? 1 : -1;
			return 0;
		});

		console.log(`Sorting applied: ${column} ${direction}. Final count: ${searchedList.length}`);
		filteredPatients = searchedList; // Update the reactive variable
	}

	// --- Event Handlers ---
	function handleSearchInput() {
		applyFiltersAndSorting();
	}

	function handleSortChange(event: Event) {
        const selectElement = event.target as HTMLSelectElement;
		sortCriteria = selectElement.value;
		applyFiltersAndSorting();
	}

	function switchCategory(category: 'Active' | 'Archived') {
		currentCategory = category;
		searchTerm = ''; // Reset search on category switch
		// sortCriteria = 'name_asc'; // Optionally reset sort on category switch
		applyFiltersAndSorting();
	}

	function openRemarkModal(patient: any) {
		selectedPatientForRemark = patient;
		remark = ''; // Reset remark input
		showRemarkModal = true;
	}

	function closeRemarkModal() {
		showRemarkModal = false;
		selectedPatientForRemark = null;
	}

	async function archivePatient() {
		if (!selectedPatientForRemark) return;

		const patientId = selectedPatientForRemark.id;

		try {
			const patientRef = doc(db, 'patientProfiles', patientId);
			await updateDoc(patientRef, {
				isArchived: true,
				remark: remark || 'Archived without specific remark' // Provide a default if empty
			});

			// Update local state immediately for UI responsiveness
			const patientIndex = patients.findIndex((p) => p.id === patientId);
			if (patientIndex !== -1) {
				patients[patientIndex].isArchived = true;
				patients[patientIndex].remark = remark || 'Archived without specific remark';
			}

			closeRemarkModal();
			applyFiltersAndSorting(); // Re-filter the list

			Swal.fire('Archived!', 'The patient has been archived.', 'success');
		} catch (error) {
			console.error('Error archiving patient:', error);
			Swal.fire('Error', 'Could not archive patient. Please try again.', 'error');
		}
	}

	async function unarchivePatient(patientId: string) {
		const result = await Swal.fire({
			title: 'Unarchive Patient?',
			text: 'Do you want to move this patient back to the active list?',
			icon: 'question',
			showCancelButton: true,
			confirmButtonColor: '#3085d6',
			cancelButtonColor: '#d33',
			confirmButtonText: 'Yes, Unarchive'
		});

		if (result.isConfirmed) {
			try {
				const patientRef = doc(db, 'patientProfiles', patientId);
				// Reset remark when unarchiving, or keep it based on requirements
				await updateDoc(patientRef, { isArchived: false, remark: '' }); // Reset remark

				// Update local state
				const patientIndex = patients.findIndex((p) => p.id === patientId);
				if (patientIndex !== -1) {
					patients[patientIndex].isArchived = false;
					patients[patientIndex].remark = ''; // Reset remark locally too
				}

				applyFiltersAndSorting(); // Re-filter the list

				Swal.fire('Unarchived!', 'The patient has been moved to active.', 'success');
			} catch (error) {
				console.error('Error unarchiving patient:', error);
				Swal.fire('Error', 'Could not unarchive patient. Please try again.', 'error');
			}
		}
	}

	function openPrescriptionModal(patient: any) {
		// Find the full patient detail including prescriptions
		currentPatientForModal = prescribedPatients.find(p => p.id === patient.id) || patient; // Fallback to basic patient info if not found in prescribed list
		if (!currentPatientForModal.prescriptions) {
			// If the fallback was used or prescriptions weren't loaded correctly for this patient
			const fullData = prescribedPatients.find(p => p.id === patient.id);
			currentPatientForModal = { ...patient, prescriptions: fullData ? fullData.prescriptions : [] };
		}
		showPrescriptionModal = true;
	}

	function closePrescriptionModal() {
		showPrescriptionModal = false;
		currentPatientForModal = {};
	}

</script>

<!-- Main Container -->
<div class="p-4 md:p-6 lg:p-8 bg-gray-100 min-h-screen font-sans">
	<!-- Header/Controls Area -->
	<div class="mb-6 bg-white p-4 rounded-lg shadow">
		<h1 class="text-2xl font-semibold text-gray-700 mb-4">Patient Records</h1>

		<!-- Search and Sort -->
		<div class="flex flex-col md:flex-row md:items-center gap-4 mb-4">
			<!-- Search Input -->
			<div class="relative flex-grow">
				<span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-gray-400">
						<path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clip-rule="evenodd" />
					</svg>
				</span>
				<input
					type="text"
					placeholder="Search patients by name, phone, address..."
					bind:value={searchTerm}
					on:input={handleSearchInput}
					class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-150 ease-in-out"
				/>
			</div>

			<!-- Sort Dropdown -->
			<div class="flex-shrink-0">
				<label for="sort-select" class="sr-only">Sort Patients</label>
				<select
					id="sort-select"
					bind:value={sortCriteria}
					on:change={handleSortChange}
					class="w-full md:w-auto px-4 py-2 border border-gray-300 rounded-full bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-150 ease-in-out appearance-none"
					style="padding-right: 2.5rem; background-image: url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22currentColor%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.22%208.22a.75.75%200%200%201%201.06%200L10%2011.94l3.72-3.72a.75.75%200%201%201%201.06%201.06l-4.25%204.25a.75.75%200%200%201-1.06%200L5.22%209.28a.75.75%200%200%201%200-1.06Z%22%20clip-rule%3D%22evenodd%22%20%2F%3E%3C%2Fsvg%3E'); background-repeat: no-repeat; background-position: right 0.7rem center; background-size: 1.2em 1.2em;"
					aria-label="Sort patients by name or age"
				>
					<option value="fullName_asc">Sort by Name: A–Z</option>
					<option value="fullName_desc">Sort by Name: Z–A</option>
					<option value="age_asc">Sort by Age: Low to High</option>
					<option value="age_desc">Sort by Age: High to Low</option>
				</select>
			</div>
		</div>

		<!-- Category Tabs -->
		<div class="border-b border-gray-200">
			<nav class="-mb-px flex space-x-6" aria-label="Tabs">
				<button
					on:click={() => switchCategory('Active')}
					class="whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition duration-150 ease-in-out {currentCategory === 'Active'
						? 'border-blue-500 text-blue-600'
						: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
				>
					Active Patients ({currentCategory === 'Active' ? filteredPatients.length : patients.filter(p => !p.isArchived && prescribedPatients.some(pp => pp.id === p.id)).length})
				</button>
				<button
					on:click={() => switchCategory('Archived')}
					class="whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition duration-150 ease-in-out {currentCategory === 'Archived'
						? 'border-blue-500 text-blue-600'
						: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
				>
					Archived Patients ({currentCategory === 'Archived' ? filteredPatients.length : patients.filter(p => p.isArchived).length})
				</button>
			</nav>
		</div>
	</div>

	<!-- Patient Cards Grid -->
	{#if filteredPatients.length > 0}
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
			{#each filteredPatients as patient (patient.id)}
				<div class="bg-white rounded-lg shadow border border-gray-200 p-4 flex flex-col justify-between transition-shadow duration-200 hover:shadow-md">
					<!-- Card Content -->
					<div>
						<h3 class="text-lg font-semibold text-gray-800 mb-2">{patient.fullName}</h3>
						<p class="text-sm text-gray-600 mb-1"><span class="font-medium text-gray-500 w-16 inline-block">Address:</span> {patient.address}</p>
						<p class="text-sm text-gray-600 mb-1"><span class="font-medium text-gray-500 w-16 inline-block">Phone:</span> {patient.phone}</p>
						<p class="text-sm text-gray-600 mb-1"><span class="font-medium text-gray-500 w-16 inline-block">Birth Date:</span> {patient.birthday}</p>
						<p class="text-sm text-gray-600 mb-1"><span class="font-medium text-gray-500 w-16 inline-block">Age:</span> {patient.age}</p>

						{#if currentCategory === 'Archived'}
							<div class="mt-2 pt-2 border-t border-gray-100">
								<p class="text-sm text-gray-600">
									<span class="font-medium text-gray-500">Remark:</span>
									<span class="italic ml-1">{patient.remark || 'No remark provided'}</span>
								</p>
							</div>
						{/if}
					</div>

					<!-- Card Actions -->
					<div class="mt-4 pt-3 border-t border-gray-200 flex justify-end space-x-2">
						{#if currentCategory === 'Active'}
							<!-- Archive Button -->
							<button
								on:click={() => openRemarkModal(patient)}
								title="Archive Patient"
								aria-label="Archive Patient"
								class="p-1.5 text-yellow-600 hover:text-yellow-800 hover:bg-yellow-100 rounded-full transition duration-150 ease-in-out"
							>
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path fill-rule="evenodd" d="M3 3.75A.75.75 0 0 1 3.75 3h12.5a.75.75 0 0 1 .75.75v3.19l-1.72-.573a4.5 4.5 0 0 0-5.06 0l-1.72.573V3.75ZM4.75 7.24l.875-.29a3 3 0 0 1 3.375 0l3.75 1.25a3 3 0 0 1 3.375 0l.875.29V16.5a.75.75 0 0 1-.75.75h-12.5a.75.75 0 0 1-.75-.75V7.24Z" clip-rule="evenodd" /></svg>
							</button>
						{/if}

						{#if currentCategory === 'Archived'}
							<!-- Unarchive Button -->
							<button
								on:click={() => unarchivePatient(patient.id)}
								title="Unarchive Patient"
								aria-label="Unarchive Patient"
								class="p-1.5 text-green-600 hover:text-green-800 hover:bg-green-100 rounded-full transition duration-150 ease-in-out"
							>
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path d="M5.5 1.75A.75.75 0 0 1 6.25 1h7.5a.75.75 0 0 1 .75.75v2.5h-9v-2.5Zm-2 3.5A.75.75 0 0 1 4.25 5h11.5a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75.75H4.25a.75.75 0 0 1-.75-.75V5.25ZM8 12a.75.75 0 0 0 0 1.5h4a.75.75 0 0 0 0-1.5H8Z" /></svg>
							</button>
						{/if}

						<!-- View Prescriptions Button -->
						{#if currentCategory === 'Active'}
						<button
							on:click={() => openPrescriptionModal(patient)}
							title="View Prescriptions"
							aria-label="View prescriptions for {patient.fullName}"
							class="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded-full transition duration-150 ease-in-out"
						>
							<span class="sr-only">View prescriptions for {patient.fullName}</span>
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path d="M3.5 2.75a.75.75 0 0 0-1.5 0v14.5a.75.75 0 0 0 1.5 0v-4.392l1.657-.828a.75.75 0 0 0 0-1.344L3.5 9.858v-4.392Zm13.96 4.418-1.656.828a.75.75 0 0 0 0 1.344l1.656.828v4.392a.75.75 0 0 0 1.5 0V7.168a.75.75 0 0 0-.62-1.46l-1.657-.828a.75.75 0 0 0-.88 0l-1.656.828a.75.75 0 0 0 0 1.344l1.656.828ZM12 7.5a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5A.75.75 0 0 1 12 7.5Zm.75 4.75a.75.75 0 0 0 0 1.5h1.5a.75.75 0 0 0 0-1.5h-1.5Z" /><path fill-rule="evenodd" d="M8.5 2a.5.5 0 0 0-.5.5v15a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-15a.5.5 0 0 0-.5-.5h-3Zm-1.5 3A.5.5 0 0 1 7.5 4.5h5a.5.5 0 0 1 0 1h-5A.5.5 0 0 1 7 5Zm0 3A.5.5 0 0 1 7.5 7.5h5a.5.5 0 0 1 0 1h-5A.5.5 0 0 1 7 8Zm0 3a.5.5 0 0 1 7.5 10.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5Z" clip-rule="evenodd" /></svg>
						</button>
                        {/if}
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<div class="text-center py-10 px-6 bg-white rounded-lg shadow">
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-12 h-12 mx-auto text-gray-400 mb-4">
				<path stroke-linecap="round" stroke-linejoin="round" d="M15.182 16.318A4.486 4.486 0 0 0 12.016 15a4.486 4.486 0 0 0-3.198 1.318M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75s.168-.75.375-.75.375.336.375.75Zm-.75 0h.008v.015h-.008V9.75Zm4.5 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.75 0h.008v.015h-.008V9.75Z" />
			</svg>
			<p class="text-gray-500 text-lg">
				{#if searchTerm}
					No patients found matching "{searchTerm}" in the {currentCategory} category.
				{:else}
					No patients found in the {currentCategory} category.
				{/if}
			</p>
		</div>
	{/if}

</div> <!-- End Main Container -->


<!-- Remark Modal -->
{#if showRemarkModal}
<div class="fixed inset-0 bg-gray-900 bg-opacity-60 flex justify-center items-center z-[100] transition-opacity duration-300 ease-in-out">
	<div class="bg-white p-6 rounded-lg shadow-xl w-full max-w-md mx-4 transform transition-all duration-300 ease-in-out scale-95 opacity-0 animate-modal-appear">
		<h3 class="text-xl font-semibold mb-4 text-gray-800">Archive Patient</h3>
		<p class="mb-4 text-gray-600">Please provide a reason or remark for archiving <span class="font-medium">{selectedPatientForRemark?.fullName}</span>.</p>

		<form on:submit|preventDefault={archivePatient}>
			<label for="remark" class="block text-sm font-medium text-gray-700 mb-1">
				Remark (Optional):
			</label>
			<textarea
				id="remark"
				bind:value={remark}
				rows="4"
				class="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
				placeholder="e.g., Moved away, Deceased, No longer a patient"
			></textarea>

			<div class="flex justify-end mt-6 space-x-3">
				<button
					type="button"
					on:click={closeRemarkModal}
					class="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition duration-150 ease-in-out text-sm font-medium"
				>
					Cancel
				</button>
				<button
					type="submit"
					class="px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 transition duration-150 ease-in-out text-sm font-medium"
				>
					Confirm Archive
				</button>
			</div>
		</form>
	</div>
</div>
{/if}

<!-- Prescription Details Modal -->
{#if showPrescriptionModal}
<div class="fixed inset-0 bg-gray-900 bg-opacity-60 flex justify-center items-center z-[100] transition-opacity duration-300 ease-in-out"> 
	<div class="bg-white p-6 rounded-lg shadow-xl w-full max-w-3xl mx-4 transform transition-all duration-300 ease-in-out scale-95 opacity-0 animate-modal-appear max-h-[85vh] flex flex-col">
		<div class="flex justify-between items-center mb-4 border-b pb-3">
            <h3 class="text-xl font-semibold text-gray-800">Prescription Details</h3>
            <button on:click={closePrescriptionModal} class="text-gray-400 hover:text-gray-600">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
            </button>
        </div>

		<!-- Patient Info -->
		<div class="mb-4 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-sm">
			<p><strong class="text-gray-600">Patient:</strong> {currentPatientForModal.fullName}</p>
			<p><strong class="text-gray-600">Age:</strong> {currentPatientForModal.age}</p>
			<p><strong class="text-gray-600">Address:</strong> {currentPatientForModal.address}</p>
			<p><strong class="text-gray-600">Phone:</strong> {currentPatientForModal.phone}</p>
			<p><strong class="text-gray-600">Birthday:</strong> {currentPatientForModal.birthday}</p>
		</div>

		<!-- Prescriptions Table -->
		<div class="flex-grow overflow-y-auto border rounded-md">
			{#if currentPatientForModal.prescriptions && currentPatientForModal.prescriptions.length > 0}
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-gray-50 sticky top-0">
						<tr>
							<th scope="col" class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date Visited</th>
							<th scope="col" class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Medications</th>
							<th scope="col" class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dosage</th>
							<th scope="col" class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Instructions</th>
							<th scope="col" class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prescriber</th>
						</tr>
					</thead>
					<tbody class="bg-white divide-y divide-gray-200">
						{#each currentPatientForModal.prescriptions as prescription (prescription.id)}
							<tr class="hover:bg-gray-50">
								<td class="px-4 py-2 whitespace-nowrap text-sm text-gray-600">{prescription.dateVisited || 'N/A'}</td>
								<td class="px-4 py-2 text-sm text-gray-600">{prescription.medications || 'N/A'}</td>
								<td class="px-4 py-2 text-sm text-gray-600">{prescription.dosage || 'N/A'}</td>
								<td class="px-4 py-2 text-sm text-gray-600">{prescription.instructions || 'N/A'}</td>
								<td class="px-4 py-2 whitespace-nowrap text-sm text-gray-600">{prescription.prescriber || 'N/A'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{:else}
				<p class="text-center text-gray-500 py-8">No prescription records found for this patient.</p>
			{/if}
		</div>

		<!-- Close Button Footer -->
		<div class="mt-5 pt-4 border-t flex justify-end">
			<button
				on:click={closePrescriptionModal}
				class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition duration-150 ease-in-out text-sm font-medium"
			>
				Close
			</button>
		</div>
	</div>
</div>
{/if}
		
<style>
    @keyframes modal-appear {
        from {
            opacity: 0;
            transform: scale(0.95);
        }
        to {
            opacity: 1;
            transform: scale(1);
        }
    }
    .animate-modal-appear {
        animation: modal-appear 0.3s ease-out forwards;
    }
    .overflow-y-auto::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    .overflow-y-auto::-webkit-scrollbar-track {
      background: #f1f1f1;
      border-radius: 10px;
    }
    .overflow-y-auto::-webkit-scrollbar-thumb {
      background: #c5c5c5;
      border-radius: 10px;
    }
    .overflow-y-auto::-webkit-scrollbar-thumb:hover {
      background: #a8a8a8;
    }
</style>