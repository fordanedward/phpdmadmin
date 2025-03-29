// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { UserOptions } from 'jspdf-autotable';
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}
declare module 'jspdf' {
	interface jsPDF {
	  autoTable: (options: UserOptions) => jsPDF; // Method added by jspdf-autotable
	  lastAutoTable: { finalY: number };        // Property added by jspdf-autotable
	}
  }

export {};
