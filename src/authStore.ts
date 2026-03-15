import { writable } from "svelte/store";
import type { User } from "firebase/auth"; // Type-only import
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "$lib/firebaseConfig.js";

export const currentUser = writable<User | null>(null);

onAuthStateChanged(auth, (user) => {
  currentUser.set(user);
});
