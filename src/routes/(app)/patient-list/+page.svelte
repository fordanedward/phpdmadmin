<script lang="ts">
    import { onMount } from 'svelte';
    import { firebaseConfig } from "$lib/firebaseConfig"; // Import Firebase config
    import { initializeApp } from 'firebase/app';
    import { getFirestore, collection, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore';
    import { EditSolid,EyeOutline, TrashBinSolid } from 'flowbite-svelte-icons'; // Import Flowbite icons
    import { Table, TableBody, TableBodyCell, TableBodyRow, TableHead, TableHeadCell } from 'flowbite-svelte';
  

    // Initialize Firebase
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);  // Initialize Firestore

    let isCollapsed = false;
    let currentPage = 1;
    let patientsPerPage = 10;

    function toggleSidebar() {
        isCollapsed = !isCollapsed;
    }

    function logout() {
        window.location.href = "/"; // Redirect to main landing page
    }

    type Patient = {
        lastName: any;
        id: string;
        name: string;
        address: string;
        phone: string;
        age: number;
        // Add other relevant fields as necessary
    };

    let patients: Patient[] = []; // Explicitly define the type of patients
    let searchTerm = '';
    let isLoading = true;
    let error: string | null = null; // Explicitly define the type of error

    // Fetch user data from Firebase Firestore
    async function fetchPatients() {
        try {
            const querySnapshot = await getDocs(collection(db, "patientProfiles")); // 'patients' is the Firestore collection name
            patients = querySnapshot.docs.map(doc => ({
                id: doc.id,
                name: doc.data().name,
                lastName: doc.data().lastName || '',
                address: doc.data().address,
                phone: doc.data().phone,
                age: doc.data().age
            }));
        } catch (err) {
            error = (err as Error).message; // Type assertion to Error
        } finally {
            isLoading = false;
        }
    }

    
    onMount(() => {
        fetchPatients();
    });

    // Function to filter patients based on search term
    function filterPatients() {
        return patients.filter(patient => 
            patient.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            patient.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
            patient.phone.includes(searchTerm) ||
            patient.age.toString().includes(searchTerm)
        );
    }

    // Get patients for the current page
    function getPaginatedPatients() {
        const filteredPatients = filterPatients();
        const startIndex = (currentPage - 1) * patientsPerPage;
        const endIndex = startIndex + patientsPerPage;
        return filteredPatients.slice(startIndex, endIndex);
    }

    // Function to change the current page
    function goToPage(page: number) {
        if (page < 1 || page > totalPages()) return;
        currentPage = page;
    }

    // Function to calculate total pages
    function totalPages() {
        return Math.ceil(filterPatients().length / patientsPerPage);
    }

    // Function to edit a patient's details
    async function editPatient(id: string) {
        console.log(`Editing patient with ID: ${id}`);
        // Redirect or show an edit form here
    }

    // Function to delete a patient
    async function deletePatient(id: string) {
        try {
            await deleteDoc(doc(db, "patientProfiles", id));
            console.log(`Patient with ID: ${id} deleted successfully`);
            patients = patients.filter(patient => patient.id !== id);
        } catch (err) {
            console.error("Error deleting patient:", err);
        }
    }
</script>

<style>
    /* Global Dashboard Layout */
    :global(.dashboard) {
        display: flex;
        height: 100vh;
        overflow: hidden;
        font-family: 'Roboto', sans-serif;
    }

    :global(.content) {
        flex-grow: 1;
        overflow: auto;
        margin-left: -10rem;
        transition: margin-left 0.3s ease;
        padding: 20px;
       
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
        width: 100%;
    }

    :global(.search-input) {
        width: 100%;
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
        margin-top: 40px;
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
</style>

<div class="dashboard">
  
        {#if isLoading}
            <p>Loading patients...</p>
        {:else if error}
            <p style="color: red;">{error}</p>
        {:else}
            <div class="container">
                <!-- Header -->
                <div class="flex justify-between items-start mb-4">
                    <div class="flex items-center">
                        <img src="/images/logo(landing).png" alt="Sun with dental logo" class="w-24 h-18 mr-4" />
                        <div>
                            <h1 class="font-bold text-lg">AF DOMINIC</h1>
                            <p class="text-sm">DENTAL CLINIC</p>
                            <p class="text-sm">#46 12th Street, Corner Gordon Ave New Kalalake</p>
                            <p class="text-sm">afdominicdentalclinic@gmail.com</p>
                            <p class="text-sm">0932 984 9554</p>
                        </div>
                    </div>
                </div>

                <div class="content-header">
                    <h2>Patient List</h2>
                </div>

                <div class="search-bar">
                    <input
                        type="text"
                        class="search-input"
                        placeholder="Search"
                        bind:value={searchTerm}
                    />
                </div>

                <div class="table-container">
                    <Table shadow style="width: 100%; height: auto;">
                        <TableHead style="background-color: #08B8F3; color: white;">
                            <TableHeadCell>Full Name</TableHeadCell>
                            <TableHeadCell>Patient Address</TableHeadCell>
                            <TableHeadCell>Phone Number</TableHeadCell>
                            <TableHeadCell>Patient Age</TableHeadCell>
                        </TableHead>
                        <TableBody tableBodyClass="divide-y">
                            {#each getPaginatedPatients() as patient (patient.id)}
                            <TableBodyRow class="table-body-row">
                                <TableBodyCell>{patient.name} {patient.lastName}</TableBodyCell>
                                <TableBodyCell>{patient.address}</TableBodyCell>
                                <TableBodyCell>{patient.phone}</TableBodyCell>
                                <TableBodyCell>
                                    <div style="display: flex; justify-content: center; align-items: center; height: 100%;">{patient.age}</div>
                                </TableBodyCell>
                            </TableBodyRow>
                            {/each}
                        </TableBody>
                    </Table>

                    <div class="pagination">
                        <button on:click={() => goToPage(currentPage - 1)} disabled={currentPage === 1}>&laquo;</button>
                        {#each Array(totalPages()) as _, i}
                            <button on:click={() => goToPage(i + 1)} class={currentPage === i + 1 ? 'active' : ''}>{i + 1}</button>
                        {/each}
                        <button on:click={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages()}>&raquo;</button>
                    </div>
                </div>
            </div>
        {/if}
    </div>
