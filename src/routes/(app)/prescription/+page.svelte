<script lang="ts">
    import { Button, Table, TableBody, TableBodyCell, TableBodyRow, TableHead, TableHeadCell } from 'flowbite-svelte'; 
    import { onMount } from 'svelte';
    import { firebaseConfig } from "$lib/firebaseConfig"; 
    import { initializeApp } from 'firebase/app';
    import { getFirestore, collection, updateDoc, getDocs, doc } from 'firebase/firestore'; 
    import { goto } from '$app/navigation'; 
    import { EyeOutline } from 'flowbite-svelte-icons'; 
    import Swal from "sweetalert2";

    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    let isCollapsed = false;
    let patients: any[] = [];
    let archivedPatients: any[] = [];

    let prescribedPatients: any[] = [];
    let searchTerm = '';  
    let filteredPatients: any[] = [];
    let currentCategory: 'Active' | 'Archived' = 'Active';
    let showModal = false; 
    let currentPatient: any = {}; 

    let sortColumn = '';
    let sortDirection = 'asc'; 

    let showRemarkModal = false; // Controls the visibility of the remark modal
    let selectedPatient: any = null; // Stores the patient to be archived
    let remark = ''; // Stores the remark


    function toggleSidebar() {
        isCollapsed = !isCollapsed;
    }

    function logout() {
        window.location.href = "/"; 
    }
    
    function sortPatients(column: string) {
    if (sortColumn === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = column;
        sortDirection = 'asc';
    }

    filteredPatients.sort((a, b) => {
        if (column === 'age') {
            return sortDirection === 'asc' ? a.age - b.age : b.age - a.age;
        } else {
            if (a[column] < b[column]) return sortDirection === 'asc' ? -1 : 1;
            if (a[column] > b[column]) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        }
    });
}
    
    function filterPatients() {
    const currentList = currentCategory === 'Active'
        ? patients.filter(patient => !patient.isArchived)
        : patients.filter(patient => patient.isArchived);

    if (searchTerm.trim() === '') {
        filteredPatients = [...currentList];
    } else {
        filteredPatients = currentList.filter(patient =>
            Object.values(patient).some(value => {
                if (typeof value === 'string') {
                    return value.toLowerCase().includes(searchTerm.toLowerCase());
                }
                if (typeof value === 'number') {
                    return value.toString().includes(searchTerm);
                }
                return false;
            })
        );
    }
}

function filterAndSortPatients() {

    filterPatients();
    sortPatients(sortColumn);

}

async function fetchPatients() {
    try {
        const querySnapshot = await getDocs(collection(db, "patientProfiles"));
        patients = querySnapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name,
            lastName: doc.data().lastName,
            address: doc.data().address,
            phone: doc.data().phone,
            age: doc.data().age,
            birthday: doc.data().birthday || '', // Add birthday field, default to empty string if missing
            isArchived: doc.data().isArchived || false,
            remark: doc.data().remark || 'No remark provided', 
        }));
        filterPatientsByCategory();
    } catch (error) {
        console.error("Error fetching patients:", error);
    }
}


    function filterPatientsByCategory() {
    if (currentCategory === 'Active') {
        // Include only active and prescribed patients
        filteredPatients = patients.filter(patient => !patient.isArchived && prescribedPatients.some(p => p.id === patient.id));
    } else {
        // Include only archived patients
        filteredPatients = patients.filter(patient => patient.isArchived);
    }
}

function switchCategory(category: 'Active' | 'Archived') {
    currentCategory = category;
    searchTerm = ''; // Reset search term when switching categories
    filterAndSortPatients();
}

function openRemarkModal(patient: any) {
        selectedPatient = patient;
        showRemarkModal = true;
        remark = ''; // Reset the remark input
    }

