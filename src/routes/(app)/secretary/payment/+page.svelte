<script lang="ts">
  import { onMount } from 'svelte';
  import { getFirestore, collection, getDocs, query, where, orderBy, doc, updateDoc } from 'firebase/firestore';
  import { initializeApp } from 'firebase/app';
  import { firebaseConfig } from '$lib/firebaseConfig';
  import Swal from 'sweetalert2';

  let db: ReturnType<typeof getFirestore>;
  try {
      const app = initializeApp(firebaseConfig);
      db = getFirestore(app);
  } catch (e: any) {
      db = getFirestore();
  }

  interface PaymentItem {
    description: string;
    amount: number;
    quantity: number;
    type: 'service' | 'material' | 'other';
  }

  interface Payment {
    id: string;
    appointmentId: string;
    patientId: string;
    patientName: string;
    patientAge?: number;
    patientEmail?: string;
    date: string;
    time: string;
    service: string;
    items: PaymentItem[];
    subtotal: number;
    tax: number;
    total: number;
    paymentMethod: 'cash' | 'card' | 'gcash' | 'maya';
    paymentStatus: 'pending' | 'paid' | 'refunded' | 'cancelled';
    cancellationStatus?: 'requested' | 'Approved' | 'Declined';
    receiptNumber: string;
    notes?: string;
    createdAt: string;
    updatedAt: string;
  }

  let payments: Payment[] = [];
  let loading = true;
  let search = '';
  let selectedStatus = '';
  let selectedPaymentMethod = '';
  let sortBy = 'dateDesc';

  const PAYMENT_METHODS = [
    { value: 'cash', label: 'Cash' },
    { value: 'card', label: 'Credit/Debit Card' },
   
  ];

  const PAYMENT_STATUSES = [
    { value: 'pending', label: 'Pending', color: 'yellow' },
    { value: 'paid', label: 'Paid', color: 'green' },
    { value: 'refunded', label: 'Refunded', color: 'blue' },
    { value: 'cancelled', label: 'Cancelled', color: 'red' }
  ];

  onMount(async () => {
    await fetchPayments();
  });

  async function fetchPayments() {
    try {
      loading = true;
      const paymentsRef = collection(db, 'payments');
      const q = query(paymentsRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      
      payments = await Promise.all(snapshot.docs.map(async (doc) => {
        const data = doc.data();
        const payment: Payment = {
          id: doc.id,
          appointmentId: data.appointmentId || '',
          patientId: data.patientId || '',
          patientName: data.patientName || 'Unknown Patient',
          patientAge: data.patientAge,
          patientEmail: data.patientEmail,
          date: data.date || '',
          time: data.time || '',
          service: data.service || '',
          items: data.items || [],
          subtotal: data.subtotal || 0,
          tax: data.tax || 0,
          total: data.total || 0,
          paymentMethod: data.paymentMethod || 'cash',
          paymentStatus: data.paymentStatus || 'pending',
          cancellationStatus: data.cancellationStatus,
          receiptNumber: data.receiptNumber || `RCP-${doc.id.slice(-6).toUpperCase()}`,
          notes: data.notes,
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt || new Date().toISOString()
        };
        return payment;
      }));

      loading = false;
    } catch (error) {
      console.error('Error fetching payments:', error);
      Swal.fire('Error', 'Failed to load payments', 'error');
      loading = false;
    }
  }

  async function updatePaymentStatus(paymentId: string, newStatus: 'paid' | 'refunded' | 'cancelled') {
    try {
      const paymentRef = doc(db, 'payments', paymentId);
      await updateDoc(paymentRef, {
        paymentStatus: newStatus,
        updatedAt: new Date().toISOString()
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

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(p => 
        p.patientName.toLowerCase().includes(searchLower) ||
        p.receiptNumber.toLowerCase().includes(searchLower) ||
        p.service.toLowerCase().includes(searchLower)
      );
    }

    if (selectedStatus) {
      filtered = filtered.filter(p => p.paymentStatus === selectedStatus);
    }

    if (selectedPaymentMethod) {
      filtered = filtered.filter(p => p.paymentMethod === selectedPaymentMethod);
    }

    if (sortBy === 'dateDesc') {
      filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sortBy === 'dateAsc') {
      filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } else if (sortBy === 'amount') {
      filtered.sort((a, b) => b.total - a.total);
    }

    return filtered;
  }

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP'
    }).format(amount);
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
</script>

<div class="bg-gradient-to-br from-blue-50 via-white to-gray-100 min-h-screen">
  <div class="max-w-7xl mx-auto p-4 sm:p-6">
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
          placeholder="Search by patient name, receipt #, or service" 
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
          {#each PAYMENT_STATUSES as status}
            <option value={status.value}>{status.label}</option>
          {/each}
        </select>
      </div>
      <div class="min-w-[140px] sm:min-w-[150px]">
        <label for="method-select" class="block text-xs font-semibold text-gray-600 mb-1">Payment Method</label>
        <select 
          id="method-select" 
          bind:value={selectedPaymentMethod} 
          class="border rounded px-3 py-2 w-full text-sm focus:ring-blue-500 focus:border-blue-500 shadow-sm"
        >
          <option value="">All Methods</option>
          {#each PAYMENT_METHODS as method}
            <option value={method.value}>{method.label}</option>
          {/each}
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
            <div class="bg-white rounded-lg shadow-lg hover:shadow-xl transition-all p-4 sm:p-5 border-l-4 
              {payment.paymentStatus === 'paid' ? 'border-green-400' : 
               payment.paymentStatus === 'pending' ? 'border-yellow-400' : 
               payment.paymentStatus === 'refunded' ? 'border-blue-400' : 
               'border-red-400'}">
              
              <!-- Receipt Header -->
              <div class="flex justify-between items-start mb-3">
                <div>
                  <h3 class="font-semibold text-gray-800">{payment.patientName}</h3>
                  <p class="text-sm text-gray-600">Receipt #: {payment.receiptNumber}</p>
                </div>
                <span class="px-2 py-1 text-xs font-medium rounded-full 
                  {payment.paymentStatus === 'paid' ? 'bg-green-100 text-green-800' : 
                   payment.paymentStatus === 'pending' ? 'bg-yellow-100 text-yellow-800' : 
                   payment.paymentStatus === 'refunded' ? 'bg-blue-100 text-blue-800' : 
                   'bg-red-100 text-red-800'}">
                  {payment.paymentStatus.charAt(0).toUpperCase() + payment.paymentStatus.slice(1)}
                </span>
              </div>

              <!-- Payment Details -->
              <div class="space-y-2 text-sm">
                <div class="grid grid-cols-2 gap-2">
                  <p class="text-gray-600">
                    <span class="font-medium">Date:</span> {formatDate(payment.date)}
                  </p>
                  <p class="text-gray-600">
                    <span class="font-medium">Time:</span> {payment.time}
                  </p>
                </div>

                <!-- Items Breakdown -->
                <div class="mt-3 border-t pt-3">
                  <p class="font-medium text-gray-700 mb-2">Items:</p>
                  {#each payment.items as item}
                    <div class="flex justify-between text-sm mb-1">
                      <span class="text-gray-600">{item.description} × {item.quantity}</span>
                      <span class="text-gray-800">{formatCurrency(item.amount)}</span>
                    </div>
                  {/each}
                  <div class="border-t mt-2 pt-2">
                    <div class="flex justify-between text-sm">
                      <span class="text-gray-600">Subtotal:</span>
                      <span class="text-gray-800">{formatCurrency(payment.subtotal)}</span>
                    </div>
                    <div class="flex justify-between text-sm">
                      <span class="text-gray-600">Tax:</span>
                      <span class="text-gray-800">{formatCurrency(payment.tax)}</span>
                    </div>
                    <div class="flex justify-between font-medium mt-1">
                      <span class="text-gray-700">Total:</span>
                      <span class="text-gray-900">{formatCurrency(payment.total)}</span>
                    </div>
                  </div>
                </div>

                <!-- Payment Method -->
                <p class="text-gray-600 mt-3">
                  <span class="font-medium">Payment Method:</span> 
                  {PAYMENT_METHODS.find(m => m.value === payment.paymentMethod)?.label || payment.paymentMethod}
                </p>

                <!-- Notes -->
                {#if payment.notes}
                  <p class="text-gray-600 mt-2">
                    <span class="font-medium">Notes:</span> {payment.notes}
                  </p>
                {/if}

                <!-- Refund Status -->
                {#if payment.cancellationStatus}
                  <div class="mt-2">
                    <span class="font-medium">Refund Status:</span>
                    <span class="ml-1 px-2 py-1 rounded text-xs
                      {payment.cancellationStatus === 'requested' ? 'bg-yellow-100 text-yellow-800' : ''}
                      {payment.cancellationStatus === 'Approved' ? 'bg-green-100 text-green-800' : ''}
                      {payment.cancellationStatus === 'Declined' ? 'bg-red-100 text-red-800' : ''}
                    ">
                      {payment.cancellationStatus === 'requested' ? 'Refund Requested'
                        : payment.cancellationStatus === 'Approved' ? 'Refund Approved'
                        : payment.cancellationStatus === 'Declined' ? 'Refund Declined'
                        : payment.cancellationStatus}
                    </span>
                  </div>
                {/if}
              </div>

              <!-- Action Buttons -->
              {#if payment.paymentStatus === 'pending'}
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