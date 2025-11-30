<script lang="ts">
  import { onMount } from 'svelte';
  import { getFirestore } from 'firebase/firestore';
  import { initializeApp, getApps, getApp } from 'firebase/app';
  import { firebaseConfig } from '$lib/firebaseConfig';
  import { onAuthStateChanged, getAuth } from 'firebase/auth';
  import MemberChatsList from '$lib/components/MemberChatsList.svelte';

  let db: ReturnType<typeof getFirestore> | null = null;
  let currentUser: { uid: string; displayName?: string | null; email?: string | null; role?: string } | null = null;
  let loading = true;

  onMount(() => {
    try {
      const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
      db = getFirestore(app);
      const auth = getAuth(app);

      onAuthStateChanged(auth, (user) => {
        if (user) {
          currentUser = {
            uid: user.uid,
            displayName: user.displayName,
            email: user.email,
            role: 'userSecretary'
          };
        } else {
          currentUser = null;
        }
        loading = false;
      });
    } catch (e: any) {
      console.error('Failed to initialize Firebase:', e);
      loading = false;
    }
  });
</script>

<div class="bg-gradient-to-br from-blue-50 via-white to-gray-100 min-h-screen">
  <div class="max-w-6xl mx-auto p-4 sm:p-6">
    <div class="mb-6 sm:mb-8">
      <div class="flex items-center gap-2 sm:gap-3 mb-3">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 sm:h-9 sm:w-9" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="color: #0b2d56;">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <h1 class="text-3xl sm:text-4xl font-bold" style="color: #0b2d56;">Member Chat</h1>
      </div>
      <p class="text-gray-600 text-base sm:text-lg ml-11 sm:ml-12">Communicate directly with members and manage all conversations in a centralized interface.</p>
    </div>

    {#if loading}
      <div class="text-center py-10">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
        <p class="mt-2 text-gray-600">Loading...</p>
      </div>
    {:else if db && currentUser}
      <MemberChatsList {db} {currentUser} />
    {:else}
      <div class="bg-white rounded-lg shadow-lg p-6 text-center">
        <p class="text-gray-600">Please log in to view member chats.</p>
      </div>
    {/if}
  </div>
</div>