// Function to close the modal
function closeRemarkModal() {
        showRemarkModal = false;
    }

    async function archivePatient() {
    if (!selectedPatient) return;

    try {
        // Update the patient with isArchived and remark in Firestore
        const patientRef = doc(db, "patientProfiles", selectedPatient.id);
        await updateDoc(patientRef, {
            isArchived: true,
            remark: remark, // Save the remark to the database
        });

        // Update local data
        const patientIndex = patients.findIndex(patient => patient.id === selectedPatient.id);
        if (patientIndex !== -1) {
            patients[patientIndex].isArchived = true;
            patients[patientIndex].remark = remark; // Update the remark locally
        }

        // Reapply filters to update the UI
        filterPatients();

        // Close the modal
        showRemarkModal = false;

        // Show success message
        await Swal.fire({
            title: "Archived!",
            text: "The patient has been archived with the remark.",
            icon: "success",
            confirmButtonText: "Okay",
            confirmButtonColor: "#3085d6",
        });
    } catch (error) {
        console.error("Error archiving patient:", error);
        Swal.fire({
            title: "Error",
            text: "There was an issue archiving the patient. Please try again later.",
            icon: "error",
            confirmButtonColor: "#3085d6",
        });
    }
}


   
    
async function unarchivePatient(id: string) {
    try {
        // Show confirmation dialog
        const result = await Swal.fire({
            title: "Are you sure?",
            text: "Do you want to unarchive this patient?",
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#3085d6",
            cancelButtonColor: "#d33",
            confirmButtonText: "Yes, unarchive it!",
        });

        if (result.isConfirmed) {
            // Proceed to unarchive the patient
            const patientRef = doc(db, "patientProfiles", id);
            await updateDoc(patientRef, { isArchived: false });

            // Update local data
            const patientIndex = patients.findIndex(patient => patient.id === id);
            if (patientIndex !== -1) {
                patients[patientIndex].isArchived = false;
                filterPatientsByCategory();
            }

            // Show success alert
            await Swal.fire({
                title: "Unarchived!",
                text: "The patient has been unarchived.",
                icon: "success",
                confirmButtonText: "Okay",
                confirmButtonColor: "#3085d6",
            });
        }
    } catch (error) {
        // Show error alert
        Swal.fire({
            title: "Error",
            text: "There was an issue unarchiving the patient. Please try again later.",
            icon: "error",
            confirmButtonColor: "#3085d6",
        });

        console.error("Error unarchiving patient:", error);
    }
}

async function fetchPrescribedPatients() {
    // Fetch prescriptions from the 'prescriptions' collection
    const prescriptionsSnapshot = await getDocs(collection(db, "prescriptions"));
    const prescriptions = prescriptionsSnapshot.docs.map(doc => {
        const data = doc.data();

        // Extract instructions and dosage from medicines array
        const instructions = data.medicines && data.medicines.length > 0 
            ? data.medicines.map((m: { instructions: any; }) => m.instructions).join(", ") 
            : '';  // If no medicines, return an empty string
        
        const dosage = data.medicines && data.medicines.length > 0
            ? data.medicines.map((m: { dosage: any; }) => m.dosage).join(", ")
            : '';  // If no medicines, return an empty string

        return {
            id: doc.id,
            appointmentId: data.appointmentId,  // Store the appointmentId from prescriptions
            instructions: instructions,         // Map instructions correctly
            medications: data.medicines ? data.medicines.map((m: { medicine: any; }) => m.medicine).join(", ") : '',
            prescriber: data.prescriber || '',
            dosage: dosage                      // Use dosage instead of qtyRefills
        };
    });

    // Fetch appointments to get patientId and date
    const appointmentsSnapshot = await getDocs(collection(db, "appointments"));
    const appointments = appointmentsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            patientId: data.patientId,  // Extract patientId from appointments
            date: data.date || ''       // Extract date from appointments
        };
    });

    // Map prescriptions to the corresponding patient and date
    prescribedPatients = prescriptions.map(prescription => {
        // Find the appointment that matches the prescription's appointmentId
        const appointment = appointments.find(app => app.id === prescription.appointmentId);

        // If appointment is found, fetch the patientId and date
        const patientId = appointment ? appointment.patientId : null;
        const dateVisited = appointment ? appointment.date : '';

        return {
            ...prescription,
            patientId: patientId,
            dateVisited: dateVisited  // Use the date from the appointments collection
        };
    });

    // Fetch patient profiles to link with prescriptions
    const patientsSnapshot = await getDocs(collection(db, "patientProfiles"));
    const patients = patientsSnapshot.docs.map(doc => doc.data());

    // Map prescriptions to patients and group prescriptions by patient
    prescribedPatients = patients.map(patient => {
        // Match prescriptions with patients using patientId
        const patientPrescriptions = prescribedPatients.filter(prescription => prescription.patientId === patient.id);
        return {
            id: patient.id,
            fullName: `${patient.name} ${patient.lastName}`,
            address: patient.address,
            phone: patient.phone,
            birthday: patient.birthday,
            age: patient.age,
            prescriptions: patientPrescriptions
        };
    });

    console.log("Prescribed Patients:", prescribedPatients);  // Check the final result
}


