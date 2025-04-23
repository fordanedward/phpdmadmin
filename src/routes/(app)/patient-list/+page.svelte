<script lang="ts">
	import { onMount } from 'svelte';
	import { firebaseConfig } from '$lib/firebaseConfig';
	import { initializeApp } from 'firebase/app';
	import { getFirestore, collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
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
		address: string;
		phone: string;
		age: number;
	};

	let patients: Patient[] = [];
	let searchTerm = '';
	let isLoading = true;
	let error: string | null = null;
	let selectedSortOption: string = 'name_asc'; // State for the sorting dropdown

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
			patients = querySnapshot.docs.map(doc => ({
				id: doc.id,
				name: doc.data().name || 'N/A',
				lastName: doc.data().lastName || '',
				address: doc.data().address || 'N/A',
				phone: doc.data().phone || 'N/A',
				age: doc.data().age || 0
			}));
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

	function viewPatient(id: string) {
		console.log(`Viewing patient with ID: ${id}`);
        // Implement navigation or modal logic here
        // Example: await goto(`/admin/patients/view/${id}`);
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
						<TableHeadCell style="text-align: center;">Actions</TableHeadCell>
					</TableHead>
					<TableBody tableBodyClass="divide-y">
						{#each paginatedPatients as patient (patient.id)}
						<TableBodyRow class="table-body-row">
							<TableBodyCell>{patient.name} {patient.lastName}</TableBodyCell>
							<TableBodyCell>{patient.address}</TableBodyCell>
							<TableBodyCell>{patient.phone}</TableBodyCell>
							<TableBodyCell style="text-align: center;">{patient.age}</TableBodyCell>
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
							 <TableBodyCell colspan={5} style="text-align: center; padding: 20px;">
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