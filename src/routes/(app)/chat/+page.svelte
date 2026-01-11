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

<div class="min-h-screen" style="background-color: #eef3ff;">
  <div class="max-w-6xl mx-auto px-3 sm:p-4 md:p-8 py-6 sm:py-8 md:py-10">
    <div class="mb-6 sm:mb-8 md:mb-10">
      <div class="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-5">
        <div class="p-2.5 sm:p-3 rounded-xl" style="background: linear-gradient(135deg, #0b2d56 0%, #1a4d7a 100%);">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7 sm:h-8 sm:w-8 md:h-9 md:w-9 flex-shrink-0 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <div>
          <h1 class="text-3xl sm:text-4xl md:text-4xl font-bold" style="color: #0b2d56;">Member Chat</h1>
          <p class="text-gray-600 text-sm sm:text-base md:text-base pl-0 font-medium">Communicate directly with members and manage all conversations in a centralized interface.</p>
        </div>
      </div>
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