onMount(fetchPatients);

onMount(async () => {
    await fetchPatients();
    await fetchPrescribedPatients();
    filterAndSortPatients(); // Initialize with default settings  
});



    // Open the modal to view prescriptions of the selected patient
    function openPrescriptionModal(patient: any) {
        currentPatient = prescribedPatients.find(p => p.id === patient.id) || {};
        showModal = true;
    }

    // Close the modal
    function closeModal() {
        showModal = false;
        currentPatient = {};
    }
</script>


<div class="dashboard">
    

  
        <div class="container">
            
     
        <!-- Search Bar -->
        <div class="search-and-sort-container">
            <div class="search-input-wrapper">
                <svg
                    class="search-icon"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M21 21l-4.35-4.35m-5.15 0a7 7 0 100-14 7 7 0 000 14z"
                    />
                </svg>
                <input
                    type="text"
                    placeholder="Search patients..."
                    bind:value={searchTerm}
                    on:input={filterAndSortPatients}
                    class="search-input-modern"
                />
            </div>
            <select bind:value={sortColumn} on:change={filterAndSortPatients} class="sort-dropdown">
                <option value="name">Sort by Name: A–Z</option>
                <option value="name" data-sort="desc">Sort by Name: Z–A</option>
                <option value="age">Sort by Age: Ascending</option>
                <option value="age" data-sort="desc">Sort by Age: Descending</option>
            </select>
        </div>
        <div class="category-switch">
            <button 
                class="category-button {currentCategory === 'Active' ? 'active' : ''}" 
                on:click={() => switchCategory('Active')}>
                Active Patients
            </button>
            <button 
                class="category-button {currentCategory === 'Archived' ? 'active' : ''}" 
                on:click={() => switchCategory('Archived')}>
                Archived Patients
            </button>
        </div>
        
        
        <Table>
            <TableHead>
                <TableHeadCell>Name</TableHeadCell>
                <TableHeadCell>Address</TableHeadCell>
                <TableHeadCell>Phone</TableHeadCell>
                <TableHeadCell>Birth Date</TableHeadCell>
                <TableHeadCell>Age</TableHeadCell>
        
                {#if currentCategory === 'Archived'}
                    <TableHeadCell>Remark</TableHeadCell>
                {/if}
                <TableHeadCell>Actions</TableHeadCell>
            </TableHead>
        
            <TableBody>
                {#each filteredPatients as patient}
                    <TableBodyRow>
                        <TableBodyCell>{patient.name} {patient.lastName}</TableBodyCell>
                        <TableBodyCell>{patient.address}</TableBodyCell>
                        <TableBodyCell>{patient.phone}</TableBodyCell>
                        <TableBodyCell>{patient.birthday}</TableBodyCell>
                        <TableBodyCell>{patient.age}</TableBodyCell>
        
                        {#if currentCategory === 'Archived'}
                            <TableBodyCell>{patient.remark || 'No remark provided'}</TableBodyCell>
                        {/if}
        
                        <TableBodyCell>
                            {#if currentCategory === 'Archived'}
                                <Button on:click={() => unarchivePatient(patient.id)}>
                                    <img src="./images/unarchive.png" alt="Unarchive" class="action-icon" />
                                </Button>
                            {/if}
                            {#if currentCategory === 'Active'}
                                <Button on:click={() => openRemarkModal(patient)}>
                                    <img src="./images/archive.png" alt="Archive" class="action-icon" />
                                </Button>
                            {/if}
                            <Button on:click={() => openPrescriptionModal(patient)}>
                                <img src="./images/prescription.png" alt="View Prescriptions" class="action-icon" />
                            </Button>
                        </TableBodyCell>
                    </TableBodyRow>
                {/each}
            </TableBody>
        </Table>
    </div>
</div>

{#if showRemarkModal}
<div class="modal fixed inset-0 bg-gray-500 bg-opacity-50 flex justify-center items-center z-50">
    <div class="modal-content bg-white p-6 rounded-lg shadow-lg w-11/12 md:w-2/3 lg:w-1/2">
        <h3 class="text-xl font-semibold mb-4">Archive Patient</h3>
        <p class="mb-4">Please provide a remark before archiving the patient.</p>

        <form on:submit|preventDefault={archivePatient}>
            <label for="remark" class="block text-sm font-medium text-gray-700 mb-2">
                Remark:
            </label>
            <textarea
                id="remark"
                bind:value={remark}
                rows="4"
                class="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter your remark here"
                required
            ></textarea>

            <div class="flex justify-end mt-4">
                <button
                    type="button"
                    on:click={closeRemarkModal}
                    class="bg-gray-300 text-gray-700 py-2 px-4 rounded mr-2 hover:bg-gray-400"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    class="bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600"
                >
                    Submit
                </button>
            </div>
        </form>
    </div>
</div>
{/if}

       <!-- Modal Content -->
{#if showModal}
<div class="modal fixed inset-0 bg-gray-500 bg-opacity-50 flex justify-center items-center z-50">
    <div class="modal-content bg-white p-6 rounded-lg shadow-lg w-11/12 md:w-2/3 lg:w-1/2">
        <h3 class="text-xl font-semibold mb-4">Prescription Details</h3>
        <p><strong>Patient Name:</strong> {currentPatient.fullName}</p>
        <p><strong>Address:</strong> {currentPatient.address}</p>
        <p><strong>Phone:</strong> {currentPatient.phone}</p>
        <p><strong>Birthday:</strong> {currentPatient.birthday}</p>
        <p><strong>Age:</strong> {currentPatient.age}</p>
    
        <!-- Check if prescriptions exist -->
        {#if currentPatient.prescriptions && currentPatient.prescriptions.length > 0}
            <!-- Display all prescriptions in a table -->
            <div class="modal-table-container">
                <table class="modal-table">
                    <thead>
                        <tr>
                            <th>Instructions</th>
                            <th>Medications</th>
                            <th>Date Visited</th>
                            <th>Prescriber</th>
                            <th>Qty Refills</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each currentPatient.prescriptions as prescription}
                        <tr>
                            <td>{prescription.instructions}</td>
                            <td>{prescription.medications}</td>
                            <td>{prescription.dateVisited}</td>
                            <td>{prescription.prescriber}</td>
                            <td>{prescription.dosage}</td>

                        </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        {:else}
            <!-- Message if no prescriptions found -->
            <p class="text-center text-gray-500 mt-4">No prescription issued for this patient.</p>
        {/if}

        <!-- Close Button -->
        <button 
            on:click={closeModal} 
            class="bg-red-500 text-white py-2 px-4 rounded mt-4 hover:bg-red-600"
        >
            Close
        </button>
    </div>
</div>
{/if}


    <style>
        @import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.3/css/all.min.css');
        :global(.dashboard) {
            display: flex;
            height: 100vh;
            overflow: hidden;
            font-family: 'Roboto', sans-serif;
        }
    
       :global(.content) {
            flex-grow: 1;
            overflow: auto;
            padding-left: 0.5rem;
            margin-left: -10rem;
            transition: margin-left 0.3s ease;
            margin-top: -1.8rem;
           
        }
        /* Header Styling */
        :global(.content-header) {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            font-weight: 600;
        }
    
        /* Table Container */
        :global(.table-container) {
            border-radius: 10px;
            padding: 30px;
            overflow-x: auto;
            width: 100%;
            max-width: 1200px;
            margin: auto;
            height: auto;
        }
    
        /* Search Bar */
        :global(.search-bar) {
            margin-bottom: 30px;
            width: 80%;
        }
    
        :global(.search-input) {
            width: 80%;
            padding: 15px;
            border-radius: 8px;
            border: 1px solid #ccc;
            font-size: 1rem;
            box-sizing: border-box;
            transition: border-color 0.3s ease;
        }
    
        :global(.search-input:focus) {
            border-color: #08B8F3;
            outline: none;
        }
    
        /* Pagination */
        :global(.pagination) {
            display: flex;
            justify-content: flex-end;
            margin-top: 20px;
        }
    
        :global(.pagination button) {
            padding: 10px 16px;
            margin: 0 5px;
            font-size: 1.1rem;
            border: 1px solid #ddd;
            border-radius: 5px;
            background-color: #08B8F3;
            color: white;
            cursor: pointer;
            transition: background-color 0.3s ease;
        }
    
       
    
        :global(.pagination button:disabled) {
            background-color: #d6d6d6;
            cursor: not-allowed;
        }
    
        /* Table Styling */
        :global(table) {
            width: 100%;
            border-collapse: collapse;
        }
    
        :global(th), :global(td) {
            padding: 15px;
            text-align: left;
            font-size: 1rem;
            border-bottom: 1px solid #ddd;
        }
    
        :global(th) {
            background-color: #08B8F3; /* Bright blue for table headers */
            color: white;
            font-weight: bold;
        }
    
        /* Alternate Row Colors */
        :global(tr:nth-child(odd)) {
            background-color: #ffffff;
        }
    
        :global(tr:nth-child(even)) {
            background-color: #f0f8ff; /* Soft blue for alternate rows */
        }
    
        /* Hover Effect on Rows */
        :global(tr:hover) {
            background-color: #f1f1f1;
            cursor: pointer;
        }
    
        /* Container Styling */
        :global(.container) {
            padding: 20px;
            max-width: 100%;
            margin: auto;
            margin-top: 20px;
            border-radius: 10px;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
            background-color: #fff;
        }
    
        /* Logo Styling */
        :global(.logo-img) {
            width: 50px;
            height: auto;
            margin-right: 15px;
        }
    
        /* Formal Text Styling */
        :global(.text-sm) {
            font-size: 0.95rem;
            color: #333;
        }
    
        :global(h1, h2) {
            font-size: 1.6rem;
            color: #333;
            margin: 10px 0;
            font-weight: 600;
        }
    
        /* Text Styling for Clinic Info */
        :global(.clinic-info) {
            font-size: 0.95rem;
            color: #666;
        }
    
        :global(.clinic-info p) {
            margin: 5px 0;
        }
    
        /* Footer */
        :global(.footer) {
            margin-top: 50px;
            padding: 10px;
            text-align: center;
            font-size: 0.85rem;
            color: #888;
        }
    
    
        button {
            padding: 6px 12px;
            background-color: #4CAF50;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
    
        button:hover {
            background-color: #d3d3d3;
        }
    
        /* Modal styles */
        .modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
        }
    
        .modal-content {
            background-color: white;
            padding: 20px;
            border-radius: 5px;
            max-width: 600px;
            width: 100%;
        }
        
    
    .search-and-sort-container {
        display: flex;
        align-items: left;
        gap: 10px;
        margin-bottom: 20px;
        width: 100%;
        max-width: 1200px;
        margin: auto;
        padding-right: 1rem;
    }
     /* Wrapper for search input and icon */
     .search-input-wrapper {
        position: relative;
        width: 80%; /* Set the width to 80% */
        padding-right: 9%; /* Move it slightly from the left */
        flex: none; /* Prevent flex from resizing */
    }
    
    /* Search Icon */
    .search-icon {
        position: absolute;
        top: 50%;
        left: 15px;
        transform: translateY(-50%);
        width: 20px;
        height: 20px;
        fill: none;
        stroke: #888;
    }
    
    /* Search Input */
    .search-input-modern {
        width: 100%;
        padding: 12px 12px 12px 45px; /* Space for the icon */
        border-radius: 50px;
        border: 1px solid #ccc;
        font-size: 1rem;
        transition: all 0.3s ease;
        background-color: #f9f9f9;
        box-sizing: border-box;
        color: #333;
        margin-left:-10px;
    }
    
    .search-input-modern:focus {
        border-color: #08B8F3;
        box-shadow: 0 0 5px rgba(8, 184, 243, 0.5);
        outline: none;
    }
    
    /* Hover Effect */
    .search-input-modern:hover {
        border-color: #08B8F3;
    }
    
    
    .sort-dropdown {
        padding: 15px;
        border: 1px solid #ccc;
        border-radius: 50px;
        font-size: 1rem;
        background-color: #fff;
        color: #333;
        transition: border-color 0.3s ease;
        margin-left:-10px;
    }
    
    .sort-dropdown:focus {
        border-color: #08B8F3;
        outline: none;
    }
    .category-switch {
    margin-top: 10px;
    display: flex;
    justify-content: flex-start;  /* Para magkalapit sila */
    gap: 10px;  /* Magdagdag ng space sa pagitan ng mga button */
    margin-bottom: 20px;
}

.category-button {
    padding: 10px 20px;
    background-color: white;
    color: black;
    border: none;
    border-top-left-radius: 20px;  /* Round top-left corner */
    border-top-right-radius: 20px; /* Round top-right corner */
    border-bottom-left-radius: 0;  /* Flat bottom-left corner */
    border-bottom-right-radius: 0; /* Flat bottom-right corner */
    cursor: pointer;
    transition: background-color 0.3s ease;
}

.category-button.active {
    color: white;
 background: linear-gradient(90deg, #08B8F3, #005b80); /* Gradient background */
    
}

        /* Modal Table Container */
    .modal-table-container {
        overflow-x: auto; /* Adds horizontal scrolling if content overflows */
        margin-top: 1rem;
    }
    
    /* Modal Table Styles */
    .modal-table {
        width: 100%;
        border-collapse: collapse;
        text-align: center;
        font-size: 0.9rem;
        background-color: white;
    }
    
    .modal-table th, 
    .modal-table td {
        border: 1px solid #ccc;
        padding: 8px;
    }
    
    .modal-table th {
        background-color: #08B8F3;
        color: white;
        font-weight: bold;
    }
    
    .modal-table tbody tr:nth-child(even) {
        background-color: #f9f9f9;
    }
    
    /* Responsive Adjustments */
    @media (max-width: 768px) {
        .modal-content {
            padding: 1rem;
        }
    
        .modal-table th,
        .modal-table td {
            font-size: 0.8rem;
            padding: 6px;
        }
    }
    .action-icon {
        width: 20px; /* Adjust size */
        height: 20px;
        margin: 0 5px; /* Add some spacing if needed */
        vertical-align: middle; /* Align with text if present */
    }
    
    </style>