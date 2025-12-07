<script lang="ts">
	import { onMount } from 'svelte';
	import { firebaseConfig } from '$lib/firebaseConfig';
	import { initializeApp } from 'firebase/app';
	import { getFirestore, collection, getDocs, deleteDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
	import { EditSolid, EyeOutline, TrashBinSolid,  } from 'flowbite-svelte-icons'; // Added SearchOutline
	import { Table, TableBody, TableBodyCell, TableBodyRow, TableHead, TableHeadCell, Select, Input } from 'flowbite-svelte'; // Added Input

	const app = initializeApp(firebaseConfig);
	const db = getFirestore(app);

	let currentPage = 1;
	let patientsPerPage = 10;

	type Patient = {
		id: string;
		name: string;
		lastName: string;
		middleName?: string;
		suffix?: string;
		address: string;
		phone: string;
		age: number;
		birthday?: string;
		gender?: string;
		email?: string;
		customUserId?: string;
		isArchived?: boolean;
		profileImage?: string;
		// Medical Information
		bloodType?: string;
		allergies?: string;
		currentMedications?: string;
		medicalConditions?: any;
		surgicalHistory?: any;
		familyHistory?: any;
		otherMedicalConditions?: string;
		otherFamilyHistory?: string;
		bloodTransfusionHistory?: string;
		bloodTransfusionDate?: string;
		registeredDate?: string;
	};

	let patients: Patient[] = [];
	let searchTerm = '';
	let isLoading = true;
	let error: string | null = null;
	let selectedSortOption: string = 'name_asc'; // State for the sorting dropdown
	let selectedPatient: Patient | null = null;
	let showDetailsModal = false;
	let updatingStatusId: string | null = null;

	const sortOptions = [
		{ value: 'name_asc', name: 'Sort by Name: A-Z' },
		{ value: 'name_desc', name: 'Sort by Name: Z-A' },
		{ value: 'age_asc', name: 'Sort by Age: Ascending' },
		{ value: 'age_desc', name: 'Sort by Age: Descending' }
	];

	async function fetchPatients() {
		isLoading = true;
		error = null;
		try {
			const querySnapshot = await getDocs(collection(db, "patientProfiles"));
			const patientsData = await Promise.all(
				querySnapshot.docs.map(async (patientDoc) => {
					const data = patientDoc.data();
					
					// Fetch user data for customUserId and isArchived
					let customUserId = 'N/A';
					let isArchived = false;
					let registeredDate = 'N/A';
					
					try {
						const userRef = doc(db, "users", patientDoc.id);
						const userDoc = await getDoc(userRef);
						if (userDoc.exists()) {
							const userData = userDoc.data();
							customUserId = userData.customUserId || 'N/A';
							isArchived = Boolean(userData.isArchived ?? userData.archived ?? false);
							registeredDate = userData.createdAt || userData.registeredAt || 'N/A';
						}
					} catch (err) {
						console.error(`Error fetching user data for ${patientDoc.id}:`, err);
					}
					
					return {
						id: patientDoc.id,
						name: data.name || 'N/A',
						middleName: data.middleName || '',
						lastName: data.lastName || '',
						suffix: data.suffix || '',
						address: data.address || 'N/A',
						phone: data.phone || 'N/A',
						age: data.age || 0,
						birthday: data.birthday || 'N/A',
						gender: data.gender || 'N/A',
						email: data.email || 'N/A',
						customUserId,
						isArchived,
						registeredDate,
						profileImage: data.profileImage || '',
						// Medical Information
						bloodType: data.bloodType || '',
						allergies: data.allergies || '',
						currentMedications: data.currentMedications || '',
						medicalConditions: data.medicalConditions || {},
						surgicalHistory: data.surgicalHistory || {},
						familyHistory: data.familyHistory || {},
						otherMedicalConditions: data.otherMedicalConditions || '',
						otherFamilyHistory: data.otherFamilyHistory || '',
						bloodTransfusionHistory: data.bloodTransfusionHistory || '',
						bloodTransfusionDate: data.bloodTransfusionDate || ''
					};
				})
			);
			patients = patientsData;
		} catch (err) {
			console.error("Error fetching patients:", err);
			error = `Failed to load patient data: ${(err as Error).message}`;
		} finally {
			isLoading = false;
		}
	}

	onMount(() => {
		fetchPatients();
	});

    // Step 1: Filter based on search term
	$: searchedPatients = patients.filter(patient => {
        if (!searchTerm) return true; // Include all if search term is empty

		const searchTermLower = searchTerm.toLowerCase();
		const nameMatch = (patient.name?.toLowerCase() ?? '').includes(searchTermLower);
		const lastNameMatch = (patient.lastName?.toLowerCase() ?? '').includes(searchTermLower);
        // Combine name and lastName for a full name search capability
        const fullNameMatch = (`${patient.name} ${patient.lastName}`.toLowerCase() ?? '').includes(searchTermLower);
		const addressMatch = (patient.address?.toLowerCase() ?? '').includes(searchTermLower);
		const phoneMatch = (patient.phone?.toString() ?? '').includes(searchTerm); // Keep original search term for phone
		const ageStringMatch = (patient.age?.toString() ?? '').includes(searchTerm); // Keep original search term for direct age search

		return fullNameMatch || nameMatch || lastNameMatch || addressMatch || phoneMatch || ageStringMatch;
	});

    // Step 2: Sort the filtered results
    $: sortedPatients = [...searchedPatients].sort((a, b) => {
        switch (selectedSortOption) {
            case 'name_asc':
                 // Sort by combined full name
                return `${a.name} ${a.lastName}`.localeCompare(`${b.name} ${b.lastName}`);
            case 'name_desc':
                return `${b.name} ${b.lastName}`.localeCompare(`${a.name} ${a.lastName}`);
            case 'age_asc':
                return a.age - b.age;
            case 'age_desc':
                return b.age - a.age;
            default:
                return 0; // Should not happen
        }
    });

    // Step 3: Paginate the sorted results
	$: paginatedPatients = sortedPatients.slice((currentPage - 1) * patientsPerPage, currentPage * patientsPerPage);

	$: totalPages = Math.ceil(sortedPatients.length / patientsPerPage);

	// Reset to page 1 when filters/sort change
	$: selectedSortOption, (() => { currentPage = 1; })();
	$: searchTerm, (() => { currentPage = 1; })();


	function goToPage(page: number) {
		if (page < 1) page = 1;
		if (totalPages === 0) {
			currentPage = 1;
		} else if (page > totalPages) {
			currentPage = totalPages;
		} else {
			currentPage = page;
		}
	}

	async function editPatient(id: string) {
		console.log(`Editing patient with ID: ${id}`);
		// Implement navigation or modal logic here
        // Example: await goto(`/admin/patients/edit/${id}`);
	}

	async function deletePatient(id: string) {
		if (!confirm(`Are you sure you want to delete this patient?`)) {
			return;
		}
		try {
			await deleteDoc(doc(db, "patientProfiles", id));
			console.log(`Patient with ID: ${id} deleted successfully`);
			patients = patients.filter(patient => patient.id !== id);

            // Recalculate total pages based on the *currently sorted* list length
			const newTotalPages = Math.ceil(sortedPatients.length / patientsPerPage);
            if (currentPage > newTotalPages && newTotalPages > 0) {
                 currentPage = newTotalPages;
            } else if (paginatedPatients.length === 0 && currentPage > 1) {
                 // This condition might be tricky after filtering/sorting, double check logic
                 // It might be simpler to just recalculate the page based on newTotalPages
                 currentPage = Math.max(1, currentPage -1);
            } else if (paginatedPatients.length === 0 && newTotalPages === 0) {
                currentPage = 1; // Reset to 1 if list becomes empty
            }

		} catch (err) {
			console.error("Error deleting patient:", err);
			error = `Failed to delete patient: ${(err as Error).message}`;
		}
	}

	async function updatePatientStatus(id: string, newStatus: boolean) {
		if (updatingStatusId) return; // Prevent concurrent updates
		
		updatingStatusId = id;
		try {
			const userRef = doc(db, 'users', id);
			await updateDoc(userRef, {
				isArchived: newStatus
			});
			
			// Update local state
			const patientIndex = patients.findIndex(p => p.id === id);
			if (patientIndex !== -1) {
				patients[patientIndex].isArchived = newStatus;
				patients = patients; // Trigger reactivity
			}
			
			// Update selected patient if viewing modal
			if (selectedPatient && selectedPatient.id === id) {
				selectedPatient.isArchived = newStatus;
			}
			
			console.log(`Patient ${id} status updated to ${newStatus ? 'Inactive' : 'Active'}`);
		} catch (err) {
			console.error('Error updating patient status:', err);
			error = `Failed to update status: ${(err as Error).message}`;
		} finally {
			updatingStatusId = null;
		}
	}

	async function viewPatient(id: string) {
		console.log(`Viewing patient with ID: ${id}`);
		const patient = patients.find(p => p.id === id);
		if (patient) {
			selectedPatient = patient;
			showDetailsModal = true;
			// Disable body scroll when modal opens
			document.body.style.overflow = 'hidden';
		}
	}

	function closeDetailsModal() {
		showDetailsModal = false;
		selectedPatient = null;
		// Re-enable body scroll when modal closes
		document.body.style.overflow = '';
	}

	function formatDate(dateString: string): string {
		if (!dateString || dateString === 'N/A') return 'N/A';
		try {
			const date = new Date(dateString);
			return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
		} catch {
			return dateString;
		}
	}

	function getCheckedConditions(conditions: any): string[] {
		if (!conditions || typeof conditions !== 'object') return [];
		return Object.entries(conditions)
			.filter(([_, value]) => value === true)
			.map(([key]) => key.replace(/([A-Z])/g, ' $1').trim())
			.map(str => str.charAt(0).toUpperCase() + str.slice(1));
	}

	function getFamilyHistoryItems(familyHistory: any): Array<{relative: string, conditions: string[]}> {
		if (!familyHistory || typeof familyHistory !== 'object') return [];
		
		const relativeLabels: {[key: string]: string} = {
			mother: 'Mother',
			father: 'Father',
			sister: 'Sister',
			brother: 'Brother',
			daughter: 'Daughter',
			son: 'Son',
			otherRelative: 'Other Relative'
		};
		
		return Object.entries(familyHistory)
			.map(([relative, conditions]: [string, any]) => {
				const checkedConditions = Object.entries(conditions || {})
					.filter(([_, value]) => value === true)
					.map(([key]) => key.replace(/([A-Z])/g, ' $1').trim())
					.map(str => str.charAt(0).toUpperCase() + str.slice(1));
				
				return {
					relative: relativeLabels[relative] || relative,
					conditions: checkedConditions
				};
			})
			.filter(item => item.conditions.length > 0);
	}

</script>

<style>
	:global(.dashboard) {
		display: flex;
		font-family: 'Roboto', sans-serif;
		width: 100%;
		justify-content: center;
	}

	.container {
		flex-grow: 1;
		overflow: auto;
		padding: 20px;
		max-width: 1200px;
		margin: 20px auto;
		border-radius: 10px;
		box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
		background-color: #fff;
	}

	.content-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 20px;
		font-weight: 600;
	}

	.content-header h2 {
		font-size: 1.6rem;
		color: #333;
		margin: 0;
	}

    /* Controls Wrapper holds search and sort */
	.controls-wrapper {
	  display: flex;
      flex-direction: row; /* Default, but explicit */
      justify-content: space-between; /* Push search and sort apart */
	  gap: 15px;
	  margin-bottom: 30px;
	  align-items: center; /* Vertically align items */
	  flex-wrap: wrap; /* Allow wrapping on smaller screens */
	}

	.search-wrapper {
	  flex-grow: 1; /* Allow search to take more space */
      min-width: 250px; /* Ensure search has decent width */
      max-width: 500px; /* Optional: Limit max width */
	}

    /* Styling for the Flowbite Input component */
    :global(.search-wrapper input) {
        border-color: #08B8F3 !important; /* Use !important cautiously, or target more specifically if needed */
        border-radius: 9999px !important; /* Pill shape */
        padding-left: 2.5rem !important; /* Space for icon */
         height: 42px; /* Match Select height */
    }
     :global(.search-wrapper input:focus) {
         border-color: #068fbf !important;
         box-shadow: 0 0 0 1px #068fbf !important; /* Mimic focus ring */
     }


	.sort-select-wrapper {
		min-width: 220px; /* Adjust width as needed */
	}

    /* Styling for the Flowbite Select component */
    :global(.sort-select-wrapper select) {
         border-color: #08B8F3 !important;
         border-radius: 9999px !important; /* Pill shape */
         height: 42px; /* Match Input height */
         padding-right: 2.5rem !important; /* Ensure space for dropdown arrow */
    }
     :global(.sort-select-wrapper select:focus) {
          border-color: #068fbf !important;
          box-shadow: 0 0 0 1px #068fbf !important; /* Mimic focus ring */
     }

	.table-container {
		overflow-x: auto;
		width: 100%;
		margin: auto;
		height: auto;
	}

	.pagination {
		display: flex;
		justify-content: flex-end;
		margin-top: 20px;
		flex-wrap: wrap;
		gap: 5px;
	}

	.pagination button {
		padding: 8px 14px;
		margin: 0;
		font-size: 1rem;
		border: 1px solid #ddd;
		border-radius: 5px;
		background-color: #08B8F3;
		color: white;
		cursor: pointer;
		transition: background-color 0.3s ease;
	}

	.pagination button.active {
	   background-color: #067ca1;
	   font-weight: bold;
	}

	.pagination button:disabled {
		background-color: #cceeff;
		border-color: #cceeff;
		color: #999;
		cursor: not-allowed;
	}

	:global(.table-body-row:nth-child(odd)) {
		background-color: #ffffff;
	}

	:global(.table-body-row:nth-child(even)) {
		background-color: #f0f8ff;
	}

	:global(.table-body-row:hover) {
		background-color: #e6f7ff;
		cursor: default;
	}

	.action-buttons {
		display: flex;
		gap: 10px;
		justify-content: center;
	}

	.action-buttons button {
		background: none;
		border: none;
		padding: 5px;
		cursor: pointer;
		color: #555;
		transition: color 0.2s ease;
	}
	 .action-buttons button.view:hover {
		color: #08B8F3;
	}
	.action-buttons button.edit:hover {
		color: #ffc107;
	}
	.action-buttons button.delete:hover {
		color: #dc3545;
	}

	:global(.text-sm) {
		font-size: 0.95rem;
		color: #333;
	}

	/* Modal Styles */
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		justify-content: center;
		align-items: center;
		z-index: 1000;
		padding: 20px;
		animation: fadeIn 0.3s ease-out;
		overflow-y: auto;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.modal-container {
		background: white;
		border-radius: 12px;
		max-width: 900px;
		width: 100%;
		max-height: 90vh;
		overflow-y: auto;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
		animation: slideUp 0.3s ease-out;
		margin: auto;
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateY(30px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 24px 32px;
		border-bottom: 2px solid #e9ecef;
		background: linear-gradient(135deg, #1e3a66 0%, #172f85 100%);
		color: white;
		border-radius: 12px 12px 0 0;
	}

	.modal-header h2 {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 700;
	}

	.close-btn {
		background: none;
		border: none;
		color: white;
		cursor: pointer;
		padding: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		transition: background-color 0.2s ease;
	}

	.close-btn:hover {
		background-color: rgba(255, 255, 255, 0.2);
	}

	.close-btn svg {
		width: 24px;
		height: 24px;
	}

	.modal-content {
		padding: 32px;
	}

	.profile-section {
		display: flex;
		align-items: center;
		gap: 24px;
		margin-bottom: 32px;
		padding-bottom: 24px;
		border-bottom: 2px solid #e9ecef;
	}

	.profile-image-wrapper {
		width: 100px;
		height: 100px;
		border-radius: 50%;
		overflow: hidden;
		border: 4px solid #08B8F3;
		flex-shrink: 0;
		background-color: #f8f9fa;
	}

	.profile-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.profile-placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: #e9ecef;
		color: #6c757d;
	}

	.profile-placeholder svg {
		width: 50px;
		height: 50px;
	}

	.basic-info h3 {
		margin: 0 0 8px 0;
		font-size: 1.5rem;
		font-weight: 700;
		color: #1e3a66;
	}

	.status-badge {
		display: inline-block;
		padding: 6px 14px;
		border-radius: 20px;
		font-size: 0.85rem;
		font-weight: 600;
	}

	.status-badge.active {
		background: rgba(34, 197, 94, 0.15);
		color: #16a34a;
		border: 1px solid #16a34a;
	}

	.status-badge.inactive {
		background: rgba(239, 68, 68, 0.15);
		color: #dc2626;
		border: 1px solid #dc2626;
	}

	/* Status Select Dropdown Styling */
	.status-select {
		padding: 8px 12px;
		border-radius: 20px;
		border: 2px solid;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.3s ease;
		background-color: white;
		min-width: 100px;
	}

	.status-select.active {
		border-color: #16a34a;
		color: #16a34a;
	}

	.status-select.active:hover {
		background-color: rgba(34, 197, 94, 0.1);
		box-shadow: 0 2px 8px rgba(22, 163, 74, 0.15);
	}

	.status-select.inactive {
		border-color: #dc2626;
		color: #dc2626;
	}

	.status-select.inactive:hover {
		background-color: rgba(239, 68, 68, 0.1);
		box-shadow: 0 2px 8px rgba(220, 38, 38, 0.15);
	}

	.status-select:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.status-select:focus {
		outline: none;
		box-shadow: 0 0 0 3px rgba(8, 184, 243, 0.2);
	}

	.info-section {
		margin-bottom: 28px;
	}

	.section-title {
		font-size: 1.2rem;
		font-weight: 600;
		color: #1e3a66;
		margin-bottom: 16px;
		padding-bottom: 8px;
		border-bottom: 2px solid #e9ecef;
	}

	.info-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 16px;
	}

	.info-item {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.info-item.full-width {
		grid-column: 1 / -1;
	}

	.info-label {
		font-weight: 600;
		font-size: 0.9rem;
		color: #6c757d;
	}

	.info-value {
		font-size: 1rem;
		color: #212529;
		word-break: break-word;
	}

	.conditions-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 10px;
	}

	.condition-badge {
		background: linear-gradient(135deg, #08B8F3 0%, #067ca1 100%);
		color: white;
		padding: 8px 14px;
		border-radius: 20px;
		font-size: 0.9rem;
		font-weight: 500;
		text-align: center;
	}

	.condition-badge.surgery {
		background: linear-gradient(135deg, #ffc107 0%, #ff9800 100%);
	}

	.family-history-item {
		background: #f8f9fa;
		padding: 12px 16px;
		border-radius: 8px;
		margin-bottom: 10px;
		border-left: 4px solid #08B8F3;
	}

	.family-history-item strong {
		color: #1e3a66;
		margin-right: 8px;
	}

	@media (max-width: 768px) {
		.modal-container {
			max-width: 95vw;
			max-height: 95vh;
		}

		.modal-header {
			padding: 16px 20px;
		}

		.modal-header h2 {
			font-size: 1.2rem;
		}

		.modal-content {
			padding: 20px;
		}

		.profile-section {
			flex-direction: column;
			text-align: center;
		}

		.profile-image-wrapper {
			width: 80px;
			height: 80px;
		}

		.info-grid {
			grid-template-columns: 1fr;
			gap: 12px;
		}

		.info-item.full-width {
			grid-column: auto;
		}

		.conditions-grid {
			grid-template-columns: 1fr;
		}
	}
</style>

<div class="dashboard">
	<div class="container">
		{#if isLoading}
			<p>Loading patients...</p>
		{:else if error}
			<p style="color: red;">{error}</p>
		{:else}
			<div class="content-header">
				<h2>Patient List</h2>
			</div>

            <!-- Search and Sort Controls -->
			<div class="controls-wrapper">
                <div class="search-wrapper">
                    <Input type="text" placeholder="Search patients..." bind:value={searchTerm} class="search-input"/>
                </div>

                <div class="sort-select-wrapper">
                     <!-- Using Flowbite Select for Sorting -->
                    <Select items={sortOptions} bind:value={selectedSortOption} class="sort-select"/>
                </div>
			</div>

            <!-- Patient Table -->
			<div class="table-container">
				<Table shadow style="width: 100%; height: auto;">
					 <TableHead style="background-color: #08B8F3; color: white;">
						<TableHeadCell>Full Name</TableHeadCell>
						<TableHeadCell>Address</TableHeadCell>
						<TableHeadCell>Phone</TableHeadCell>
						<TableHeadCell style="text-align: center;">Age</TableHeadCell>
						<TableHeadCell style="text-align: center;">Status</TableHeadCell>
						<TableHeadCell style="text-align: center;">Actions</TableHeadCell>
					</TableHead>
					<TableBody tableBodyClass="divide-y">
						{#each paginatedPatients as patient (patient.id)}
						<TableBodyRow class="table-body-row">
							<TableBodyCell>{patient.name} {patient.lastName}</TableBodyCell>
							<TableBodyCell>{patient.address}</TableBodyCell>
							<TableBodyCell>{patient.phone}</TableBodyCell>
							<TableBodyCell style="text-align: center;">{patient.age}</TableBodyCell>
							<TableBodyCell style="text-align: center;">
								<select 
									class="status-select {patient.isArchived ? 'inactive' : 'active'}"
									value={patient.isArchived ? 'inactive' : 'active'}
									on:change={(e) => updatePatientStatus(patient.id, e.currentTarget.value === 'inactive')}
									disabled={updatingStatusId === patient.id}
								>
									<option value="active">Active</option>
									<option value="inactive">Inactive</option>
								</select>
							</TableBodyCell>
							<TableBodyCell>
								<div class="action-buttons">
									 <button title="View Details" class="view" on:click={() => viewPatient(patient.id)}>
										<EyeOutline size="sm"/>
									</button>
									<button title="Edit Patient" class="edit" on:click={() => editPatient(patient.id)}>
										<EditSolid size="sm"/>
									</button>
									<button title="Delete Patient" class="delete" on:click={() => deletePatient(patient.id)}>
										<TrashBinSolid size="sm"/>
									</button>
								</div>
							</TableBodyCell>
						</TableBodyRow>
						 {:else}
						 <TableBodyRow>
							 <TableBodyCell colspan={6} style="text-align: center; padding: 20px;">
								 No patients found{searchTerm || selectedSortOption !== 'name_asc' ? ' matching the criteria.' : '.'}
							 </TableBodyCell>
						 </TableBodyRow>
						{/each}
					</TableBody>
				</Table>

                <!-- Pagination -->
				 {#if totalPages > 1}
				<div class="pagination">
					<button on:click={() => goToPage(currentPage - 1)} disabled={currentPage === 1}>« Prev</button>
					{#if totalPages <= 7}
						{#each Array(totalPages) as _, i}
							<button
								on:click={() => goToPage(i + 1)}
								class:active={currentPage === i + 1}
							>
								{i + 1}
							</button>
						{/each}
					{:else}
                        <!-- Simplified Ellipsis Logic -->
						<button on:click={() => goToPage(1)} class:active={currentPage === 1}>1</button>
						{#if currentPage > 3}<span class="px-2">...</span>{/if}
						{#each [-1, 0, 1] as offset}
                             {@const pageNum = currentPage + offset}
							 {#if pageNum > 1 && pageNum < totalPages}
								<button
									on:click={() => goToPage(pageNum)}
									class:active={currentPage === pageNum}
								>
									{pageNum}
								</button>
							{/if}
						{/each}
						{#if currentPage < totalPages - 2}<span class="px-2">...</span>{/if}
						 <button on:click={() => goToPage(totalPages)} class:active={currentPage === totalPages}>{totalPages}</button>
					{/if}
					<button on:click={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages}>Next »</button>
				</div>
				 {/if}
			</div>
		{/if}
	</div>
</div>

<!-- Member Details Modal -->
{#if showDetailsModal && selectedPatient}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" on:click={closeDetailsModal}>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal-container" on:click|stopPropagation>
			<div class="modal-header">
				<h2>Member Information</h2>
				<!-- svelte-ignore a11y_consider_explicit_label -->
				<button class="close-btn" on:click={closeDetailsModal} title="Close" aria-label="Close modal">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
			
			<div class="modal-content">
				<!-- Profile Image and Basic Info -->
				<div class="profile-section">
					<div class="profile-image-wrapper">
						{#if selectedPatient.profileImage}
							<img src={selectedPatient.profileImage} alt="Profile" class="profile-img" />
						{:else}
							<div class="profile-placeholder">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
								</svg>
							</div>
						{/if}
					</div>
					<div class="basic-info">
						<h3>{[selectedPatient.name, selectedPatient.middleName, selectedPatient.lastName, selectedPatient.suffix].filter(Boolean).join(' ')}</h3>
						<div class="status-badge {selectedPatient.isArchived ? 'inactive' : 'active'}">
							{selectedPatient.isArchived ? 'Inactive' : 'Active'}
						</div>
					</div>
				</div>

				<!-- Personal Information -->
				<div class="info-section">
					<h4 class="section-title">Personal Information</h4>
					<div class="info-grid">
						<div class="info-item">
							<span class="info-label">Member ID:</span>
							<span class="info-value">{selectedPatient.customUserId || 'N/A'}</span>
						</div>
						<div class="info-item">
							<span class="info-label">Age:</span>
							<span class="info-value">{selectedPatient.age || 'N/A'}</span>
						</div>
						<div class="info-item">
							<span class="info-label">Birthday:</span>
							<span class="info-value">{formatDate(selectedPatient.birthday || '')}</span>
						</div>
						<div class="info-item">
							<span class="info-label">Gender:</span>
							<span class="info-value">{selectedPatient.gender || 'N/A'}</span>
						</div>
						<div class="info-item">
							<span class="info-label">Phone:</span>
							<span class="info-value">{selectedPatient.phone || 'N/A'}</span>
						</div>
						<div class="info-item">
							<span class="info-label">Email:</span>
							<span class="info-value">{selectedPatient.email || 'N/A'}</span>
						</div>
						<div class="info-item full-width">
							<span class="info-label">Address:</span>
							<span class="info-value">{selectedPatient.address || 'N/A'}</span>
						</div>
						<div class="info-item">
							<span class="info-label">Registered:</span>
							<span class="info-value">{formatDate(selectedPatient.registeredDate || '')}</span>
						</div>
						<div class="info-item">
							<span class="info-label">Status:</span>
							<span class="info-value">{selectedPatient.isArchived ? 'Inactive' : 'Active'}</span>
						</div>
					</div>
				</div>

				<!-- Medical Information -->
				<div class="info-section">
					<h4 class="section-title">Medical Information</h4>
					<div class="info-grid">
						<div class="info-item">
							<span class="info-label">Blood Type:</span>
							<span class="info-value">{selectedPatient.bloodType || 'Not specified'}</span>
						</div>
						<div class="info-item full-width">
							<span class="info-label">Allergies:</span>
							<span class="info-value">{selectedPatient.allergies || 'None reported'}</span>
						</div>
						<div class="info-item full-width">
							<span class="info-label">Current Medications:</span>
							<span class="info-value">{selectedPatient.currentMedications || 'None reported'}</span>
						</div>
					</div>
				</div>

				<!-- Medical Conditions -->
				{#if selectedPatient.medicalConditions && Object.keys(selectedPatient.medicalConditions).length > 0}
					{@const conditions = getCheckedConditions(selectedPatient.medicalConditions)}
					{#if conditions.length > 0}
						<div class="info-section">
							<h4 class="section-title">Medical Conditions</h4>
							<div class="conditions-grid">
								{#each conditions as condition}
									<div class="condition-badge">{condition}</div>
								{/each}
							</div>
						</div>
					{/if}
				{/if}

				<!-- Surgical History -->
				{#if selectedPatient.surgicalHistory && Object.keys(selectedPatient.surgicalHistory).length > 0}
					{@const surgeries = getCheckedConditions(selectedPatient.surgicalHistory)}
					{#if surgeries.length > 0}
						<div class="info-section">
							<h4 class="section-title">Surgical History</h4>
							<div class="conditions-grid">
								{#each surgeries as surgery}
									<div class="condition-badge surgery">{surgery}</div>
								{/each}
							</div>
						</div>
					{/if}
				{/if}

				<!-- Family History -->
				{#if selectedPatient.familyHistory && Object.keys(selectedPatient.familyHistory).length > 0}
					{@const familyItems = getFamilyHistoryItems(selectedPatient.familyHistory)}
					{#if familyItems.length > 0}
						<div class="info-section">
							<h4 class="section-title">Family History</h4>
							{#each familyItems as item}
								<div class="family-history-item">
									<strong>{item.relative}:</strong> {item.conditions.join(', ')}
								</div>
							{/each}
						</div>
					{/if}
				{/if}

				<!-- Other Medical Information -->
				{#if selectedPatient.otherMedicalConditions || selectedPatient.otherFamilyHistory || selectedPatient.bloodTransfusionHistory}
					<div class="info-section">
						<h4 class="section-title">Additional Medical Information</h4>
						{#if selectedPatient.otherMedicalConditions}
							<div class="info-item full-width">
								<span class="info-label">Other Medical Conditions:</span>
								<span class="info-value">{selectedPatient.otherMedicalConditions}</span>
							</div>
						{/if}
						{#if selectedPatient.otherFamilyHistory}
							<div class="info-item full-width">
								<span class="info-label">Other Family History:</span>
								<span class="info-value">{selectedPatient.otherFamilyHistory}</span>
							</div>
						{/if}
						{#if selectedPatient.bloodTransfusionHistory}
							<div class="info-item full-width">
								<span class="info-label">Blood Transfusion History:</span>
								<span class="info-value">{selectedPatient.bloodTransfusionHistory}</span>
							</div>
						{/if}
						{#if selectedPatient.bloodTransfusionDate}
							<div class="info-item">
								<span class="info-label">Blood Transfusion Date:</span>
								<span class="info-value">{formatDate(selectedPatient.bloodTransfusionDate)}</span>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}