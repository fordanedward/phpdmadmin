import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth"; 


const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDNGNakXXmB89nR5-JOYcMOMAEDCTS9WjE",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "integratedsystem-4040b.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "integratedsystem-4040b",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "integratedsystem-4040b.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "529987505201",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:529987505201:web:e36fd3e66c584da48f1910",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-4QT0RK92C0"
};


// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Firestore
const db = getFirestore(app);

// Initialize Authentication
const auth = getAuth(app); // Add authentication initialization

// Initialize Analytics only in the browser
let analytics;
if (typeof window !== "undefined") {
  analytics = getAnalytics(app);
}

// Export the Firestore database, Auth, and Firebase config
export { db, auth, firebaseConfig };
