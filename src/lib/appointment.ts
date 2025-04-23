import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { firebaseConfig } from '$lib/firebaseConfig';

let db: ReturnType<typeof getFirestore>;

export function initializeFirebase() {
  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    console.log("Firebase Initialized");
  } catch (e: any) {
    if (!/already exists/.test(e.message)) {
      console.error('Firebase initialization error:', e);
    } else {
      db = getFirestore();
      console.log("Firebase Already Initialized, using existing instance.");
    }
  }
  return db;
}