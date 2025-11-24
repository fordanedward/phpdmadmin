<script lang="ts">
    import Sidebar from '../sidenav/+page.svelte'; 
    import { onMount } from 'svelte';
    import { firebaseConfig } from "$lib/firebaseConfig"; 
    import { initializeApp } from 'firebase/app';
    import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
    import { Table, TableBody, TableBodyCell, TableBodyRow, TableHead, TableHeadCell } from 'flowbite-svelte';

    // Initialize Firebase app and Firestore
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    let isCollapsed = false;
    let searchQuery = '';
    let selectedStatus = 'all';
    // Sidebar user props (optional for this page). If you have an auth/store, replace these with real values.
    let userRole: 'userDentist' | 'userAdmin' | 'userSecretary' | 'userPatient' | 'userSuper' | undefined = undefined;
    let userName: string | null | undefined = undefined;
    let userPhotoURL: string | null | undefined = undefined;
    let filteredAppointments: Appointment[] = [];
    let totalFiltered = 0;
    let currentPage = 1;
    const itemsPerPage = 10;

    function toggleSidebar() {
        isCollapsed = !isCollapsed;
    }

    async function logout(): Promise<void> {
        window.location.href = "/";
    }

    interface Appointment {
        appointmentId: string;
        patientData: {
            name: string;
            lastname: string;
            age: number;
        };
        date: string;
        time: string;
        service: string;
        cancellationStatus?: 'pending' | 'Approved' | 'Declined' | 'requested' | null;
        status: "pending" | "Declined" | "Missed" | "confirmed" | "Completed" | "cancelled" | "Accepted" | "cancellationRequested" | "";
        reason?: string; // Add reason field
    }

    let appointments: Appointment[] = [];

    async function fetchPatientsWithAppointments() {
        const appointmentRef = collection(db, "appointments");
        const appointmentSnapshot = await getDocs(query(appointmentRef));

        // Extract unique patient IDs from appointments
        const patientIds = appointmentSnapshot.docs.map(doc => doc.data().patientId);
        const uniquePatientIds = [...new Set(patientIds)];

        // Fetch patient profiles in bulk using `in` query
        const patientRef = collection(db, "patientProfiles");
        const patientBatches = [];
        const batchSize = 10; // Firestore `in` query limit

        for (let i = 0; i < uniquePatientIds.length; i += batchSize) {
            const batch = uniquePatientIds.slice(i, i + batchSize);
            patientBatches.push(query(patientRef, where("id", "in", batch)));
        }

        const patientSnapshots = await Promise.all(patientBatches.map(batch => getDocs(batch)));

        // Map patient data for quick lookup
        // Store by both doc.id and any explicit `id` field so lookups succeed regardless
        const patientsMap = new Map();
        patientSnapshots.forEach(snapshot => {
            snapshot.forEach(doc => {
                const data = doc.data();
                // Register by document id
                patientsMap.set(doc.id, data);
                // If the document contains an `id` field (some imports store it there), register by that too
                if (data && data.id) patientsMap.set(data.id.toString(), data);
            });
        });

        // Map appointments with patient data
        appointments = appointmentSnapshot.docs.map(docSnapshot => {
            const appointmentData = docSnapshot.data();
            // try lookup by exact key, or by stringified id
            const rawPatient = patientsMap.get(appointmentData.patientId) || patientsMap.get((appointmentData.patientId || '').toString()) || {};

            return {
                appointmentId: docSnapshot.id,
                ...appointmentData,
                patientData: {
                    // accept both `name` and common variants
                    name: rawPatient.name || rawPatient.firstName || '',
                    // accept both `lastName` and `lastname` variants
                    lastname: rawPatient.lastName || rawPatient.lastname || rawPatient.surname || '',
                    age: rawPatient.age || 0
                },
                date: appointmentData.date || '',
                time: appointmentData.time || '',
                service: appointmentData.service || '',
                status: appointmentData.status || 'pending',
                reason: appointmentData.reason || ''
            };
        });

        filterAppointments();
    }

    // Normalize strings for searching: remove diacritics, non-alphanumerics, collapse spaces, lowercase
    function normalizeForSearch(s: string | undefined | null): string {
        if (!s) return '';
        try {
            return s.toString()
                .normalize('NFD')
                .replace(/\p{Diacritic}/gu, '')
                .replace(/[^\p{L}\p{N}\s]/gu, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();
        } catch (e) {
            return s.toString()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9\s]/gi, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();
        }
    }

    function filterAppointments() {
        const q = (searchQuery || '').trim();
        const qNorm = normalizeForSearch(q);
        const selected = (selectedStatus || '').toString().toLowerCase();

        // build the full matching list first so we can compute totalFiltered for pagination
        const debug = typeof window !== 'undefined' && localStorage.getItem('apptFilterDebug') === '1';
        const matching = appointments.filter(app => {
            // normalize status and selected for tolerant matching
            const statusNormalized = normalizeForSearch((app.status || '').toString());
            const selectedNormalized = normalizeForSearch((selected || '').toString());

            let matchesStatus = false;
            if (selected === 'all' || selected === '') matchesStatus = true;
            else if (selectedNormalized === 'pending') matchesStatus = statusNormalized.includes('pending');
            else if (selectedNormalized === 'completed') matchesStatus = statusNormalized.includes('complete');
            else if (selectedNormalized === 'accepted') matchesStatus = statusNormalized.includes('accept');
            else if (selectedNormalized === 'missed') matchesStatus = statusNormalized.includes('miss');
            else if (selectedNormalized === 'declined') matchesStatus = statusNormalized.includes('declin') || statusNormalized.includes('decline');
            else if (selectedNormalized === 'cancellationrequested') matchesStatus = statusNormalized.includes('cancellation') || statusNormalized.includes('cancel');
            else matchesStatus = statusNormalized.includes(selectedNormalized) || selectedNormalized.includes(statusNormalized);

            if (!q) {
                if (debug) console.log('apptFilterDebug: allstatus - no search, statusOnly', { appointmentId: app.appointmentId, matchesStatus });
                return matchesStatus;
            }

            // normalize name, id and service for robust matching
            const rawName = `${app.patientData?.name || ''} ${app.patientData?.lastname || ''}`;
            const fullName = normalizeForSearch(rawName);
            const idNorm = normalizeForSearch((app.appointmentId || '').toString()).replace(/\s+/g, '');
            const service = normalizeForSearch((app.service || '')?.toString());

            // tokenized search: build token lists and detect qualifiers
            const rawTokens = (qNorm || q).split(/\s+/).filter(Boolean);

            const nameTokens: string[] = [];
            const serviceTokens: string[] = [];
            const idTokens: string[] = [];

            rawTokens.forEach(t => {
                if (t.startsWith('service:') || t.startsWith('s:')) serviceTokens.push(t.replace(/^(service:|s:)/, ''));
                else if (t.startsWith('id:') || /^#/.test(t)) idTokens.push(t.replace(/^id:|^#/, ''));
                else nameTokens.push(t);
            });

            const nameOnlySearchable = fullName;
            const serviceSearchable = service;
            const combinedSearchable = `${fullName} ${service} ${idNorm}`.replace(/\s+/g, ' ').trim();

            // Matching rules:
            // - If nameTokens exist => require all nameTokens in patient name
            // - Else if serviceTokens exist => require all serviceTokens in service
            // - Else if idTokens exist => require all idTokens in id
            // - Else (no qualifiers and single-word query) => default to name-only matching (less noisy)
            let matchesSearch = true;
            const matchedFields: Record<string, string[]> = { name: [], service: [], id: [] };

            if (nameTokens.length) {
                // If the user provided multiple name tokens, require the full normalized query
                // to appear as a phrase in the patient name to avoid accidental cross-field matches.
                if (nameTokens.length > 1) {
                    matchesSearch = nameOnlySearchable.includes(qNorm);
                    if (matchesSearch) matchedFields.name.push(qNorm);
                } else {
                    matchesSearch = nameTokens.every(tok => {
                        const m = nameOnlySearchable.includes(tok);
                        if (m) matchedFields.name.push(tok);
                        return m;
                    });
                }
            } else if (serviceTokens.length) {
                matchesSearch = serviceTokens.every(tok => {
                    const m = serviceSearchable.includes(tok);
                    if (m) matchedFields.service.push(tok);
                    return m;
                });
            } else if (idTokens.length) {
                matchesSearch = idTokens.every(tok => {
                    const m = idNorm.includes(tok.replace(/\s+/g, ''));
                    if (m) matchedFields.id.push(tok);
                    return m;
                });
            } else {
                // default: single-word, match name only to reduce false positives
                matchesSearch = rawTokens.every(tok => {
                    const m = nameOnlySearchable.includes(tok);
                    if (m) matchedFields.name.push(tok);
                    return m;
                });
            }

            if (debug) {
                console.log('apptFilterDebug: allstatus', {
                    appointmentId: app.appointmentId,
                    patientName: fullName,
                    service: service,
                    idNorm,
                    rawTokens,
                    nameTokens,
                    serviceTokens,
                    idTokens,
                    matchedFields,
                    matchesSearch,
                    matchesStatus,
                    appointment: app
                });
            }

            return matchesStatus && matchesSearch;
        });

        totalFiltered = matching.length;

        // ensure currentPage is within the valid range for the current filter
        const totalPages = Math.max(1, Math.ceil(totalFiltered / itemsPerPage));
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;

        filteredAppointments = matching.slice(startIndex, endIndex);
    }

    function viewDetails(appointmentId: string) {
        console.log('View details for appointment:', appointmentId);
    }

    function editAppointment(appointmentId: string) {
        console.log('Edit appointment:', appointmentId);
    }

    function deleteAppointment(appointmentId: string) {
        console.log('Delete appointment:', appointmentId);
    }
    
    function goToPage(page: number) {
        const totalPages = Math.max(1, Math.ceil(totalFiltered / itemsPerPage));
        if (page < 1) return;
        if (page > totalPages) page = totalPages;
        currentPage = page;
        filterAppointments();
    }

    onMount(async () => {
        try {
            currentPage = 1;
            await fetchPatientsWithAppointments();
        } catch (error) {
            console.error("Error fetching data:", error);
        }
    });
</script>

<div class="dashboard">
    <!-- Sidebar -->
    <Sidebar {isCollapsed} {toggleSidebar} {logout} {userRole} {userName} {userPhotoURL} />
    <div class="content" style="margin-left: {isCollapsed ? '-1rem' : '-2.4em'};">
        <div class="container">
            <!-- Header -->
            <div class="flex justify-between items-start mb-4">
                <div class="flex items-center">
                    <img src="/images/logo(landing).png" alt="Sun with dental logo" class="w-24 h-18 mr-4" />
                    <div>
                        <h1 class="font-bold text-lg">AFDomingo</h1>
                        <p class="text-sm">DENTAL CLINIC</p>
                        <p class="text-sm">#46 12th Street, Corner Gordon Ave New Kalalake</p>
                        <p class="text-sm">afdomingodentalclinic@gmail.com</p>
                        <p class="text-sm">0932 984 9554</p>
                    </div>
                </div>
            </div>
           <!-- Back Button -->
           <a href="/appointment" class="back-button flex items-center border p-1 rounded-md text-blue-500 hover:text-blue-700 mb-2 w-1/12">

            <!-- Back Icon (SVG) -->
            <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 12H5" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 19l-7-7 7-7" />
            </svg>
            Back
        </a>

            <!-- Search and Status Filter -->
            <div class="flex justify-between mb-4 search-bar">
                <input 
                    type="text" 
                    placeholder="Search by patient name..." 
                    bind:value={searchQuery} 
                    on:input={() => { currentPage = 1; filterAppointments(); }}
                    class="search-input p-2 border rounded-md" 
                />

                    <select 
                        bind:value={selectedStatus} 
                        on:change={() => { currentPage = 1; filterAppointments(); }} 
                        class="p-2 border rounded-md"
                    >
                        <option value="all">All Status</option>
                        <option value="pending">Pending</option>
                        <option value="declined">Declined</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="accepted">Accepted</option>
                        <option value="missed">Missed</option>
                        <option value="cancellationrequested">Cancellation Requested</option>
                    </select>
            </div>

            <!-- Table to display the appointments -->
            <div class="table-content">
                <Table aria-label="Appointments Table">
                    <TableHead>
                        <TableHeadCell>Patient Name</TableHeadCell>
                        <TableHeadCell>Age</TableHeadCell>
                        <TableHeadCell>Service</TableHeadCell>
                        <TableHeadCell>Date</TableHeadCell>
                        <TableHeadCell>Time</TableHeadCell>
                        <TableHeadCell>Status</TableHeadCell>
                        <TableHeadCell>Reason</TableHeadCell>
                    </TableHead>
                    <TableBody>
                        {#each filteredAppointments as { appointmentId, patientData, date, time, service, status, reason } (appointmentId)}
                            <TableBodyRow>
                                <TableBodyCell>{`${patientData.name} ${patientData.lastname}`}</TableBodyCell>
                                <TableBodyCell>{patientData.age}</TableBodyCell>
                                <TableBodyCell>{service}</TableBodyCell>
                                <TableBodyCell>{date}</TableBodyCell>
                                <TableBodyCell>{time}</TableBodyCell>
                                <TableBodyCell>
                                    {#if status === "cancelled"}
                                        <span class="text-red-500">Cancelled</span>
                                    {:else if status === "pending"}
                                        <span class="text-yellow-500">Pending</span>
                                    {:else if status === "Completed"}
                                        <span class="text-green-500">Completed</span>
                                    {:else if status === "Declined"}
                                        <span class="text-gray-500">Declined</span>
                                    {:else}
                                        <span>{status}</span>
                                    {/if}
                                </TableBodyCell>
                                <TableBodyCell>{reason || 'N/A'}</TableBodyCell> <!-- Correctly access reason -->
                            </TableBodyRow>
                        {/each}
                    </TableBody>
                    
                </Table>
            </div>

            <!-- Pagination Section -->
            <div class="pagination">
                <button on:click={() => goToPage(currentPage - 1)} disabled={currentPage === 1}>&lt;</button>
                <span>Page {currentPage}</span>
                <button on:click={() => goToPage(currentPage + 1)} disabled={currentPage >= Math.max(1, Math.ceil(totalFiltered / itemsPerPage))}>&gt;</button>
            </div>
            
</div>
          
    </div>
</div>


<style>
     <!--
     .edit-container {
        display: flex;
        align-items: center; /* Vertically aligns the icon and text */
        cursor: pointer; /* Makes both icon and text clickable */
    }
   
    .edit-text {
        margin-left: 8px; /* Adds space between the icon and the text */
        font-size: 1rem;  /* Optional: adjusts the font size */
    } -->
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
         /* Pagination */
    :global(.pagination) {
        display: flex;
        justify-content: flex-end;
        margin-top: 20px;
    }

    :global(.pagination button) {
        padding: 7px 10px;
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
    
</style>