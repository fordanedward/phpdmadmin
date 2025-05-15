<script lang="ts">
    import { onMount } from 'svelte';
    import { getFirestore, collection, getDocs, query, where, orderBy, doc, updateDoc } from 'firebase/firestore';
    import { initializeApp } from 'firebase/app';
    import { firebaseConfig } from '$lib/firebaseConfig.js';
    import Swal from 'sweetalert2';

    let db: ReturnType<typeof getFirestore>;
    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
    } catch (e: any) {
        db = getFirestore();
    }

    interface Payment {
        id: string;
        appointmentId: string;
        patientId: string;
        amount: number;
        status: 'pending' | 'paid' | 'cancelled';
        paymentMethod: string;
        paymentDate: string;
        createdAt: string;
        patientName?: string;
        service?: string;
        appointmentDate?: string;
    }

    let payments: Payment[] = [];
    let loading = true;
    let search = '';
    let selectedStatus = '';
    let sortBy = 'dateDesc';
    let currentView: 'all' | 'pending' | 'paid' = 'all';

    onMount(async () => {
        await fetchPayments();
    });

    async function fetchPayments() {
        try {
            const paymentsRef = collection(db, 'payments');
            const q = query(paymentsRef, orderBy('createdAt', 'desc'));
            const snapshot = await getDocs(q);
            
            payments = await Promise.all(snapshot.docs.map(async (doc) => {
                const data = doc.data();
                const payment: Payment = {
                    id: doc.id,
                    appointmentId: data.appointmentId || '',
                    patientId: data.patientId || '',
                    amount: data.amount || 0,
                    status: data.status || 'pending',
                    paymentMethod: data.paymentMethod || '',
                    paymentDate: data.paymentDate || data.createdAt,
                    createdAt: data.createdAt || new Date().toISOString()
                };

                // Fetch appointment details
                if (data.appointmentId) {
                    const appointmentDoc = await getDocs(query(
                        collection(db, 'appointments'),
                        where('__name__', '==', data.appointmentId)
                    ));
                    if (!appointmentDoc.empty) {
                        const appointmentData = appointmentDoc.docs[0].data();
                        payment.service = appointmentData.service;
                        payment.appointmentDate = appointmentData.date;
                    }
                }

                // Fetch patient details
                if (data.patientId) {
                    const patientDoc = await getDocs(query(
                        collection(db, 'patientProfiles'),
                        where('__name__', '==', data.patientId)
                    ));
                    if (!patientDoc.empty) {
                        const patientData = patientDoc.docs[0].data();
                        payment.patientName = `${patientData.name} ${patientData.lastName}`.trim();
                    }
                }

                return payment;
            }));

            loading = false;
        } catch (error) {
            console.error('Error fetching payments:', error);
            Swal.fire('Error', 'Failed to load payments', 'error');
            loading = false;
        }
    }

    async function updatePaymentStatus(paymentId: string, newStatus: 'paid' | 'cancelled') {
        try {
            const paymentRef = doc(db, 'payments', paymentId);
            await updateDoc(paymentRef, {
                status: newStatus,
                paymentDate: newStatus === 'paid' ? new Date().toISOString() : null
            });

            await fetchPayments();
            Swal.fire('Success', `Payment marked as ${newStatus}`, 'success');
        } catch (error) {
            console.error('Error updating payment:', error);
            Swal.fire('Error', 'Failed to update payment status', 'error');
        }
    }

    function filterPayments() {
        let filtered = payments;

        // Filter by search
        if (search) {
            const searchLower = search.toLowerCase();
            filtered = filtered.filter(p => 
                p.patientName?.toLowerCase().includes(searchLower) ||
                p.service?.toLowerCase().includes(searchLower) ||
                p.paymentMethod.toLowerCase().includes(searchLower)
            );
        }

        // Filter by status
        if (selectedStatus) {
            filtered = filtered.filter(p => p.status === selectedStatus);
        }

        // Filter by view
        if (currentView === 'pending') {
            filtered = filtered.filter(p => p.status === 'pending');
        } else if (currentView === 'paid') {
            filtered = filtered.filter(p => p.status === 'paid');
        }

        // Sort
        if (sortBy === 'dateDesc') {
            filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        } else if (sortBy === 'dateAsc') {
            filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        } else if (sortBy === 'amount') {
            filtered.sort((a, b) => b.amount - a.amount);
        }

        return filtered;
    }

    function formatDate(dateString: string) {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    function formatCurrency(amount: number) {
        return new Intl.NumberFormat('en-PH', {
            style: 'currency',
            currency: 'PHP'
        }).format(amount);
    }
</script>

<div class="bg-gradient-to-br from-blue-50 via-white to-gray-100 min-h-screen p-4 sm:p-6">
    <div class="max-w-7xl mx-auto">
        <h1 class="text-2xl sm:text-3xl font-extrabold mb-6 sm:mb-8 text-blue-800 tracking-tight flex items-center gap-2 sm:gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 sm:h-7 sm:w-7 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Payment Management
        </h1>

        <div class="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-gray-200 rounded-lg shadow-sm flex flex-wrap gap-3 sm:gap-4 mb-6 sm:mb-8 items-end px-3 sm:px-4 py-3">
            <div class="relative flex-1 min-w-[180px] sm:min-w-[200px]">
                <label for="search-input" class="block text-xs font-semibold text-gray-600 mb-1">Search</label>
                <input 
                    id="search-input" 
                    type="text" 
                    bind:value={search} 
                    placeholder="Search by patient name, service, or payment method" 
                    class="w-full border rounded px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500 shadow-sm" 
                />
            </div>
            <div class="min-w-[140px] sm:min-w-[150px]">
                <label for="status-select" class="block text-xs font-semibold text-gray-600 mb-1">Status</label>
                <select 
                    id="status-select" 
                    bind:value={selectedStatus} 
                    class="border rounded px-3 py-2 w-full text-sm focus:ring-blue-500 focus:border-blue-500 shadow-sm"
                >
                    <option value="">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                    <option value="cancelled">Cancelled</option>
                </select>
            </div>
            <div class="min-w-[140px] sm:min-w-[150px]">
                <label for="sort-select" class="block text-xs font-semibold text-gray-600 mb-1">Sort By</label>
                <select 
                    id="sort-select" 
                    bind:value={sortBy} 
                    class="border rounded px-3 py-2 w-full text-sm focus:ring-blue-500 focus:border-blue-500 shadow-sm"
                >
                    <option value="dateDesc">Date (Newest)</option>
                    <option value="dateAsc">Date (Oldest)</option>
                    <option value="amount">Amount</option>
                </select>
            </div>
        </div>

        <div class="mb-6 sm:mb-8 flex flex-wrap md:flex-nowrap gap-1 sm:gap-2 border-b border-gray-300">
            <button 
                class="py-2 px-2 text-sm sm:text-base sm:px-3 md:px-6 -mb-px border-b-2 font-semibold focus:outline-none transition-colors duration-150 flex-grow md:flex-grow-0 text-center whitespace-nowrap {currentView === 'all' ? 'border-blue-500 text-blue-700 bg-blue-50' : 'border-transparent text-gray-500 hover:text-blue-600 hover:bg-gray-100'}" 
                on:click={() => currentView = 'all'}>
                All Payments
            </button>
            <button 
                class="py-2 px-2 text-sm sm:text-base sm:px-3 md:px-6 -mb-px border-b-2 font-semibold focus:outline-none transition-colors duration-150 flex-grow md:flex-grow-0 text-center whitespace-nowrap {currentView === 'pending' ? 'border-blue-500 text-blue-700 bg-blue-50' : 'border-transparent text-gray-500 hover:text-blue-600 hover:bg-gray-100'}" 
                on:click={() => currentView = 'pending'}>
                Pending
            </button>
            <button 
                class="py-2 px-2 text-sm sm:text-base sm:px-3 md:px-6 -mb-px border-b-2 font-semibold focus:outline-none transition-colors duration-150 flex-grow md:flex-grow-0 text-center whitespace-nowrap {currentView === 'paid' ? 'border-blue-500 text-blue-700 bg-blue-50' : 'border-transparent text-gray-500 hover:text-blue-600 hover:bg-gray-100'}" 
                on:click={() => currentView = 'paid'}>
                Paid
            </button>
        </div>

        {#if loading}
            <div class="text-center py-10">
                <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
                <p class="mt-2 text-gray-600">Loading payments...</p>
            </div>
        {:else}
            {@const filteredPayments = filterPayments()}
            {#if filteredPayments.length > 0}
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                    {#each filteredPayments as payment (payment.id)}
                        <div class="bg-white rounded-lg shadow-lg hover:shadow-xl transition-all p-4 sm:p-5 border-l-4 {payment.status === 'paid' ? 'border-green-400' : payment.status === 'pending' ? 'border-yellow-400' : 'border-red-400'}">
                            <div class="flex justify-between items-start mb-3">
                                <div>
                                    <h3 class="font-semibold text-gray-800">{payment.patientName || 'Unknown Patient'}</h3>
                                    <p class="text-sm text-gray-600">{payment.service || 'No service specified'}</p>
                                </div>
                                <span class="px-2 py-1 text-xs font-medium rounded-full {payment.status === 'paid' ? 'bg-green-100 text-green-800' : payment.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}">
                                    {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                                </span>
                            </div>
                            
                            <div class="space-y-2 text-sm">
                                <p class="text-gray-600">
                                    <span class="font-medium">Amount:</span> {formatCurrency(payment.amount)}
                                </p>
                                <p class="text-gray-600">
                                    <span class="font-medium">Payment Method:</span> {payment.paymentMethod}
                                </p>
                                <p class="text-gray-600">
                                    <span class="font-medium">Appointment Date:</span> {payment.appointmentDate ? formatDate(payment.appointmentDate) : 'N/A'}
                                </p>
                                <p class="text-gray-600">
                                    <span class="font-medium">Payment Date:</span> {payment.paymentDate ? formatDate(payment.paymentDate) : 'Not paid yet'}
                                </p>
                            </div>

                            {#if payment.status === 'pending'}
                                <div class="flex gap-2 mt-4 justify-end">
                                    <button 
                                        class="bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 text-xs sm:text-sm rounded shadow-sm transition"
                                        on:click={() => updatePaymentStatus(payment.id, 'paid')}
                                    >
                                        Mark as Paid
                                    </button>
                                    <button 
                                        class="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 text-xs sm:text-sm rounded shadow-sm transition"
                                        on:click={() => updatePaymentStatus(payment.id, 'cancelled')}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
            {:else}
                <div class="text-center py-10 bg-white rounded-lg shadow">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p class="mt-2 text-gray-600">No payments found</p>
                </div>
            {/if}
        {/if}
    </div>
</div>

<style>
    .sticky { 
        position: -webkit-sticky; 
        position: sticky; 
        top: 0; 
    }
</style> 