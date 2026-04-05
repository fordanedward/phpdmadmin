<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import {
    collection,
    collectionGroup,
    limit,
    onSnapshot,
    orderBy,
    query,
    where,
    type Firestore,
    type Unsubscribe
  } from 'firebase/firestore';
  import { addPopupNotification } from '$lib/popupNotificationStore.js';

  interface CurrentUserLite {
    uid: string;
    role?: string;
  }

  export let db: Firestore | null = null;
  export let currentUser: CurrentUserLite | null = null;

  let activeKey: string | null = null;
  let teardownFns: Unsubscribe[] = [];

  // --- Notifications (inbound to current user) ---
  const seenNotificationIds = new Set<string>();
  let notificationsBootstrapped = false;

  // --- Chats (member → admin: watch messages subcollection for patient-sent messages) ---
  const seenMemberMessageIds = new Set<string>();
  let chatsBootstrapped = false;

  // --- Appointments (patient-side actions via modified events) ---
  interface ApptState { status: string; cancellationStatus: string }
  const seenAppointmentStates = new Map<string, ApptState>();
  let appointmentsBootstrapped = false;

  onMount(() => {
    syncListeners();
  });

  onDestroy(() => {
    teardown();
  });

  $: syncListeners();

  function syncListeners() {
    if (!db || !currentUser) {
      if (activeKey) teardown();
      return;
    }

    const nextKey = `${currentUser.uid}|${currentUser.role ?? 'unknown'}`;
    if (nextKey === activeKey) return;

    teardown();
    activeKey = nextKey;
    startNotificationListener();
    startChatListener();
    startAppointmentListenerIfNeeded();
  }

  function teardown() {
    teardownFns.forEach((fn) => fn());
    teardownFns = [];
    activeKey = null;
    notificationsBootstrapped = false;
    chatsBootstrapped = false;
    appointmentsBootstrapped = false;
    seenNotificationIds.clear();
    seenMemberMessageIds.clear();
    seenAppointmentStates.clear();
  }

  // Fires for notifications explicitly addressed to this user uid
  // (e.g. admin sends chat to a member → patient gets notified)
  // This handles any notification document where userId == currentUser.uid
  function startNotificationListener() {
    if (!db || !currentUser) return;

    const notificationsQuery = query(
      collection(db, 'notifications'),
      where('userId', '==', currentUser.uid),
      orderBy('createdAt', 'desc'),
      limit(25)
    );

    const unsubscribe = onSnapshot(
      notificationsQuery,
      (snapshot) => {
        if (!notificationsBootstrapped) {
          snapshot.docs.forEach((docSnap) => seenNotificationIds.add(docSnap.id));
          notificationsBootstrapped = true;
          return;
        }

        snapshot.docChanges().forEach((change) => {
          if (change.type !== 'added') return;
          const notificationId = change.doc.id;
          if (seenNotificationIds.has(notificationId)) return;

          seenNotificationIds.add(notificationId);
          const data = change.doc.data() as Record<string, any>;
          if (data.read) return;

          const senderName = data.metadata?.senderName || 'Someone';
          const preview = (data.message || '').toString().trim();
          const popupMessage = preview
            ? `${senderName} sent a message: ${preview}`
            : `${senderName} sent you a message.`;

          addPopupNotification(popupMessage, 'info', 5000);
        });
      },
      (error) => {
        console.warn('Failed to listen for notification popups:', error);
      }
    );

    teardownFns.push(unsubscribe);
  }

  // Fires when a member/patient sends a message.
  // We watch the messages subcollection across all member chats via collectionGroup,
  // and skip any message sent by staff roles so only inbound patient messages trigger a popup.
  function startChatListener() {
    if (!db || !currentUser) return;

    // Only staff receive member messages
    if (
      currentUser.role !== 'userSecretary' &&
      currentUser.role !== 'userDentist' &&
      currentUser.role !== 'userAdmin'
    ) return;

    // Roles that should NOT trigger a popup (staff-sent messages)
    const staffRoles = new Set(['admin', 'userSecretary', 'userDentist', 'userAdmin']);

    const memberMessagesQuery = query(
      collectionGroup(db, 'messages'),
      orderBy('timestamp', 'desc'),
      limit(40)
    );

    const unsubscribe = onSnapshot(
      memberMessagesQuery,
      (snapshot) => {
        if (!chatsBootstrapped) {
          // Baseline: record all existing message IDs so we don't re-fire them
          snapshot.docs.forEach((docSnap) => seenMemberMessageIds.add(docSnap.id));
          chatsBootstrapped = true;
          return;
        }

        snapshot.docChanges().forEach((change) => {
          if (change.type !== 'added') return;

          const msgId = change.doc.id;
          if (seenMemberMessageIds.has(msgId)) return;
          seenMemberMessageIds.add(msgId);

          const data = change.doc.data() as Record<string, any>;

          // Skip messages sent by staff — we only want patient-originated messages
          if (staffRoles.has(data.senderRole)) return;

          const senderName = data.senderName || 'A member';
          const preview = (data.message || data.text || '').toString().trim();
          addPopupNotification(
            preview ? `${senderName}: ${preview}` : `${senderName} sent you a message.`,
            'info',
            5000
          );
        });
      },
      (error) => {
        console.warn('Failed to listen for chat popups:', error);
      }
    );

    teardownFns.push(unsubscribe);
  }

  // Fires for:
  //   - New pending appointments (added)
  //   - Reschedule requests from patients (modified: status → 'Reschedule Requested')
  //   - Cancellation requests from patients (modified: cancellationStatus → 'requested')
  function startAppointmentListenerIfNeeded() {
    if (!db || !currentUser) return;

    if (
      currentUser.role !== 'userSecretary' &&
      currentUser.role !== 'userDentist'
    ) return;

    const appointmentsQuery = query(
      collection(db, 'appointments'),
      orderBy('createdAt', 'desc'),
      limit(60)
    );

    const unsubscribe = onSnapshot(
      appointmentsQuery,
      (snapshot) => {
        if (!appointmentsBootstrapped) {
          // Snapshot all existing appointments to baseline their states
          snapshot.docs.forEach((docSnap) => {
            const d = docSnap.data() as Record<string, any>;
            seenAppointmentStates.set(docSnap.id, {
              status: d.status ?? '',
              cancellationStatus: d.cancellationStatus ?? ''
            });
          });
          appointmentsBootstrapped = true;
          return;
        }

        snapshot.docChanges().forEach((change) => {
          const apptId = change.doc.id;
          const data = change.doc.data() as Record<string, any>;
          const newStatus: string = data.status ?? '';
          const newCancelStatus: string = data.cancellationStatus ?? '';
          const date = data.date ? ` on ${data.date}` : '';
          const time = data.time ? ` at ${data.time}` : '';

          if (change.type === 'added') {
            // New appointment created by patient
            if (!seenAppointmentStates.has(apptId)) {
              seenAppointmentStates.set(apptId, {
                status: newStatus,
                cancellationStatus: newCancelStatus
              });
              if (newStatus.toLowerCase() === 'pending') {
                addPopupNotification(
                  `New appointment request${date}${time}.`,
                  'info',
                  6000
                );
              }
            }
          } else if (change.type === 'modified') {
            const prev = seenAppointmentStates.get(apptId) ?? {
              status: '',
              cancellationStatus: ''
            };

            // Reschedule request from patient
            if (
              newStatus === 'Reschedule Requested' &&
              prev.status !== 'Reschedule Requested'
            ) {
              addPopupNotification(
                `A patient requested to reschedule their appointment${date}.`,
                'warning',
                6000
              );
            }

            // Cancellation request from patient
            if (
              newCancelStatus === 'requested' &&
              prev.cancellationStatus !== 'requested'
            ) {
              addPopupNotification(
                `A patient requested to cancel their appointment${date}.`,
                'warning',
                6000
              );
            }

            seenAppointmentStates.set(apptId, {
              status: newStatus,
              cancellationStatus: newCancelStatus
            });
          }
        });
      },
      (error) => {
        console.warn('Failed to listen for appointment popups:', error);
      }
    );

    teardownFns.push(unsubscribe);
  }
</script>
