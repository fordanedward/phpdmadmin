<script lang="ts">
	import { onMount } from 'svelte';
	import { firebaseConfig } from '$lib/firebaseConfig';
	import { initializeApp } from 'firebase/app';
	import { getFirestore, collection, updateDoc, getDocs, deleteDoc, doc, Timestamp, deleteField } from 'firebase/firestore';
	import Swal from 'sweetalert2';
	import { EyeOutline } from 'flowbite-svelte-icons';
	// --- Firebase Initialization ---
	const app = initializeApp(firebaseConfig);
	const db = getFirestore(app);

	// --- Component State ---
	interface Patient {
		id: string;
		name: string;
		lastName: string;
		fullName: string;
		address: string;
		phone: string;
		age: number;
		birthday: string;
		isArchived: boolean;
		remark: string;
		dateArchived?: string | null;
		prescriptions?: PrescriptionDetail[]; // Defined PrescriptionDetail below
	}

    interface PrescriptionDetail {
        id: string;
        appointmentId?: string;
        instructions: string;
        medications: string;
        prescriber: string;
        dosage: string;
        dateVisited?: string;
    }

	let patients: Patient[] = [];
	let prescribedPatients: Patient[] = [];
	let filteredPatients: Patient[] = [];

	let searchTerm = '';
	let currentCategory: 'Active' | 'Archived' = 'Active';
	let sortCriteria = 'fullName_asc'; // Default sort: name ascending

	// Modals State
	let showRemarkModal = false;
	let selectedPatientForRemark: Patient | null = null;
	let remark = '';

	let showPrescriptionModal = false;
	let currentPatientForModal: Patient | null = null; // Changed from Patient | {} = {}

	// --- Lifecycle Hooks ---
	onMount(async () => {
		await fetchPatients();
		await fetchPrescribedPatients();
		applyFiltersAndSorting();
	});

	async function fetchPatients() {
		try {
			const querySnapshot = await getDocs(collection(db, 'patientProfiles'));
			patients = querySnapshot.docs.map((docSnap) => {
				const data = docSnap.data();
				let dateArchivedString: string | null = null;
				if (data.dateArchived && data.dateArchived.seconds) {
					dateArchivedString = new Date(data.dateArchived.seconds * 1000).toLocaleDateString();
				}

				return {
					id: docSnap.id,
					name: data.name || '',
					lastName: data.lastName || '',
					fullName: `${data.name || ''} ${data.lastName || ''}`.trim(),
					address: data.address || 'N/A',
					phone: data.phone || 'N/A',
					age: data.age || 0,
					birthday: data.birthday || 'N/A',
					isArchived: data.isArchived || false,
					remark: data.remark || 'No remark provided',
					dateArchived: dateArchivedString,
				};
			});
			console.log('Fetched Patients:', patients.length);
		} catch (error) {
			console.error('Error fetching patients:', error);
			Swal.fire('Error', 'Could not fetch patient data.', 'error');
		}
	}

	async function fetchPrescribedPatients() {
		try {
			const prescriptionsSnapshot = await getDocs(collection(db, "prescriptions"));
			const prescriptionsData: PrescriptionDetail[] = prescriptionsSnapshot.docs.map(docSnap => {
				const data = docSnap.data();
				const medicines = data.medicines || [];
				// Do not format dateVisited here, handle it after merging with appointment
				return {
					id: docSnap.id,
					appointmentId: data.appointmentId,
					instructions: medicines.map((m: { instructions: any; }) => m.instructions || 'N/A').join(', '),
					medications: medicines.map((m: { medicine: any; }) => m.medicine || 'N/A').join(', '),
					prescriber: data.prescriber || 'N/A',
					dosage: medicines.map((m: { dosage: any; }) => m.dosage || 'N/A').join(', '),
					dateVisited: data.dateVisited // keep as raw value for now
				};
			});

			const appointmentsSnapshot = await getDocs(collection(db, "appointments"));
			const appointmentsMap = new Map();
			appointmentsSnapshot.docs.forEach(docSnap => {
				const data = docSnap.data();
				appointmentsMap.set(docSnap.id, {
					patientId: data.patientId,
					date: data.date // keep as raw value for now
				});
			});

			const patientPrescriptionsMap = new Map<string, PrescriptionDetail[]>();
			prescriptionsData.forEach(prescription => {
				const appointment = appointmentsMap.get(prescription.appointmentId);
				if (appointment && appointment.patientId) {
					const patientId = appointment.patientId;
					if (!patientPrescriptionsMap.has(patientId)) {
						patientPrescriptionsMap.set(patientId, []);
					}
					const currentPrescriptions = patientPrescriptionsMap.get(patientId);
					if (currentPrescriptions) {
						// Format the dateVisited for display
						let displayDate = 'N/A';
						if (prescription.dateVisited) {
							// Try to parse and format
							const d = new Date(prescription.dateVisited);
							displayDate = isNaN(d.getTime()) ? prescription.dateVisited : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
						} else if (appointment.date) {
							const d = new Date(appointment.date);
							displayDate = isNaN(d.getTime()) ? appointment.date : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
						}
						currentPrescriptions.push({
							...prescription,
							dateVisited: displayDate
						});
					}
				}
			});

			prescribedPatients = patients
				.filter(p => patientPrescriptionsMap.has(p.id))
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
		let baseList: Patient[] = [];

		if (currentCategory === 'Active') {
			const prescribedPatientIds = new Set(prescribedPatients.map(p => p.id));
			baseList = patients.filter(p => !p.isArchived && prescribedPatientIds.has(p.id));
		} else {
			baseList = patients.filter(p => p.isArchived);
		}

		let searchedList = baseList;
		if (searchTerm.trim() !== '') {
			const lowerSearchTerm = searchTerm.toLowerCase();
			searchedList = baseList.filter(patient =>
				Object.values(patient).some(value => {
					if (typeof value === 'string') return value.toLowerCase().includes(lowerSearchTerm);
					if (typeof value === 'number') return value.toString().includes(lowerSearchTerm);
					return false;
				})
			);
		}

		const [column, direction] = sortCriteria.split('_') as [keyof Patient, 'asc' | 'desc'];

		searchedList.sort((a, b) => {
			const valA_raw = a[column];
			const valB_raw = b[column];

			if (column === 'fullName') {
				const strA = String(valA_raw ?? '').toLowerCase();
				const strB = String(valB_raw ?? '').toLowerCase();
				if (strA < strB) return direction === 'asc' ? -1 : 1;
				if (strA > strB) return direction === 'asc' ? 1 : -1;
				return 0;
			} else if (column === 'age') {
				const numA = Number(valA_raw ?? 0); // Fallback to 0 if age is somehow null/undefined
				const numB = Number(valB_raw ?? 0);
				return direction === 'asc' ? numA - numB : numB - numA;
			}
			// Add other specific sort criteria here if needed
			return 0; // Default: no change in order for unhandled columns or equality
		});
		filteredPatients = searchedList;
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
		searchTerm = '';
		applyFiltersAndSorting();
	}

	function openRemarkModal(patient: Patient) {
		selectedPatientForRemark = patient;
		remark = (patient.remark === 'No remark provided' || patient.remark === 'Archived without specific remark' || patient.remark === 'Unarchived') 
                 ? '' 
                 : patient.remark;
		showRemarkModal = true;
	}

	function closeRemarkModal() {
		showRemarkModal = false;
		selectedPatientForRemark = null;
		remark = '';
	}

	async function archivePatient() {
		if (!selectedPatientForRemark) return;

		const patientId = selectedPatientForRemark.id;
		const archiveDate = new Date();

		try {
			// Archive the patient profile
			const patientRef = doc(db, 'patientProfiles', patientId);
			await updateDoc(patientRef, {
				isArchived: true,
				remark: remark.trim() || 'Archived without specific remark',
				dateArchived: Timestamp.fromDate(archiveDate)
			});

			// Also archive the user account to prevent login
			const userRef = doc(db, 'users', patientId);
			await updateDoc(userRef, {
				isArchived: true,
				dateArchived: Timestamp.fromDate(archiveDate)
			});

			const patientIndex = patients.findIndex((p) => p.id === patientId);
			if (patientIndex !== -1) {
				patients[patientIndex].isArchived = true;
				patients[patientIndex].remark = remark.trim() || 'Archived without specific remark';
				patients[patientIndex].dateArchived = archiveDate.toLocaleDateString();
				patients = [...patients]; // Trigger reactivity
			}

			closeRemarkModal();
			applyFiltersAndSorting();
			Swal.fire('Archived!', 'The patient has been archived and their account access has been revoked.', 'success');
		} catch (error) {
			console.error('Error archiving patient:', error);
			Swal.fire('Error', 'Could not archive patient. Please try again.', 'error');
		}
	}

	async function unarchivePatient(patientId: string) {
		const result = await Swal.fire({
			title: 'Unarchive Patient?',
			text: 'Do you want to move this patient back to the active list and restore their account access?',
			icon: 'question',
			showCancelButton: true,
			confirmButtonColor: '#3085d6',
			cancelButtonColor: '#d33',
			confirmButtonText: 'Yes, Unarchive'
		});

		if (result.isConfirmed) {
			try {
				// Unarchive the patient profile
				const patientRef = doc(db, 'patientProfiles', patientId);
				await updateDoc(patientRef, {
					isArchived: false,
					remark: 'Unarchived',
					dateArchived: deleteField()
				});

				// Also restore the user account access
				const userRef = doc(db, 'users', patientId);
				await updateDoc(userRef, {
					isArchived: false,
					dateArchived: deleteField()
				});

				const patientIndex = patients.findIndex((p) => p.id === patientId);
				if (patientIndex !== -1) {
					patients[patientIndex].isArchived = false;
					patients[patientIndex].remark = 'Unarchived';
					patients[patientIndex].dateArchived = null;
					patients = [...patients]; // Trigger reactivity
				}

				applyFiltersAndSorting();
				Swal.fire('Unarchived!', 'The patient has been moved to active and their account access has been restored.', 'success');
			} catch (error) {
				console.error('Error unarchiving patient:', error);
				Swal.fire('Error', 'Could not unarchive patient. Please try again.', 'error');
			}
		}
	}
	async function deletePatient(patientId: string) {
  const result = await Swal.fire({
    title: 'Delete Patient?',
    text: 'This action is permanent and cannot be undone. Are you sure you want to delete this patient?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: 'Yes, Delete',
  });

  if (result.isConfirmed) {
    try {
      // Delete the patient from the database
      const patientRef = doc(db, 'patientProfiles', patientId);
      await updateDoc(patientRef, {
        isArchived: deleteField(),
        remark: deleteField(),
        dateArchived: deleteField(),
      });
      await deleteDoc(patientRef);

      // Also delete the user account
      const userRef = doc(db, 'users', patientId);
      await deleteDoc(userRef);

      // Remove the patient from the local list
      patients = patients.filter((p) => p.id !== patientId);
      prescribedPatients = prescribedPatients.filter((p) => p.id !== patientId);
      filteredPatients = filteredPatients.filter((p) => p.id !== patientId);

      Swal.fire('Deleted!', 'The patient has been permanently deleted.', 'success');
    } catch (error) {
      console.error('Error deleting patient:', error);
      Swal.fire('Error', 'Could not delete the patient. Please try again.', 'error');
    }
  }
}

	function openPrescriptionModal(patient: Patient) {
		const detailedPatient = prescribedPatients.find(p => p.id === patient.id);

		if (detailedPatient) {
			currentPatientForModal = detailedPatient; // This patient has .prescriptions array from fetchPrescribedPatients
		} else {
			// This case should ideally not occur for 'Active' patients due to current filtering logic.
			// If it does, or if the function is called for a patient not in prescribedPatients,
			// use the basic patient info and ensure an empty prescriptions array.
			console.warn(`Patient ${patient.fullName} (ID: ${patient.id}) not found in prescribedPatients list during modal open. Displaying basic info with no prescriptions.`);
			currentPatientForModal = { ...patient, prescriptions: [] }; // Ensure prescriptions property exists
		}
		showPrescriptionModal = true;
	}

	function closePrescriptionModal() {
		showPrescriptionModal = false;
		currentPatientForModal = null; // Reset to null
	}

</script>

<!-- Main Container -->
<div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 font-poppins">
	<div class="container mx-auto px-4 py-6 md:px-6 lg:px-8">
		<!-- Header/Controls Area -->
		<div class="mb-8 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
			<div class="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4">
				<h1 class="text-3xl font-bold text-white mb-2">Patient Records & Prescriptions</h1>
				<p class="text-blue-100 text-lg">Manage patient data and prescription history</p>
			</div>
			<div class="p-6">

				<div class="flex flex-col md:flex-row md:items-center gap-6 mb-6">
					<div class="relative flex-grow">
						<span class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-gray-400">
								<path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clip-rule="evenodd" />
							</svg>
						</span>
						<input
							type="text"
							placeholder="Search patients by name, phone, address..."
							bind:value={searchTerm}
							on:input={handleSearchInput}
							class="w-full pl-12 pr-4 py-3 bg-gray-50 border-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all duration-200 text-gray-700 placeholder-gray-400"
						/>
					</div>

					<div class="flex-shrink-0">
						<label for="sort-select" class="sr-only">Sort Patients</label>
						<div class="relative">
							<select
								id="sort-select"
								bind:value={sortCriteria}
								on:change={handleSortChange}
								class="px-6 py-3 pr-10 bg-gray-50 border-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all duration-200 appearance-none text-gray-700 font-medium"
							>
								<option value="fullName_asc">Sort by Name: A–Z</option>
								<option value="fullName_desc">Sort by Name: Z–A</option>
								<option value="age_asc">Sort by Age: Low to High</option>
								<option value="age_desc">Sort by Age: High to Low</option>
							</select>
							<div class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-gray-400">
									<path fill-rule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" />
								</svg>
							</div>
						</div>
					</div>
				</div>

				<div class="bg-gray-50 rounded-xl p-1">
					<nav class="flex space-x-1" aria-label="Tabs">
						<button
							on:click={() => switchCategory('Active')}
							class="flex-1 whitespace-nowrap py-3 px-4 rounded-lg font-semibold text-sm transition-all duration-200 ease-in-out {currentCategory === 'Active'
								? 'bg-white text-blue-600 shadow-sm border border-blue-200'
								: 'text-gray-600 hover:text-gray-800 hover:bg-white/50'}"
						>
							<span class="flex items-center justify-center gap-2">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
									<path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
								</svg>
								Active Patients
								<span class="bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full text-xs font-medium">
									{currentCategory === 'Active' ? filteredPatients.length : patients.filter(p => !p.isArchived && prescribedPatients.some(pp => pp.id === p.id)).length}
								</span>
							</span>
						</button>
						<button
							on:click={() => switchCategory('Archived')}
							class="flex-1 whitespace-nowrap py-3 px-4 rounded-lg font-semibold text-sm transition-all duration-200 ease-in-out {currentCategory === 'Archived'
								? 'bg-white text-blue-600 shadow-sm border border-blue-200'
								: 'text-gray-600 hover:text-gray-800 hover:bg-white/50'}"
						>
							<span class="flex items-center justify-center gap-2">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
									<path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
								</svg>
								Archived Patients
								<span class="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs font-medium">
									{currentCategory === 'Archived' ? filteredPatients.length : patients.filter(p => p.isArchived).length}
								</span>
							</span>
						</button>
					</nav>
				</div>
			</div>
		</div>
		{#if filteredPatients.length > 0}
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
			{#each filteredPatients as patient (patient.id)}
				<div class="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 flex flex-col justify-between transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group">
					<div>
						<div class="flex items-center gap-3 mb-4">
							<div class="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
								{patient.fullName.split(' ').map(n => n[0]).join('').substring(0, 2)}
							</div>
							<div>
								<h3 class="text-lg font-bold text-gray-800">{patient.fullName}</h3>
								<p class="text-sm text-gray-500">Age: {patient.age} years</p>
							</div>
						</div>

						<div class="space-y-3">
							<div class="flex items-start gap-3">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0">
									<path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
									<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
								</svg>
								<p class="text-sm text-gray-600 flex-1">{patient.address}</p>
							</div>
							
							<div class="flex items-center gap-3">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-gray-400 flex-shrink-0">
									<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6.75c0 6.8 2.07 10.5 9.75 10.5 7.68 0 9.75-3.7 9.75-10.5 0-2.45-1.08-4.95-3.25-6.75-.36-.31-.74-.6-1.12-.83H5.62c-.38.23-.76.52-1.12.83M2.25 6.75c0 6.8 2.07 10.5 9.75 10.5s9.75-3.7 9.75-10.5" />
								</svg>
								<p class="text-sm text-gray-600">{patient.phone}</p>
							</div>
							
							<div class="flex items-center gap-3">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-gray-400 flex-shrink-0">
									<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5a2.25 2.25 0 002.25-2.25m-18 0v-18a.75.75 0 00-1.5 0v18a.75.75 0 001.5 0zm18 0v-18a.75.75 0 011.5 0v18a.75.75 0 01-1.5 0z" />
								</svg>
								<p class="text-sm text-gray-600">{patient.birthday}</p>
							</div>
						</div>

						{#if currentCategory === 'Archived'}
							<div class="mt-4 pt-4 border-t border-gray-200">
								<div class="bg-yellow-50 rounded-lg p-3">
									<p class="text-sm text-gray-700 mb-2">
										<span class="font-semibold text-gray-600">Remark:</span>
										<span class="italic ml-1">{patient.remark || 'No remark provided'}</span>
									</p>
									{#if patient.dateArchived}
									<p class="text-sm text-gray-500">
										<span class="font-medium">Archived:</span> {patient.dateArchived}
									</p>
									{/if}
								</div>
							</div>
						{/if}
					</div>

					<div class="mt-6 pt-4 border-t border-gray-200 flex justify-end gap-2">
						{#if currentCategory === 'Active'}
							<button
								on:click={() => openRemarkModal(patient)}
								title="Archive Patient"
								aria-label="Archive Patient"
								class="px-3 py-2 bg-yellow-50 text-yellow-600 hover:bg-yellow-100 rounded-lg transition-all duration-200 ease-in-out hover:scale-105 flex items-center gap-2 text-sm font-medium"
							>
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
									<path fill-rule="evenodd" d="M3 3.75A.75.75 0 0 1 3.75 3h12.5a.75.75 0 0 1 .75.75v3.19l-1.72-.573a4.5 4.5 0 0 0-5.06 0l-1.72.573V3.75ZM4.75 7.24l.875-.29a3 3 0 0 1 3.375 0l3.75 1.25a3 3 0 0 1 3.375 0l.875.29V16.5a.75.75 0 0 1-.75.75h-12.5a.75.75 0 0 1-.75-.75V7.24Z" clip-rule="evenodd" />
								</svg>
								Archive
							</button>
						{/if}

						{#if currentCategory === 'Archived'}
							<button
								on:click={() => unarchivePatient(patient.id)}
								title="Unarchive Patient"
								aria-label="Unarchive Patient"
								class="px-3 py-2 bg-green-50 text-green-600 hover:bg-green-100 rounded-lg transition-all duration-200 ease-in-out hover:scale-105 flex items-center gap-2 text-sm font-medium"
							>
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
									<path d="M5.5 1.75A.75.75 0 0 1 6.25 1h7.5a.75.75 0 0 1 .75.75v2.5h-9v-2.5Zm-2 3.5A.75.75 0 0 1 4.25 5h11.5a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75.75H4.25a.75.75 0 0 1-.75-.75V5.25ZM8 12a.75.75 0 0 0 0 1.5h4a.75.75 0 0 0 0-1.5H8Z" />
								</svg>
								Restore
							</button>
						{/if}

						{#if currentCategory === 'Archived'}
							<button
								on:click={() => deletePatient(patient.id)}
								title="Delete Patient"
								aria-label="Delete Patient"
								class="px-3 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-all duration-200 ease-in-out hover:scale-105 flex items-center gap-2 text-sm font-medium"
							>
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
									<path fill-rule="evenodd" d="M6.5 3.75a.75.75 0 0 1 .75-.75h5.5a.75.75 0 0 1 .75.75v.75h3.25a.75.75 0 0 1 0 1.5h-.5v10.5a2.25 2.25 0 0 1-2.25 2.25H6.25A2.25 2.25 0 0 1 4 16.5V6h-.5a.75.75 0 0 1 0-1.5H6.5v-.75Zm1.5.75v.75h4.5v-.75H8Zm-2 2.25v10.5c0 .414.336.75.75.75h7.5c.414 0 .75-.336.75-.75V6H6Zm2.25 2.25a.75.75 0 0 1 1.5 0v6a.75.75 0 0 1-1.5 0v-6Zm4.5 0a.75.75 0 0 1 1.5 0v6a.75.75 0 0 1-1.5 0v-6Z" clip-rule="evenodd" />
								</svg>
								Delete
							</button>
						{/if}

						{#if currentCategory === 'Active'}
							<button
								on:click={() => openPrescriptionModal(patient)}
								title="View Prescriptions"
								aria-label="View prescriptions for {patient.fullName}"
								class="px-3 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-all duration-200 ease-in-out hover:scale-105 flex items-center gap-2 text-sm font-medium"
							>
								<EyeOutline class="w-4 h-4"/>
								View Rx
							</button>
						{/if}
					</div>
				</div>
			{/each}
		</div>
		{:else}
			<div class="text-center py-16 px-6 bg-white rounded-2xl shadow-lg border border-gray-100">
				<div class="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-12 h-12 text-gray-400">
						<path stroke-linecap="round" stroke-linejoin="round" d="M15.182 16.318A4.486 4.486 0 0 0 12.016 15a4.486 4.486 0 0 0-3.198 1.318M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75s.168-.75.375-.75.375.336.375.75Zm-.75 0h.008v.015h-.008V9.75Zm4.5 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.75 0h.008v.015h-.008V9.75Z" />
					</svg>
				</div>
				<h3 class="text-xl font-semibold text-gray-800 mb-2">
					{#if searchTerm}
						No patients found for "{searchTerm}"
					{:else}
						No patients in {currentCategory}
					{/if}
				</h3>
				<p class="text-gray-500 max-w-sm mx-auto leading-relaxed">
					{#if searchTerm}
						Try adjusting your search terms or check a different category.
					{:else if currentCategory === 'Active'}
						Active patients with prescriptions will appear here once they are created.
					{:else}
						Archived patients will appear here once they are moved from active status.
					{/if}
				</p>
			</div>
		{/if}
	</div>
</div>

<!-- Remark Modal -->
{#if showRemarkModal && selectedPatientForRemark}
<div class="fixed inset-0 bg-gray-900 bg-opacity-60 flex justify-center items-center z-[100] transition-opacity duration-300 ease-in-out">
	<div class="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 transform transition-all duration-300 ease-in-out scale-95 opacity-0 animate-modal-appear">
		<div class="bg-gradient-to-r from-yellow-500 to-orange-500 px-6 py-4 rounded-t-2xl">
			<div class="flex items-center gap-3">
				<div class="w-10 h-10 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-white">
						<path fill-rule="evenodd" d="M3 3.75A.75.75 0 0 1 3.75 3h12.5a.75.75 0 0 1 .75.75v3.19l-1.72-.573a4.5 4.5 0 0 0-5.06 0l-1.72.573V3.75ZM4.75 7.24l.875-.29a3 3 0 0 1 3.375 0l0.75 1.25a3 3 0 0 1 3.375 0l.875.29V16.5a.75.75 0 0 1-.75.75h-12.5a.75.75 0 0 1-.75-.75V7.24Z" clip-rule="evenodd" />
					</svg>
				</div>
				<div>
					<h3 class="text-xl font-bold text-white">Archive Patient</h3>
					<p class="text-yellow-100 text-sm">Move patient to archived status</p>
				</div>
			</div>
		</div>
		<div class="p-6">
			<div class="bg-blue-50 rounded-xl p-4 mb-6">
				<div class="flex items-center gap-2 mb-2">
					<div class="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
						{selectedPatientForRemark.fullName.split(' ').map(n => n[0]).join('').substring(0, 2)}
					</div>
					<span class="font-semibold text-gray-800">{selectedPatientForRemark.fullName}</span>
				</div>
				<p class="text-gray-600 text-sm">Please provide a reason for archiving this patient.</p>
			</div>
			<form on:submit|preventDefault={archivePatient}>
			<label for="remark" class="block text-sm font-medium text-gray-700 mb-1">
				Remark:
			</label>
				<textarea
					id="remark"
					bind:value={remark}
					rows="4"
					class="w-full p-4 bg-gray-50 border-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:bg-white transition-all duration-200 resize-none text-gray-700 placeholder-gray-400"
					placeholder="e.g., Moved away, Deceased, No longer a patient..."
				></textarea>

				<div class="flex gap-3 mt-6">
					<button
						type="button"
						on:click={closeRemarkModal}
						class="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-all duration-200 font-medium"
					>
						Cancel
					</button>
					<button
						type="submit"
						class="flex-1 px-4 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded-xl hover:from-yellow-600 hover:to-orange-600 transition-all duration-200 font-medium shadow-lg hover:shadow-xl transform hover:scale-105"
					>
						Confirm Archive
					</button>
				</div>
			</form>
		</div>
	</div>
</div>
{/if}

<!-- Prescription Details Modal -->
{#if showPrescriptionModal && currentPatientForModal}
<div class="fixed inset-0 bg-gray-900 bg-opacity-60 backdrop-blur-sm flex justify-center items-center z-[100] transition-opacity duration-300 ease-in-out"> 
	<div class="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-4 transform transition-all duration-300 ease-in-out scale-95 opacity-0 animate-modal-appear max-h-[90vh] flex flex-col">
		<!-- Modal Header -->
		<div class="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 rounded-t-2xl">
			<div class="flex justify-between items-center">
				<div class="flex items-center gap-3">
					<div class="w-10 h-10 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
						<EyeOutline class="w-5 h-5 text-white"/>
					</div>
					<div>
						<h3 class="text-xl font-bold text-white">Prescription Details</h3>
						<p class="text-blue-100 text-sm">Complete medication history</p>
					</div>
				</div>
				<button 
					on:click={closePrescriptionModal} 
					aria-label="Close prescription details"  
					class="text-white hover:text-blue-200 transition-colors duration-200"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
				</button>
			</div>
		</div>

		<!-- Patient Info Section -->
		<div class="p-6 bg-blue-50 border-b">
			<div class="flex items-center gap-4 mb-4">
				<div class="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xl">
					{currentPatientForModal.fullName.split(' ').map(n => n[0]).join('').substring(0, 2)}
				</div>
				<div>
					<h4 class="text-xl font-bold text-gray-800">{currentPatientForModal.fullName}</h4>
					<p class="text-gray-600">Patient Information</p>
				</div>
			</div>
			
			<div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
				<div class="flex items-center gap-2">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-blue-500">
						<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h6.75M8.25 12h12m-12-.75h12m-12 4.5h6.75M12 21L3 3h18l-9 18Z" />
					</svg>
					<span><strong class="text-gray-600;">Age:</strong> {currentPatientForModal.age} years</span>
				</div>
				<div class="flex items-center gap-2">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-blue-500">
						<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h.75a.75.75 0 0 1-.75-.75v-1.125c0-1.664-1.34-3.125-3-3.125h-2m-2 0c0 1.104-.895 2-2 2h-2m-2.25-6.6c0-.414.336-.75.75-.75h6a.75.75 0 0 1 .75.75v6a.75.75 0 0 1-.75.75H6.75a.75.75 0 0 1-.75-.75v-6Z" />
					</svg>
					<span><strong class="text-gray-600">Phone:</strong> {currentPatientForModal.phone}</span>
				</div>
				<div class="flex items-start gap-2 col-span-2">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-blue-500 mt-0.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
						<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
					</svg>
					<span><strong class="text-gray-600">Address:</strong> {currentPatientForModal.address}</span>
				</div>
			</div>
		</div>

		<!-- Table Container -->
		<div class="p-6 flex-grow overflow-hidden">
			<div class="bg-white border-0 rounded-xl shadow-sm overflow-hidden">
				<div class="overflow-y-auto max-h-96">
				{#if currentPatientForModal.prescriptions && currentPatientForModal.prescriptions.length > 0}
					<table class="min-w-full divide-y divide-gray-200">
						<thead class="bg-gradient-to-r from-blue-50 to-indigo-50 sticky top-0">
							<tr>
								<th scope="col" class="px-6 py-3 text-left text-xs font-bold text-blue-700 uppercase tracking-wider">Date Visited</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-bold text-blue-700 uppercase tracking-wider">Medications</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-bold text-blue-700 uppercase tracking-wider">Dosage</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-bold text-blue-700 uppercase tracking-wider">Instructions</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-bold text-blue-700 uppercase tracking-wider">Prescriber</th>
							</tr>
						</thead>
						<tbody class="bg-white divide-y divide-gray-100">
							{#each currentPatientForModal.prescriptions as prescription (prescription.id)}
								<tr class="hover:bg-blue-50 transition-colors duration-150">
									<td class="px-6 py-4 whitespace-nowrap">
										<div class="flex items-center">
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-blue-500 mr-2">
												<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5a2.25 2.25 0 0 0 2.25-2.25m-18 0v-18a.75.75 0 0 0-1.5 0v18a.75.75 0 0 1-1.5 0zm18 0v-18a.75.75 0 0 1 1.5 0v18a.75.75 0 0 1-1.5 0z" />
											</svg>
											<span class="text-sm font-medium text-gray-900">{prescription.dateVisited || 'N/A'}</span>
										</div>
									</td>
									<td class="px-6 py-4 text-sm text-gray-700">{prescription.medications || 'N/A'}</td>
									<td class="px-6 py-4 text-sm text-gray-700">{prescription.dosage || 'N/A'}</td>
									<td class="px-6 py-4 text-sm text-gray-700">{prescription.instructions || 'N/A'}</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<div class="flex items-center">
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-blue-500 mr-2">
												<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
											</svg>
											<span class="text-sm font-medium text-gray-700">{prescription.prescriber || 'N/A'}</span>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
				</table>
				{:else}
					<div class="text-center py-16">
						<div class="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-10 h-10 text-gray-400">
								<path stroke-linecap="round" stroke-linejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" />
								<path stroke-linecap="round" stroke-linejoin="round" d="M6 6h.008v.008H6V6Z" />
							</svg>
						</div>
						<h4 class="text-lg font-semibold text-gray-800 mb-2">No Prescriptions Found</h4>
						<p class="text-gray-500">This patient doesn't have any prescription records yet.</p>
					</div>
				{/if}
				</div>
			</div>
		</div>

		<!-- Modal Footer -->
		<div class="px-6 py-4 bg-gray-50 border-t border-gray-200 rounded-b-2xl">
			<div class="flex justify-end">
				<button
					on:click={closePrescriptionModal}
					class="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 font-medium shadow-lg hover:shadow-xl transform hover:scale-105"
				>
					Close
				</button>
			</div>
		</div>
	</div>
</div>
{/if}
		
<style>
    :global(.font-poppins) {
        font-family: 'Poppins', sans-serif;
    }
    
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
	.w-20 {
		width: 5rem; 
	}
</style>