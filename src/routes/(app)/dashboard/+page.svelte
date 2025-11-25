<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import { goto } from '$app/navigation';

	import {
		Timestamp,
		getFirestore,
		collection,
		getDocs,
		query,
		where,
		updateDoc,
		doc,
		getDoc,
		type DocumentData,
		type QuerySnapshot
	} from 'firebase/firestore';
	import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
	import { firebaseConfig } from '$lib/firebaseConfig';
	import * as XLSX from 'xlsx';
	import { jsPDF } from 'jspdf';
	import 'jspdf-autotable';
	import type { UserOptions } from 'jspdf-autotable';
	import Chart from 'chart.js/auto';

	const FIRESTORE_COLLECTIONS = {
		APPOINTMENTS: 'appointments',
		PATIENTS: 'patientProfiles',
		PRESCRIPTIONS: 'prescriptions'
	};

	const CURRENT_YEAR = new Date().getFullYear();
	const YEARS = Array.from({ length: 10 }, (_, i) => CURRENT_YEAR - i);
	const MONTH_NAMES = [
		'January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December'
	];
const WEEK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']; // For indexing
const REPORT_DATE_LABEL = 'Report Generated Date';
const REPORT_DATE_DESCRIPTION = 'Indicates when this export was created.';

	// --- Firebase Initialization ---
	let app: FirebaseApp;
	let db: ReturnType<typeof getFirestore>;

	try {
		app = getApps().length ? getApp() : initializeApp(firebaseConfig);
		db = getFirestore(app);
		console.log('Firebase initialized successfully.');
	} catch (error) {
		console.error('Firebase initialization failed:', error);

	}

type MemberStatus = 'active' | 'inactive';

interface Patient {
	id: string;
	displayId?: string;
	name: string;
	lastName: string;
	age?: number;
	birthday?: string;
	gender?: string;
	phone?: string;
	registrationDate?: string;
	status?: MemberStatus;
}

	interface Appointment {
		id: string;
		patientId: string;
		patientName?: string;
		date: string;
		time?: string;
		service?: string;
		subServices?: string[];
		status: 'pending' | 'completed' | 'missed' | string;
	}

	interface Medicine {
		medicine: string;
		dosage: string;
		instructions?: string;
	}

interface Prescription {
  id: string;
  appointmentId: string;
  patientId?: string;
  patientName?: string;
  prescriber?: string;
  medicines: Medicine[];
  date: string;
  dateVisited?: string; // Add this property
  createdAt?: Timestamp | Date;
}
	interface Stats {
		newAppointments: number;
		totalPatients: number;
		todaysPatients: number;
		todaysAppointments: number;
		monthlyAppointments: number;
		// New patient analytics
		newPatientsThisMonth: number;
		activePatients: number;
		archivedPatients: number;
	}

	interface DailyAppointmentCount {
		day: string;
		count: number;
	}

	let isCollapsed = false;
	let stats: Stats = {
		newAppointments: 0, totalPatients: 0, todaysPatients: 0, todaysAppointments: 0,
		monthlyAppointments: 0,
		newPatientsThisMonth: 0, activePatients: 0, archivedPatients: 0
	};

	let allAppointments: Appointment[] = [];
	let allPatients: Patient[] = [];
	let monthlyAppointmentsData: Appointment[] = [];

	let openTable: 'patients' | 'appointments' | 'monthlyAppointments' | null = null;
	let exportType: 'excel' | 'pdf' = 'excel';
	let selectedYear = CURRENT_YEAR;
	let selectedMonth = new Date().getMonth() + 1;

	// Chart instances
	let lineChartInstance: Chart | null = null;
	let appointmentStatusChartInstance: Chart | null = null;
	let genderDistributionChartInstance: Chart | null = null;
	let weeklyAppointmentsChartInstance: Chart | null = null;
	let completedMissedChartInstance: Chart | null = null;
	// New patient analytics charts
	let patientGrowthChartInstance: Chart | null = null;
	let patientAgeDistributionChartInstance: Chart | null = null;
	let patientRegistrationChartInstance: Chart | null = null;

	// Chart Data (populated by functions)
	let lineChartLabels: string[] = [];
	let lineChartNewAppointmentsData: number[] = [];
	let lineChartTotalPatientsData: number[] = [];
	let weeklyAppointmentCounts: DailyAppointmentCount[] = []; 

let patientMap = new Map<string, Patient>();
let selectedPatient: Patient | null = null;

let patientSearchTerm = '';
let patientStatusFilter: MemberStatus | 'all' = 'all';
type PatientSortOption = 'name-asc' | 'name-desc' | 'age-asc' | 'age-desc';
let patientSortOption: PatientSortOption = 'name-asc';
let filteredPatients: Patient[] = [];

type AppointmentStatusFilter = 'all' | 'pending' | 'completed' | 'accepted' | 'missed' | 'declined' | 'other';
type AppointmentSortOption = 'date-desc' | 'date-asc' | 'name-asc' | 'name-desc';
let appointmentSearchTerm = '';
let appointmentStatusFilter: AppointmentStatusFilter = 'all';
let appointmentSortOption: AppointmentSortOption = 'date-desc';
let filteredAppointments: Appointment[] = [];
let filteredMonthlyAppointments: Appointment[] = [];

	function viewPatientDetails(patientId: string) {
		selectedPatient = patientMap.get(patientId) || allPatients.find(p => p.id === patientId) || null;
	}

function getPatientInitials(patient?: Patient | null): string {
	if (!patient) return 'U';
	const first = patient.name?.charAt(0)?.toUpperCase() ?? '';
	const last = patient.lastName?.charAt(0)?.toUpperCase() ?? '';
	return (first + last || first || last || 'U').slice(0, 2);
}

async function updateMemberStatus(patientId: string, newStatus: MemberStatus): Promise<void> {
	if (!db) return;
	try {
		const patientRef = doc(db, FIRESTORE_COLLECTIONS.PATIENTS, patientId);
		await updateDoc(patientRef, { status: newStatus });
		allPatients = allPatients.map(patient => patient.id === patientId ? { ...patient, status: newStatus } : patient);
		const existingPatient = patientMap.get(patientId);
		if (existingPatient) {
			patientMap.set(patientId, { ...existingPatient, status: newStatus });
		}
		stats = {
			...stats,
			activePatients: allPatients.filter(p => (p.status ?? 'active') !== 'inactive').length,
			archivedPatients: allPatients.filter(p => (p.status ?? 'active') === 'inactive').length
		};
		if (selectedPatient?.id === patientId) {
			selectedPatient = { ...selectedPatient, status: newStatus };
		}
	} catch (error) {
		console.error('Failed to update member status:', error);
		alert('Unable to update member status. Please try again.');
	}
}

	// --- Utility Functions ---
	function getTodayString(): string {
		const today = new Date();
		const year = today.getFullYear();
		const month = String(today.getMonth() + 1).padStart(2, '0');
		const day = String(today.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	function getPatientName(patientId: string): string {
		const patient = patientMap.get(patientId);
		return patient ? `${patient.name} ${patient.lastName}`.trim() : 'Unknown Patient';
	}

function normalizePatientName(patient: Patient): string {
	return `${patient.name ?? ''} ${patient.lastName ?? ''}`.trim().toLowerCase();
}

function comparePatientsByName(a: Patient, b: Patient): number {
	return normalizePatientName(a).localeCompare(normalizePatientName(b));
}

function comparePatientsByAge(a: Patient, b: Patient, direction: 'asc' | 'desc'): number {
	const ageA = a.age ?? (direction === 'asc' ? Number.MAX_SAFE_INTEGER : Number.MIN_SAFE_INTEGER);
	const ageB = b.age ?? (direction === 'asc' ? Number.MAX_SAFE_INTEGER : Number.MIN_SAFE_INTEGER);
	return direction === 'asc' ? ageA - ageB : ageB - ageA;
}

function normalizeAppointmentName(appointment: Appointment): string {
	return (appointment.patientName || '').toLowerCase();
}

function compareAppointmentsByName(a: Appointment, b: Appointment): number {
	return normalizeAppointmentName(a).localeCompare(normalizeAppointmentName(b));
}

function compareAppointmentsByDate(a: Appointment, b: Appointment, direction: 'asc' | 'desc'): number {
	const dateA = Number.isNaN(Date.parse(a.date)) ? (direction === 'asc' ? Number.MAX_SAFE_INTEGER : Number.MIN_SAFE_INTEGER) : Date.parse(a.date);
	const dateB = Number.isNaN(Date.parse(b.date)) ? (direction === 'asc' ? Number.MAX_SAFE_INTEGER : Number.MIN_SAFE_INTEGER) : Date.parse(b.date);
	return direction === 'asc' ? dateA - dateB : dateB - dateA;
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
		// Fallback for environments without Unicode property escapes
		return s.toString()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-z0-9\s]/gi, ' ')
			.replace(/\s+/g, ' ')
			.trim()
			.toLowerCase();
	}
}

function matchesAppointmentStatus(appointment: Appointment, filter: AppointmentStatusFilter): boolean {
	if (filter === 'all') return true;
	const debug = typeof window !== 'undefined' && localStorage.getItem('apptFilterDebug') === '1';
	const statusRaw = (appointment.status || '').toString();
	const statusNormalized = normalizeForSearch(statusRaw);
	const f = normalizeForSearch((filter || '').toString());

	if (!statusNormalized) {
		const result = f === 'other';
		if (debug) console.log('apptFilterDebug: status empty', { id: appointment.id, statusRaw, filter, result });
		return result;
	}

	// Map filter values to possible status variations
	const tokensMap: Record<string, string[]> = {
		pending: ['pending', 'request'],
		completed: ['complete', 'completed', 'done'],
		accepted: ['accept', 'accepted'],
		missed: ['miss', 'missed', 'no-show', 'noshow'],
		declined: ['declin', 'declined', 'decline'],
		cancel: ['cancel', 'cancellation', 'cancelled'],
		reschedule: ['reschedul', 'rescheduled', 'reschedule']
	};

	// Get the tokens for the selected filter
	const filterTokens = tokensMap[f] || [];
	
	// Check if the appointment status matches any of the tokens for this filter
	// Status should contain the token (e.g., "declined" contains "decline", "declin")
	const match = filterTokens.length > 0 && filterTokens.some(tok => {
		return statusNormalized.includes(tok);
	});
	
	if (debug) console.log('apptFilterDebug: statusMatch', { 
		id: appointment.id, 
		statusRaw, 
		statusNormalized,
		filter, 
		f,
		filterTokens,
		match 
	});
	
	// If no match found and filter is 'other', check if status doesn't match any known status
	if (!match && f === 'other') {
		const allKnownTokens = Object.values(tokensMap).flat();
		const isOther = !allKnownTokens.some(tok => statusNormalized.includes(tok));
		if (debug) console.log('apptFilterDebug: status other check', { id: appointment.id, statusRaw, isOther });
		return isOther;
	}
	
	return match;
}

function getFilteredAppointmentList(source: Appointment[]): Appointment[] {
	let list = [...source];

	if (appointmentSearchTerm.trim()) {
		const normalizedTerm = normalizeForSearch(appointmentSearchTerm.trim());
		const tokens = normalizedTerm.split(/\s+/).filter(Boolean);

		list = list.filter((appointment) => {
			const patientName = normalizeForSearch(appointment.patientName || '');
			const service = normalizeForSearch(appointment.service || '');
			const subservice = normalizeForSearch((appointment.subServices?.join(' ') ?? ''));
			const id = normalizeForSearch((appointment.id || '').toString());

			// build token lists and detect qualifiers
			const rawTokens = tokens;
			const nameTokens = [] as string[];
			const serviceTokens = [] as string[];
			const idTokens = [] as string[];
			rawTokens.forEach(t => {
				if (t.startsWith('service:') || t.startsWith('s:')) serviceTokens.push(t.replace(/^(service:|s:)/, ''));
				else if (t.startsWith('id:') || /^#/.test(t)) idTokens.push(t.replace(/^id:|^#/, ''));
				else nameTokens.push(t);
			});

			const nameOnlySearchable = patientName;
			const serviceSearchable = service + ' ' + subservice;
			const combinedSearchable = `${patientName} ${service} ${subservice} ${id}`.replace(/\s+/g, ' ').trim();

			let tokensMatch = true;
			const matchedFields: Record<string, string[]> = { name: [], service: [], id: [] };

			if (nameTokens.length) {
				// For multiple name tokens, require ALL tokens to be present in the patient name
				// This ensures "juan dela" only matches patients with both "juan" and "dela" in their name
				tokensMatch = nameTokens.every(tok => {
					const m = nameOnlySearchable.includes(tok);
					if (m) matchedFields.name.push(tok);
					return m;
				});
			} else if (serviceTokens.length) {
				tokensMatch = serviceTokens.every(tok => {
					const m = serviceSearchable.includes(tok);
					if (m) matchedFields.service.push(tok);
					return m;
				});
			} else if (idTokens.length) {
				tokensMatch = idTokens.every(tok => {
					const m = id.replace(/\s+/g, '').includes(tok.replace(/\s+/g, ''));
					if (m) matchedFields.id.push(tok);
					return m;
				});
			} else {
				// default: match name only to avoid noisy results from services/ids
				tokensMatch = rawTokens.every(tok => {
					const m = nameOnlySearchable.includes(tok);
					if (m) matchedFields.name.push(tok);
					return m;
				});
			}

			// debug logging when enabled via localStorage('apptFilterDebug' === '1')
			const debug = typeof window !== 'undefined' && localStorage.getItem('apptFilterDebug') === '1';
			if (debug) {
				console.log('apptFilterDebug: dashboard', {
					id: appointment.id,
					patientName: appointment.patientName,
					rawTokens,
					nameTokens,
					serviceTokens,
					idTokens,
					matchedFields,
					tokensMatch,
					appointment
				});
			}

			return tokensMatch;
		});
	}

	// apply status filter after search
	const debug = typeof window !== 'undefined' && localStorage.getItem('apptFilterDebug') === '1';
	list = list.filter((appointment) => {
		const statusMatch = matchesAppointmentStatus(appointment, appointmentStatusFilter);
		if (debug) {
			console.log('apptFilterDebug: dashboard status', { id: appointment.id, status: appointment.status, statusMatch });
		}
		return statusMatch;
	});

	switch (appointmentSortOption) {
		case 'date-asc':
			list.sort((a, b) => compareAppointmentsByDate(a, b, 'asc'));
			break;
		case 'name-asc':
			list.sort(compareAppointmentsByName);
			break;
		case 'name-desc':
			list.sort((a, b) => compareAppointmentsByName(b, a));
			break;
		default:
			list.sort((a, b) => compareAppointmentsByDate(a, b, 'desc'));
			break;
	}

	return list;
}

$: filteredPatients = (() => {
	let patients = [...allPatients];

	if (patientSearchTerm.trim()) {
		const search = patientSearchTerm.trim().toLowerCase();
		patients = patients.filter((patient) => {
			const fullName = normalizePatientName(patient);
			const displayId = patient.displayId?.toLowerCase() ?? '';
			return fullName.includes(search) || displayId.includes(search);
		});
	}

	if (patientStatusFilter !== 'all') {
		patients = patients.filter((patient) => (patient.status ?? 'active') === patientStatusFilter);
	}

	switch (patientSortOption) {
		case 'name-desc':
			patients.sort((a, b) => comparePatientsByName(b, a));
			break;
		case 'age-asc':
			patients.sort((a, b) => comparePatientsByAge(a, b, 'asc'));
			break;
		case 'age-desc':
			patients.sort((a, b) => comparePatientsByAge(a, b, 'desc'));
			break;
		default:
			patients.sort(comparePatientsByName);
			break;
	}

	return patients;
})();

$: filteredAppointments = getFilteredAppointmentList(allAppointments);
$: filteredMonthlyAppointments = getFilteredAppointmentList(monthlyAppointmentsData);

	// --- UI Event Handlers ---
	function toggleSidebar(): void {
		isCollapsed = !isCollapsed;
	}

	function logout(): void {
		goto('/');
	}

	function handleOpenTable(table: typeof openTable): void {
		openTable = openTable === table ? null : table;
	}

	// --- Data Fetching Functions ---
async function fetchAllPatients(): Promise<Patient[]> {
    console.log("Fetching all patients...");
    try {
        const users = await fetchAllUsers(); // Fetch users first
        const snapshot = await getDocs(collection(db, FIRESTORE_COLLECTIONS.PATIENTS));
        const patients = snapshot.docs.map(doc => {
            const data = doc.data();
            console.log("Fetched patient data:", data);
            console.log("Raw registration date:", users[doc.id]?.registrationDate); // Access registration date from users

				return {
					id: doc.id,
					// Prefer the member-side custom ID for display when available
					displayId: users[doc.id]?.customUserId || doc.id,
					name: data.name,
					lastName: data.lastName,
					age: data.age,
					birthday: data.birthday,
					gender: data.gender,
					phone: data.phone,
					registrationDate: users[doc.id]?.registrationDate ? 
						new Date(users[doc.id].registrationDate).toISOString().split('T')[0] : 
						'N/A', // Use registration date from users
					status: (data.status as MemberStatus) ?? 'active'
				} as Patient;
        });
        patientMap.clear();
        patients.forEach(p => patientMap.set(p.id, p));
        console.log(`Fetched ${patients.length} patients.`);
        return patients;
    } catch (error) {
        console.error("Error fetching patients:", error);
        return [];
    }
}


async function fetchAllUsers(): Promise<{ [key: string]: any }> {
    console.log("Fetching all users...");
    try {
        const snapshot = await getDocs(collection(db, 'users'));
        const users = snapshot.docs.reduce((acc, doc) => {
            acc[doc.id] = doc.data(); // Store user data by user ID
            return acc;
        }, {} as { [key: string]: any });
        console.log(`Fetched ${Object.keys(users).length} users.`);
        return users;
    } catch (error) {
        console.error("Error fetching users:", error);
        return {};
    }
}


	async function fetchAllAppointments(): Promise<Appointment[]> {
		console.log("Fetching all appointments...");
		 // Ensure patients are fetched first for mapping names
		 if (patientMap.size === 0) {
			 console.log("Patient map empty, fetching patients first for appointment name mapping.");
			 await fetchAllPatients();
		 }
		try {
			const snapshot = await getDocs(collection(db, FIRESTORE_COLLECTIONS.APPOINTMENTS));
			const appointments = snapshot.docs.map(doc => {
				const data = doc.data();
				return {
					id: doc.id,
					...data,
					patientName: getPatientName(data.patientId),
				} as Appointment;
			});
			console.log(`Fetched ${appointments.length} appointments.`);
			return appointments;
		} catch (error) {
			console.error("Error fetching appointments:", error);
			return [];
		}
	}

// Prescriptions data and UI removed — dashboard focuses on appointments and patients
	async function fetchDashboardStats(): Promise<Stats> {
		console.log("Fetching dashboard stats...");
		const today = getTodayString();
		const currentMonth = new Date().getMonth() + 1;
		const currentYear = new Date().getFullYear();
		const statsResult: Stats = {
			newAppointments: 0,
			totalPatients: 0,
			todaysPatients: 0,
			todaysAppointments: 0,
			monthlyAppointments: 0,
			newPatientsThisMonth: 0,
			activePatients: 0,
			archivedPatients: 0
		};
 		try {
 			 // Ensure data is available, fetch if not
 			 if (!allPatients.length) allPatients = await fetchAllPatients();
 			 if (!allAppointments.length) allAppointments = await fetchAllAppointments();

 			statsResult.totalPatients = allPatients.length;
 			statsResult.newAppointments = allAppointments.length;

 			statsResult.todaysPatients = allPatients.filter(p => p.registrationDate === today).length;
 			statsResult.todaysAppointments = allAppointments.filter(a => a.date === today).length;

			statsResult.monthlyAppointments = allAppointments.filter(a => {
				try {
					const appDate = new Date(a.date);
					return appDate.getFullYear() === currentYear && appDate.getMonth() + 1 === currentMonth;
				} catch (e) { return false; }
			}).length;

			// Calculate new patient analytics
			statsResult.newPatientsThisMonth = allPatients.filter(p => {
				try {
					if (p.registrationDate && p.registrationDate !== 'N/A') {
						const regDate = new Date(p.registrationDate);
						return regDate.getFullYear() === currentYear && regDate.getMonth() + 1 === currentMonth;
					}
					return false;
				} catch (e) { return false; }
			}).length;

			// Age-group analytics removed — dashboard focuses on appointments and patients

			// Note: activePatients and archivedPatients would need to be calculated from patientProfiles collection
			// For now, we'll set them to 0 and they can be updated when we fetch from patientProfiles
			statsResult.activePatients = allPatients.filter(p => (p.status ?? 'active') !== 'inactive').length;
			statsResult.archivedPatients = allPatients.filter(p => (p.status ?? 'active') === 'inactive').length;

			console.log("Dashboard stats fetched:", statsResult);
			return statsResult;
		} catch (error) {
			console.error("Error fetching dashboard stats:", error);
			return statsResult;
		}
	}

	 async function fetchMonthlyAppointmentsTableData(year: number, month: number): Promise<Appointment[]> {
		console.log(`Fetching appointments for table: ${year}-${month}`);
		 if (!allAppointments.length) allAppointments = await fetchAllAppointments();
		 return allAppointments.filter(a => {
			try {
				const appDate = new Date(a.date);
				return appDate.getFullYear() === year && appDate.getMonth() + 1 === month;
			} catch (e) {
				console.warn(`Invalid date format for appointment ${a.id}: ${a.date}`);
				return false;
			}
		});
	}

	// --- Chart Data Preparation and Rendering ---
	async function updateAndRenderLineChart(year: number, month: number): Promise<void> {
		console.log(`Updating line chart data for ${year}-${month}`);
		const canvas = document.getElementById('lineChart') as HTMLCanvasElement | null;
		if (!canvas) {
			console.error('Line chart canvas not found.');
			return;
		}

		 if (!allAppointments.length) allAppointments = await fetchAllAppointments();
		 if (!allPatients.length) allPatients = await fetchAllPatients();

		// Filter data for the selected month and year
		const appointmentsInMonth = allAppointments.filter(a => { try { const d = new Date(a.date); return d.getFullYear() === year && d.getMonth() + 1 === month; } catch(e) { return false;} });
		const patientsRegisteredInMonth = allPatients.filter(p => { try { const d = new Date(p.registrationDate || ''); return d.getFullYear() === year && d.getMonth() + 1 === month; } catch(e) { return false;} });

		// Count occurrences by date
		const appointmentCountByDate: Record<string, number> = {};
		appointmentsInMonth.forEach(a => { const dateString = a.date; appointmentCountByDate[dateString] = (appointmentCountByDate[dateString] || 0) + 1; });
		const patientCountByDate: Record<string, number> = {};
		patientsRegisteredInMonth.forEach(p => { if (p.registrationDate) { const dateString = p.registrationDate; patientCountByDate[dateString] = (patientCountByDate[dateString] || 0) + 1; } });

		// Prepare chart data
		const allDatesInMonth = [...new Set([...Object.keys(appointmentCountByDate), ...Object.keys(patientCountByDate)])].sort();
		lineChartLabels = allDatesInMonth;
		lineChartNewAppointmentsData = allDatesInMonth.map(date => appointmentCountByDate[date] || 0);
		let cumulativePatients = 0;
		lineChartTotalPatientsData = allDatesInMonth.map(date => { cumulativePatients += patientCountByDate[date] || 0; return cumulativePatients; });

		const lineChartData = {
			labels: lineChartLabels,
			datasets: [
				{ label: 'New Appointments', data: lineChartNewAppointmentsData, borderColor: '#4caf50', backgroundColor: 'rgba(76, 175, 80, 0.2)', tension: 0.3, fill: true },
{
  label: 'Cumulative Patients (Registered This Month)',
  data: lineChartTotalPatientsData,
  borderColor: '#2196f3', // blue
  backgroundColor: 'rgba(33, 150, 243, 0.2)', // light blue background
  tension: 0.3,
  fill: true
}
			]
		};

		// Render chart
		if (lineChartInstance) lineChartInstance.destroy();
		lineChartInstance = new Chart(canvas, {
			 type: 'line',
			 data: lineChartData,
			 options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { x: { title: { display: true, text: 'Date' } }, y: { title: { display: true, text: 'Count' }, beginAtZero: true } } }
		});
		console.log('Line chart updated.');
	}

	async function updateAndRenderAppointmentStatusPieChart(): Promise<void> {
    console.log('Updating appointment status pie chart...');
    const canvas = document.getElementById('appointmentStatusPieChart') as HTMLCanvasElement | null;
    if (!canvas) {
        console.error('Appointment status pie chart canvas not found.');
        return;
    }

    // Fetch appointments if the global array is empty
    if (!allAppointments || !allAppointments.length) { // Added a check for null/undefined allAppointments
        allAppointments = await fetchAllAppointments();
        if (!allAppointments) { // Handle case where fetch might fail or return null/undefined
            console.error("Failed to fetch appointments.");
            return;
        }
    }

    // Initialize status counts, including 'accepted' and 'declined'
    const statusCounts = {
        completed: 0,
        pending: 0,
        accepted: 0, // Added accepted counter
        missed: 0,
        declined: 0,
        other: 0
    };

    // Iterate through appointments and count statuses
    allAppointments.forEach(a => {
        // Ensure 'a' and 'a.status' exist before accessing toLowerCase
        const status = (a && a.status) ? a.status.toLowerCase() : ''; // Safer handling

        if (status === 'completed') {
            statusCounts.completed++;
        } else if (status === 'pending') {
            statusCounts.pending++;
        } else if (status === 'accepted') { // Specifically count 'accepted'
            statusCounts.accepted++;
        } else if (status === 'missed') {
            statusCounts.missed++;
        } else if (status === 'decline') {
            statusCounts.declined++;
        } else if (status !== '') { // Only count non-empty statuses as 'other'
            statusCounts.other++;
        }
        // Appointments with empty or null status are implicitly ignored now,
        // unless you want to count them under 'other' or a specific category.
    });

    // Prepare data for the pie chart
    const pieData = {
        // Added 'Accepted' label
        labels: ['Completed', 'Pending', 'Accepted', 'Missed', 'Declined', 'Other'],
        datasets: [{
            data: [
                statusCounts.completed,
                statusCounts.pending,
                statusCounts.accepted, // Added accepted count data
                statusCounts.missed,
                statusCounts.declined,
                statusCounts.other
            ],
            backgroundColor: [
                '#4caf50', // Completed (Green)
                '#ff9800', // Pending (Orange)
                '#8bc34a', // Accepted (Light Green - added new color)
                '#f44336', // Missed (Red)
                '#2196f3', // Declined (Blue)
                '#9e9e9e'  // Other (Grey)
            ]
        }]
    };

    // Destroy the previous chart instance if it exists
    if (appointmentStatusChartInstance) {
        appointmentStatusChartInstance.destroy();
    }

    // Create and render the new pie chart
    appointmentStatusChartInstance = new Chart(canvas, {
        type: 'pie',
        data: pieData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });

    console.log('Appointment status pie chart updated.');
}

	async function updateAndRenderGenderDistributionChart(): Promise<void> {
		console.log('Updating gender distribution chart...');
		const canvas = document.getElementById('genderDistributionDoughnutChart') as HTMLCanvasElement | null;
		if (!canvas) { console.error('Gender distribution doughnut chart canvas not found.'); return; }

		if (!allPatients.length) allPatients = await fetchAllPatients();

		const genderCounts = { male: 0, female: 0, other: 0 };
		allPatients.forEach(p => {
			const gender = (p.gender || '').toLowerCase();
			if (gender === 'male') genderCounts.male++;
			else if (gender === 'female') genderCounts.female++;
			else genderCounts.other++;
		});

		const doughnutData = {
			labels: ['Male', 'Female', 'Other/Unspecified'],
			datasets: [{ data: [genderCounts.male, genderCounts.female, genderCounts.other], backgroundColor: ['#2196f3', '#e91e63', '#9e9e9e'] }]
		};

		if (genderDistributionChartInstance) genderDistributionChartInstance.destroy();
		genderDistributionChartInstance = new Chart(canvas, { type: 'doughnut', data: doughnutData, options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom' } } } });
		console.log('Gender distribution doughnut chart updated.');
	}

	async function updateAndRenderWeeklyAppointmentsChart(): Promise<void> {
		console.log('Updating weekly appointments bar chart...');
		const canvas = document.getElementById('weeklyAppointmentsBarChart') as HTMLCanvasElement | null;
		if (!canvas) { console.error('Weekly appointments bar chart canvas not found.'); return; }

		if (!allAppointments.length) allAppointments = await fetchAllAppointments();

		const today = new Date();
		const currentDayOfWeek = today.getDay();
		const firstDayOfWeek = new Date(today);
		firstDayOfWeek.setDate(today.getDate() - (currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1));
		firstDayOfWeek.setHours(0, 0, 0, 0);
		const lastDayOfWeek = new Date(firstDayOfWeek);
		lastDayOfWeek.setDate(firstDayOfWeek.getDate() + 6);
		lastDayOfWeek.setHours(23, 59, 59, 999);

		const counts = Array(7).fill(0);
		allAppointments.forEach(a => { try { const appDate = new Date(a.date); if (appDate >= firstDayOfWeek && appDate <= lastDayOfWeek) { counts[appDate.getDay()]++; } } catch (e) {} });


		// Build labels that include the weekday short name and specific date (MM/DD)
		const weekdayShort = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
		const labelsWithDates: string[] = [];
		for (let i = 0; i < 7; i++) {
			const d = new Date(firstDayOfWeek);
			d.setDate(firstDayOfWeek.getDate() + i);
			const mm = String(d.getMonth() + 1).padStart(2, '0');
			const dd = String(d.getDate()).padStart(2, '0');
			labelsWithDates.push(`${weekdayShort[i]} ${mm}/${dd}`);
		}
		const displayLabels = labelsWithDates;
		const displayData = [counts[1], counts[2], counts[3], counts[4], counts[5], counts[6], counts[0]];

		const barData = { labels: displayLabels, datasets: [{ label: 'Appointments This Week', data: displayData, backgroundColor: '#4caf50' }] };

		if (weeklyAppointmentsChartInstance) weeklyAppointmentsChartInstance.destroy();
		weeklyAppointmentsChartInstance = new Chart(canvas, { type: 'bar', data: barData, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } } });
		console.log('Weekly appointments bar chart updated.');
	}

	async function updateAndRenderCompletedMissedChart(): Promise<void> {
		console.log('Updating completed/missed line chart...');
		const canvas = document.getElementById('completedMissedLineChart') as HTMLCanvasElement | null;
		if (!canvas) { console.error('Completed/Missed line chart canvas not found.'); return; }

		if (!allAppointments.length) allAppointments = await fetchAllAppointments();

		const completedCounts = Array(12).fill(0);
		const missedCounts = Array(12).fill(0);
		const currentYear = new Date().getFullYear();

		allAppointments.forEach(a => { try { const appDate = new Date(a.date); if (appDate.getFullYear() === currentYear) { const monthIndex = appDate.getMonth(); const status = (a.status || '').toLowerCase(); if (status === 'completed') completedCounts[monthIndex]++; else if (status === 'missed') missedCounts[monthIndex]++; } } catch (e) {} });

		const lineData = {
			labels: MONTH_NAMES,
			datasets: [
				{ label: 'Completed', data: completedCounts, borderColor: '#4caf50', backgroundColor: 'rgba(76, 175, 80, 0.2)', tension: 0.3, fill: true },
				{ label: 'Missed', data: missedCounts, borderColor: '#f44336', backgroundColor: 'rgba(244, 67, 54, 0.2)', tension: 0.3, fill: true }
			]
		};

		if (completedMissedChartInstance) completedMissedChartInstance.destroy();
		completedMissedChartInstance = new Chart(canvas, {
			type: 'line', data: lineData, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { y: { title: { display: true, text: 'Number of Appointments' }, beginAtZero: true } } }
		});
		console.log('Completed/Missed line chart updated.');
	}

	// --- Patient Analytics Functions ---
	async function updateAndRenderPatientGrowthChart(): Promise<void> {
		console.log('Updating patient growth chart...');
		const canvas = document.getElementById('patientGrowthChart') as HTMLCanvasElement | null;
		if (!canvas) {
			console.error('Patient growth chart canvas not found.');
			return;
		}

		if (!allPatients.length) allPatients = await fetchAllPatients();

		// Group patients by registration month
		const patientsByMonth: Record<string, number> = {};
		const cumulativePatients: Record<string, number> = {};
		let cumulative = 0;

		allPatients.forEach(patient => {
			if (patient.registrationDate && patient.registrationDate !== 'N/A') {
				try {
					const date = new Date(patient.registrationDate);
					const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
					patientsByMonth[monthKey] = (patientsByMonth[monthKey] || 0) + 1;
				} catch (e) {
					console.warn(`Invalid registration date: ${patient.registrationDate}`);
				}
			}
		});

		// Calculate cumulative patients
		const sortedMonths = Object.keys(patientsByMonth).sort();
		sortedMonths.forEach(month => {
			cumulative += patientsByMonth[month];
			cumulativePatients[month] = cumulative;
		});

		const chartData = {
			labels: sortedMonths,
			datasets: [
				{
					label: 'New Patients',
					data: sortedMonths.map(month => patientsByMonth[month]),
					borderColor: '#10b981',
					backgroundColor: 'rgba(16, 185, 129, 0.2)',
					tension: 0.3,
					fill: true
				},
				{
					label: 'Total Patients',
					data: sortedMonths.map(month => cumulativePatients[month]),
					borderColor: '#3b82f6',
					backgroundColor: 'rgba(59, 130, 246, 0.2)',
					tension: 0.3,
					fill: true
				}
			]
		};

		if (patientGrowthChartInstance) patientGrowthChartInstance.destroy();
		patientGrowthChartInstance = new Chart(canvas, {
			type: 'line',
			data: chartData,
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: { position: 'top' },
					title: {
						display: true,
						text: 'Patient Growth Over Time'
					}
				},
				scales: {
					x: {
						title: { display: true, text: 'Month' }
					},
					y: {
						title: { display: true, text: 'Number of Patients' },
						beginAtZero: true
					}
				}
			}
		});
		console.log('Patient growth chart updated.');
	}

	async function updateAndRenderPatientAgeDistributionChart(): Promise<void> {
		console.log('Updating patient age distribution chart...');
		const canvas = document.getElementById('patientAgeDistributionChart') as HTMLCanvasElement | null;
		if (!canvas) {
			console.error('Patient age distribution chart canvas not found.');
			return;
		}

		if (!allPatients.length) allPatients = await fetchAllPatients();

		// Define age groups
		const ageGroups = {
			'0-17': 0,
			'18-25': 0,
			'26-35': 0,
			'36-45': 0,
			'46-55': 0,
			'56-65': 0,
			'65+': 0
		};

		// Count patients by age group
		allPatients.forEach(patient => {
			if (patient.age && patient.age > 0) {
				if (patient.age <= 17) ageGroups['0-17']++;
				else if (patient.age <= 25) ageGroups['18-25']++;
				else if (patient.age <= 35) ageGroups['26-35']++;
				else if (patient.age <= 45) ageGroups['36-45']++;
				else if (patient.age <= 55) ageGroups['46-55']++;
				else if (patient.age <= 65) ageGroups['56-65']++;
				else ageGroups['65+']++;
			}
		});

		const chartData = {
			labels: Object.keys(ageGroups),
			datasets: [{
				label: 'Number of Patients',
				data: Object.values(ageGroups),
				backgroundColor: [
					'#ef4444', '#f97316', '#eab308', '#22c55e',
					'#3b82f6', '#8b5cf6', '#ec4899'
				],
				borderColor: [
					'#dc2626', '#ea580c', '#ca8a04', '#16a34a',
					'#2563eb', '#7c3aed', '#db2777'
				],
				borderWidth: 2
			}]
		};

		if (patientAgeDistributionChartInstance) patientAgeDistributionChartInstance.destroy();
		patientAgeDistributionChartInstance = new Chart(canvas, {
			type: 'bar',
			data: chartData,
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: { display: false },
					title: {
						display: true,
						text: 'Patient Age Distribution'
					}
				},
				scales: {
					x: {
						title: { display: true, text: 'Age Groups' }
					},
					y: {
						title: { display: true, text: 'Number of Patients' },
						beginAtZero: true
					}
				}
			}
		});
		console.log('Patient age distribution chart updated.');
	}

	async function updateAndRenderPatientRegistrationChart(): Promise<void> {
		console.log('Updating patient registration chart...');
		const canvas = document.getElementById('patientRegistrationChart') as HTMLCanvasElement | null;
		if (!canvas) {
			console.error('Patient registration chart canvas not found.');
			return;
		}

		if (!allPatients.length) allPatients = await fetchAllPatients();

		// Get last 12 months
		const months = [];
		const currentDate = new Date();
		for (let i = 11; i >= 0; i--) {
			const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
			months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
		}

		// Count new patients per month
		const newPatientsByMonth = months.map(month => {
			const count = allPatients.filter(patient => {
				if (patient.registrationDate && patient.registrationDate !== 'N/A') {
					try {
						const date = new Date(patient.registrationDate);
						const patientMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
						return patientMonth === month;
					} catch (e) {
						return false;
					}
				}
				return false;
			}).length;
			return count;
		});

		const chartData = {
			labels: months.map(month => {
				const [year, monthNum] = month.split('-');
				return `${MONTH_NAMES[parseInt(monthNum) - 1]} ${year}`;
			}),
			datasets: [{
				label: 'New Patient Registrations',
				data: newPatientsByMonth,
				borderColor: '#8b5cf6',
				backgroundColor: 'rgba(139, 92, 246, 0.2)',
				tension: 0.3,
				fill: true,
				pointBackgroundColor: '#8b5cf6',
				pointBorderColor: '#ffffff',
				pointBorderWidth: 2
			}]
		};

		if (patientRegistrationChartInstance) patientRegistrationChartInstance.destroy();
		patientRegistrationChartInstance = new Chart(canvas, {
			type: 'line',
			data: chartData,
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: { position: 'top' },
					title: {
						display: true,
						text: 'New Patient Registrations (Last 12 Months)'
					}
				},
				scales: {
					x: {
						title: { display: true, text: 'Month' }
					},
					y: {
						title: { display: true, text: 'New Patients' },
						beginAtZero: true
					}
				}
			}
		});
		console.log('Patient registration chart updated.');
	}

	// --- Report Generation ---
	async function generateReport(): Promise<void> {
		console.log('Generating report...');
		try {
			 // Ensure data is loaded concurrently
			await Promise.all([
				allPatients.length === 0 ? fetchAllPatients().then(data => allPatients = data) : Promise.resolve(),
				allAppointments.length === 0 ? fetchAllAppointments().then(data => allAppointments = data) : Promise.resolve(),
				// prescriptions removed from report
			]);

			console.log('Data ready for report generation.');
			 if (exportType === 'pdf') {
				downloadPdfReport(allAppointments, allPatients);
			} else {
				downloadExcelReport(allAppointments, allPatients);
			}
		} catch (error) {
			console.error('Failed to fetch data for report:', error);
			alert('Error generating report. Failed to fetch required data.');
		}
	}

function downloadPdfReport(appointmentsData: Appointment[], patientsData: Patient[]): void {
    console.log('Generating PDF Report...');
    const pdfDoc = new jsPDF();
    const reportDate = getTodayString(); // Get today's date
    let currentY = 15; // Start Y position

    // --- Report Title and Generation Date ---
    pdfDoc.setFontSize(16); pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text('Data Report Summary', pdfDoc.internal.pageSize.getWidth() / 2, currentY, { align: 'center' });
    currentY += 8; // Move down

    pdfDoc.setFontSize(10); pdfDoc.setFont('helvetica', 'normal');
    pdfDoc.text(`${REPORT_DATE_LABEL}: ${reportDate}`, pdfDoc.internal.pageSize.getWidth() / 2, currentY, { align: 'center' });
    currentY += 5;
    pdfDoc.setFontSize(8);
    pdfDoc.text(`(${REPORT_DATE_DESCRIPTION})`, pdfDoc.internal.pageSize.getWidth() / 2, currentY, { align: 'center' });
    currentY += 10; // Add more space before the first table
    pdfDoc.setFontSize(10);

	// Prescriptions removed from report (focus on appointments and patients)

    // --- Appointments Section ---
    if (appointmentsData.length > 0) {
        // Check if adding this table will exceed the page height, add new page if needed
        if (currentY > pdfDoc.internal.pageSize.height - 30) { // Check approx height needed
           pdfDoc.addPage();
           currentY = 20; // Reset Y for new page
        }

        pdfDoc.setFontSize(12); pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.text('Appointments', 10, currentY);
        currentY += 7;
		pdfDoc.autoTable({
			head: [['Patient Name', 'Appointment Date', 'Time', 'Service', 'Subservice', 'Status']],
            body: appointmentsData.map(appt => [
                appt.patientName || 'Unknown',
					appt.date || 'N/A',
                appt.time || 'N/A',
                appt.service || 'N/A',
                appt.subServices?.join(', ') || 'N/A',
                appt.status || 'N/A'
            ]),
            startY: currentY,
            theme: 'grid', // Grid lines for structure
            headStyles: { fillColor: [39, 174, 96], textColor: 255, fontStyle: 'bold' }
        });
        currentY = (pdfDoc as any).lastAutoTable.finalY + 10;
    }

    // --- Patients Section ---
    if (patientsData.length > 0) {
        if (currentY > pdfDoc.internal.pageSize.height - 30) {
           pdfDoc.addPage();
           currentY = 20;
        }

        pdfDoc.setFontSize(12); pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.text('Patients', 10, currentY);
        currentY += 7;
		(pdfDoc as any).autoTable({
			head: [['Name', 'Age', 'Birthday', 'Gender', 'Phone', 'Registration Date']],
			body: patientsData.map(p => [
				`${p.name} ${p.lastName}`.trim(),
				p.age ?? 'N/A',
				p.birthday || 'N/A',
				p.gender || 'N/A',
				p.phone || 'N/A',
				p.registrationDate || 'N/A'
			]),
			startY: currentY,
			theme: 'plain', // Simple theme
			headStyles: { fillColor: [88, 86, 214], textColor: 255, fontStyle: 'bold' }
		});
        // currentY = (pdfDoc as any).lastAutoTable.finalY + 10; // No need if it's the last table
    }

    // --- Save the PDF with Date in Filename ---
    const filename = `Data_Report_${reportDate}.pdf`;
    pdfDoc.save(filename);
    console.log(`PDF Report Saved as ${filename}`);
}

function downloadExcelReport(
	appointmentsData: Appointment[],
	patientsData: Patient[]
): void {
  console.log('Generating Excel Report with Monthly Sectioning...');
  const workbook = XLSX.utils.book_new();
  const reportDate = getTodayString(); // Get today's date
  const metadataSheetData = [
    ['Metric', 'Value'],
    [REPORT_DATE_LABEL, reportDate],
    ['Date Description', REPORT_DATE_DESCRIPTION],
  ];
  const metadataSheet = XLSX.utils.aoa_to_sheet(metadataSheetData);
  metadataSheet['!cols'] = [
    { wch: 20 },
    { wch: Math.max(25, REPORT_DATE_DESCRIPTION.length) },
  ];
  XLSX.utils.book_append_sheet(workbook, metadataSheet, 'Report Info');

    // Helper function to calculate column widths
  const calculateColumnWidths = (data: any[]) => {
    const keys = Object.keys(data[0] || {});
    return keys.map(key => ({
      wch: Math.max(
        key.length, // Header length
        ...data.map(row => (row[key] ? row[key].toString().length : 0)) // Max cell length
      ),
    }));
  };

  // Group appointments by month
  const appointmentsByMonth = appointmentsData.reduce((acc, appt) => {
    try {
      const date = new Date(appt.date);
      const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!acc[monthYear]) acc[monthYear] = [];
      acc[monthYear].push(appt);
    } catch (e) {
      console.warn(`Invalid date format for appointment: ${appt.date}`);
    }
    return acc;
  }, {} as Record<string, Appointment[]>);

  // Create a sheet for each month's appointments
	Object.entries(appointmentsByMonth).forEach(([monthYear, appointments]) => {
		const sheetData = appointments.map(appt => ({
			'Patient Name': appt.patientName || 'Unknown',
			'Appointment Date': appt.date || 'N/A',
			'Time': appt.time || 'N/A',
			'Service': appt.service || 'N/A',
			'Subservice': appt.subServices?.join(', ') || 'N/A',
			'Status': appt.status || 'N/A',
		}));

    const ws = XLSX.utils.json_to_sheet(sheetData);
    ws['!cols'] = calculateColumnWidths(sheetData); // Set column widths
    XLSX.utils.book_append_sheet(workbook, ws, `Appointments_${monthYear}`);
  });


  // Group patients by registration month
  const patientsByMonth = patientsData.reduce((acc, patient) => {
    try {
      const date = new Date(patient.registrationDate || '');
      const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!acc[monthYear]) acc[monthYear] = [];
      acc[monthYear].push(patient);
    } catch (e) {
      console.warn(`Invalid date format for patient registration: ${patient.registrationDate}`);
    }
    return acc;
  }, {} as Record<string, Patient[]>);


  // Create a sheet for each month's patients
  Object.entries(patientsByMonth).forEach(([monthYear, patients]) => {
    const sheetData = patients.map(p => ({
      'Full Name': `${p.name} ${p.lastName}`.trim(),
      'First Name': p.name || 'N/A',
      'Last Name': p.lastName || 'N/A',
      'Age': p.age ?? 'N/A',
      'Birthday': p.birthday || 'N/A',
      'Gender': p.gender || 'N/A',
      'Phone Number': p.phone || 'N/A',
      'Registration Date': p.registrationDate || 'N/A',
      'Patient ID': p.id,
    }));
    const ws = XLSX.utils.json_to_sheet(sheetData);
    ws['!cols'] = calculateColumnWidths(sheetData); // Set column widths
    XLSX.utils.book_append_sheet(workbook, ws, `Patients_${monthYear}`);
  });

	// Prescriptions removed from Excel report - focusing on Appointments and Patients only

  // Save the Excel Workbook
   if (workbook.SheetNames.length > 0) {
    const filename = `Data_Report_${reportDate}.xlsx`;
    XLSX.writeFile(workbook, filename);
    console.log(`Excel Report Saved as ${filename}`);
  } else {
    console.log('No data available to generate Excel report.');
    alert('No data found to include in the report.');
  }
}
	// --- Lifecycle Hooks ---
	onMount(async () => {
		if (!db) { console.error('Firestore DB not available on mount.'); return; }
		console.log('Component Mounted. Initializing data...');
		try {
			// Fetch essential data concurrently first
			 await Promise.all([
				 fetchAllPatients().then(data => allPatients = data),
				 // Fetch appointments now too, as many things depend on it
				 fetchAllAppointments().then(data => allAppointments = data),
			 ]);
			 // Prescriptions not fetched on mount — dashboard focuses on appointments & patients

			// Fetch stats (now uses pre-fetched data)
			 stats = await fetchDashboardStats();

			// Initial render of charts (use current month/year)
			const currentMonth = new Date().getMonth() + 1;
			const currentYear = new Date().getFullYear();
			await Promise.all([
				updateAndRenderAppointmentStatusPieChart(),
				updateAndRenderGenderDistributionChart(),
				updateAndRenderWeeklyAppointmentsChart(),
				updateAndRenderCompletedMissedChart(),
				updateAndRenderLineChart(currentYear, currentMonth),
				// New patient analytics charts
				updateAndRenderPatientGrowthChart(),
				updateAndRenderPatientAgeDistributionChart(),
				updateAndRenderPatientRegistrationChart()
			]);

			// Fetch data for the default view of the monthly table
			monthlyAppointmentsData = await fetchMonthlyAppointmentsTableData(selectedYear, selectedMonth);
			console.log('Initial data load and chart rendering complete.');
		} catch (error) {
			console.error('Error during initial data load:', error);
		}
	});

	onDestroy(() => {
		console.log('Component Destroyed. Cleaning up charts...');
		lineChartInstance?.destroy();
		appointmentStatusChartInstance?.destroy();
		genderDistributionChartInstance?.destroy();
		weeklyAppointmentsChartInstance?.destroy();
		completedMissedChartInstance?.destroy();
		// Clean up new patient analytics charts
		patientGrowthChartInstance?.destroy();
		patientAgeDistributionChartInstance?.destroy();
		patientRegistrationChartInstance?.destroy();
	});

    async function handleMonthYearChange() {
     // Ensure this only runs client-side where DOM/Canvas exist
     if (typeof window === 'undefined') return;

     console.log(`Handling change for: ${selectedYear}-${selectedMonth}`);

     // Ensure data fetching functions don't run if dependencies aren't met (though they have internal checks)
     if (!db) {
         console.warn("DB not ready in handleMonthYearChange");
         return;
     }

     // Ensure data is loaded before filtering/rendering
     // Using Promise.all might be slightly more efficient if fetches are needed
     if (!allAppointments.length) allAppointments = await fetchAllAppointments();
     if (!allPatients.length) allPatients = await fetchAllPatients();

     monthlyAppointmentsData = await fetchMonthlyAppointmentsTableData(selectedYear, selectedMonth);
     await updateAndRenderLineChart(selectedYear, selectedMonth);
 }

 // Run handleMonthYearChange reactively ONLY when year/month change, AFTER initial mount.
 // The check for `window` prevents server-side execution.
 // The functions called within handleMonthYearChange should handle chart readiness.
 $: if (selectedYear && selectedMonth && typeof window !== 'undefined') {
     console.log(`Reactive block triggered for: ${selectedYear}-${selectedMonth}`);
     handleMonthYearChange();
 }

 // Add function to handle card clicks
 function handleCardClick(tableType: typeof openTable): void {
     openTable = openTable === tableType ? null : tableType;
 }
</script>


	<!-- Main Content Area -->
	<div class="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-white">
		<div class="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
			<!-- Header Section -->
			<div class="mb-4 sm:mb-8">
				<div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
					<div>
						<h1 class="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-blue-900 to-indigo-800 bg-clip-text text-transparent">Dashboard</h1>
						<p class="text-gray-600 mt-1 sm:mt-2 text-xs sm:text-sm">Welcome to the Permanente Health Plan's Dashboard for Admin Side.</p>
					</div>
					<div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4">
						<div class="flex items-center gap-2">
							<label for="exportTypeSelect" class="text-xs sm:text-sm font-medium text-gray-600 whitespace-nowrap">Export:</label>
							<select
								id="exportTypeSelect"
								bind:value={exportType}
								class="border border-gray-300 rounded px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm focus:ring-blue-500 focus:border-blue-500 flex-1"
							>
								<option value="excel">Excel</option>
							</select>
						</div>
						<button
							on:click={generateReport}
							aria-label="Generate report"
							class="bg-gradient-to-r from-blue-900 to-indigo-800 hover:from-blue-800 hover:to-indigo-700 text-white px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
						>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
							</svg>
							<span class="hidden sm:inline">Generate</span>
						</button>
					</div>
				</div>
			</div>

			<!-- Stats Cards -->
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 mb-4 sm:mb-6 lg:mb-8">
				<div role="button" tabindex="0" on:keydown={(e) => (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') && handleCardClick('monthlyAppointments')} class="bg-white rounded-xl sm:rounded-2xl shadow-md p-4 sm:p-6 border border-indigo-100 transition-all transform hover:shadow-xl hover:scale-105 hover:-translate-y-2 cursor-pointer group hover:border-indigo-200" on:click={() => handleCardClick('monthlyAppointments')}>
					<div class="flex items-center justify-between">
						<div>
							<p class="text-xs sm:text-sm font-semibold text-gray-600 uppercase tracking-wide">This Month's Appointments</p>
							<h3 class="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-900 to-indigo-700 bg-clip-text text-transparent mt-1 sm:mt-2">{stats.monthlyAppointments}</h3>
						</div>
							<div class="p-3 sm:p-4 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-lg sm:rounded-xl transition-all duration-300 transform group-hover:scale-110 group-hover:rotate-3 shadow-sm group-hover:shadow-md">
								<svg class="w-6 h-6 sm:w-7 sm:h-7 text-blue-900 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
							</svg>
						</div>
					</div>
				</div>
				<div role="button" tabindex="0" on:keydown={(e) => (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') && handleCardClick('appointments')} class="bg-white rounded-xl sm:rounded-2xl shadow-md p-4 sm:p-6 border border-emerald-100 transition-all transform hover:shadow-xl hover:scale-105 hover:-translate-y-2 cursor-pointer group hover:border-emerald-200" on:click={() => handleCardClick('appointments')}>
					<div class="flex items-center justify-between">
						<div>
							<p class="text-xs sm:text-sm font-semibold text-gray-600 uppercase tracking-wide">Total Appointments</p>
							<h3 class="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent mt-1 sm:mt-2">{stats.newAppointments}</h3>
						</div>
							<div class="p-3 sm:p-4 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-lg sm:rounded-xl transition-all duration-300 transform group-hover:scale-110 group-hover:rotate-3 shadow-sm group-hover:shadow-md">
								<svg class="w-6 h-6 sm:w-7 sm:h-7 text-emerald-700 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
							</svg>
						</div>
					</div>
				</div>
				<div role="button" tabindex="0" on:keydown={(e) => (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') && handleCardClick('appointments')} class="bg-white rounded-xl sm:rounded-2xl shadow-md p-4 sm:p-6 border border-purple-100 transition-all transform hover:shadow-xl hover:scale-105 hover:-translate-y-2 cursor-pointer group hover:border-purple-200" on:click={() => handleCardClick('appointments')}>
					<div class="flex items-center justify-between">
						<div>
							<p class="text-xs sm:text-sm font-semibold text-gray-600 uppercase tracking-wide">Today's Appointments</p>
							<h3 class="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-purple-600 to-violet-600 bg-clip-text text-transparent mt-1 sm:mt-2">{stats.todaysAppointments}</h3>
						</div>
							<div class="p-3 sm:p-4 bg-gradient-to-br from-purple-100 to-violet-100 rounded-lg sm:rounded-xl transition-all duration-300 transform group-hover:scale-110 group-hover:rotate-3 shadow-sm group-hover:shadow-md">
								<svg class="w-6 h-6 sm:w-7 sm:h-7 text-purple-700 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3" />
							</svg>
						</div>
					</div>
				</div>
				<div role="button" tabindex="0" on:keydown={(e) => (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') && handleCardClick('patients')} class="bg-white rounded-xl sm:rounded-2xl shadow-md p-4 sm:p-6 border border-amber-100 transition-all transform hover:shadow-xl hover:scale-105 hover:-translate-y-2 cursor-pointer group hover:border-amber-200" on:click={() => handleCardClick('patients')}>
					<div class="flex items-center justify-between">
						<div>
							<p class="text-xs sm:text-sm font-semibold text-gray-600 uppercase tracking-wide">Total Members</p>
							<h3 class="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent mt-1 sm:mt-2">{stats.totalPatients}</h3>
						</div>
							<div class="p-3 sm:p-4 bg-gradient-to-br from-amber-100 to-orange-100 rounded-lg sm:rounded-xl transition-all duration-300 transform group-hover:scale-110 group-hover:rotate-3 shadow-sm group-hover:shadow-md">
								<svg class="w-6 h-6 sm:w-7 sm:h-7 text-amber-600 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
							</svg>
						</div>
					</div>
				</div>
			</div>

			<!-- Enhanced Patient Analytics Cards -->
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 mb-4 sm:mb-6 lg:mb-8">
				<div class="bg-gradient-to-br from-white to-emerald-50 rounded-xl sm:rounded-2xl shadow-md p-4 sm:p-6 border border-emerald-100 transition-all transform hover:shadow-lg hover:scale-105 hover:-translate-y-1 group">
					<div class="flex items-center justify-between">
						<div>
							<p class="text-[10px] sm:text-xs font-semibold text-gray-600 uppercase tracking-wider">New Members This Month</p>
							<h3 class="text-2xl sm:text-3xl font-bold text-emerald-700 mt-1 sm:mt-2">{stats.newPatientsThisMonth}</h3>
						</div>
						<div class="p-2 sm:p-3 bg-emerald-100 rounded-lg sm:rounded-xl shadow-sm group-hover:shadow-md transition-all">
							<svg class="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
							</svg>
						</div>
					</div>
				</div>





				<div class="bg-gradient-to-br from-white to-teal-50 rounded-xl sm:rounded-2xl shadow-md p-4 sm:p-6 border border-teal-100 transition-all transform hover:shadow-lg hover:scale-105 hover:-translate-y-1 group">
					<div class="flex items-center justify-between">
						<div>
							<p class="text-[10px] sm:text-xs font-semibold text-gray-600 uppercase tracking-wider">Active Members</p>
							<h3 class="text-2xl sm:text-3xl font-bold text-teal-700 mt-1 sm:mt-2">{stats.activePatients}</h3>
						</div>
						<div class="p-2 sm:p-3 bg-teal-100 rounded-lg sm:rounded-xl shadow-sm group-hover:shadow-md transition-all">
							<svg class="w-5 h-5 sm:w-6 sm:h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
						</div>
					</div>
				</div>
			</div>

			<!-- Charts Section -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-6 mb-4 sm:mb-6 lg:mb-8">
				<div class="bg-white rounded-xl sm:rounded-2xl shadow-lg p-3 sm:p-4 lg:p-6 border border-indigo-100 hover:shadow-xl transition-shadow">
					<h3 class="text-sm sm:text-base lg:text-lg font-bold text-gray-800 mb-2 sm:mb-3 lg:mb-4 pb-1 sm:pb-2 border-b-2 border-indigo-100">Appointment Trends</h3>
					<div class="h-64 sm:h-72 lg:h-80">
						<canvas id="lineChart"></canvas>
					</div>
				</div>

				<div class="bg-white rounded-xl sm:rounded-2xl shadow-lg p-3 sm:p-4 lg:p-6 border border-indigo-100 hover:shadow-xl transition-shadow">
					<h3 class="text-sm sm:text-base lg:text-lg font-bold text-gray-800 mb-2 sm:mb-3 lg:mb-4 pb-1 sm:pb-2 border-b-2 border-indigo-100">Weekly Appointments</h3>
					<div class="h-64 sm:h-72 lg:h-80">
						<canvas id="weeklyAppointmentsBarChart"></canvas>
					</div>
				</div>

				<div class="bg-white rounded-xl sm:rounded-2xl shadow-lg p-3 sm:p-4 lg:p-6 border border-indigo-100 hover:shadow-xl transition-shadow">
					<h3 class="text-sm sm:text-base lg:text-lg font-bold text-gray-800 mb-2 sm:mb-3 lg:mb-4 pb-1 sm:pb-2 border-b-2 border-indigo-100">Appointment Status</h3>
					<div class="h-64 sm:h-72 lg:h-80">
						<canvas id="appointmentStatusPieChart"></canvas>
					</div>
				</div>

				<div class="bg-white rounded-xl sm:rounded-2xl shadow-lg p-3 sm:p-4 lg:p-6 border border-indigo-100 hover:shadow-xl transition-shadow">
					<h3 class="text-sm sm:text-base lg:text-lg font-bold text-gray-800 mb-2 sm:mb-3 lg:mb-4 pb-1 sm:pb-2 border-b-2 border-indigo-100">Gender Distribution</h3>
					<div class="h-64 sm:h-72 lg:h-80">
						<canvas id="genderDistributionDoughnutChart"></canvas>
					</div>
				</div>

				<div class="bg-white rounded-xl sm:rounded-2xl shadow-lg p-3 sm:p-4 lg:p-6 border border-indigo-100 lg:col-span-2 hover:shadow-xl transition-shadow">
					<h3 class="text-sm sm:text-base lg:text-lg font-bold text-gray-800 mb-2 sm:mb-3 lg:mb-4 pb-1 sm:pb-2 border-b-2 border-indigo-100">Completed vs Missed Appointments</h3>
					<div class="h-64 sm:h-72 lg:h-80">
						<canvas id="completedMissedLineChart"></canvas>
					</div>
				</div>
			</div>

			<!-- Patient Analytics Section -->
			<div class="mb-4 sm:mb-6 lg:mb-8">
				<h2 class="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-900 to-indigo-800 bg-clip-text text-transparent mb-3 sm:mb-4 lg:mb-6">Patient Analytics</h2>
				<div class="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
					<div class="bg-white rounded-xl sm:rounded-2xl shadow-lg p-3 sm:p-4 lg:p-6 border border-indigo-100 hover:shadow-xl transition-shadow">
						<h3 class="text-sm sm:text-base lg:text-lg font-bold text-gray-800 mb-2 sm:mb-3 lg:mb-4 pb-1 sm:pb-2 border-b-2 border-indigo-100">Patient Growth Over Time</h3>
						<div class="h-64 sm:h-72 lg:h-80">
							<canvas id="patientGrowthChart"></canvas>
						</div>
					</div>

					<div class="bg-white rounded-xl sm:rounded-2xl shadow-lg p-3 sm:p-4 lg:p-6 border border-indigo-100 hover:shadow-xl transition-shadow">
						<h3 class="text-sm sm:text-base lg:text-lg font-bold text-gray-800 mb-2 sm:mb-3 lg:mb-4 pb-1 sm:pb-2 border-b-2 border-indigo-100">Patient Age Distribution</h3>
						<div class="h-64 sm:h-72 lg:h-80">
							<canvas id="patientAgeDistributionChart"></canvas>
						</div>
					</div>

					<div class="bg-white rounded-xl sm:rounded-2xl shadow-lg p-3 sm:p-4 lg:p-6 border border-indigo-100 lg:col-span-2 hover:shadow-xl transition-shadow">
						<h3 class="text-sm sm:text-base lg:text-lg font-bold text-gray-800 mb-2 sm:mb-3 lg:mb-4 pb-1 sm:pb-2 border-b-2 border-indigo-100">New Patient Registrations (Last 12 Months)</h3>
						<div class="h-64 sm:h-72 lg:h-80">
							<canvas id="patientRegistrationChart"></canvas>
						</div>
					</div>
				</div>
			</div>

			<!-- Data Tables Section -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
				<div class="bg-white rounded-xl sm:rounded-2xl shadow-lg p-3 sm:p-4 lg:p-6 border border-indigo-100 hover:shadow-xl transition-shadow">
					<div class="flex justify-between items-center mb-3 sm:mb-4 pb-1 sm:pb-2 border-b-2 border-indigo-100">
						<h3 class="text-sm sm:text-base lg:text-lg font-bold text-gray-800">Recent Appointments</h3>
						<button
							class="text-xs sm:text-sm font-semibold text-blue-900 hover:text-indigo-700 transition-colors whitespace-nowrap"
							on:click={() => handleOpenTable('appointments')}
						>
							View All →
						</button>
					</div>
					<div class="flex flex-col gap-2 sm:gap-3 mb-3 sm:mb-4">
						<div class="relative w-full">
							<input
								type="text"
								placeholder="Search by patient or service..."
								class="w-full border border-gray-300 rounded-lg px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm focus:ring-blue-500 focus:border-blue-500"
								bind:value={appointmentSearchTerm}
								aria-label="Search appointments"
							/>
							<svg class="w-3 h-3 sm:w-4 sm:h-4 text-gray-400 absolute right-2 sm:right-3 top-2 sm:top-3 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1010.5 18.5a7.5 7.5 0 006.15-3.85z" />
							</svg>
						</div>
						<div class="flex flex-col sm:flex-row gap-2">
							<select
								class="flex-1 border border-gray-300 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm focus:ring-blue-500 focus:border-blue-500"
								bind:value={appointmentStatusFilter}
								aria-label="Filter appointments by status"
							>
								<option value="all">All Statuses</option>
								<option value="pending">Pending</option>
								<option value="accepted">Accepted</option>
								<option value="completed">Completed</option>
								<option value="missed">Missed</option>
								<option value="declined">Declined</option>
								<option value="other">Other</option>
							</select>
							<select
								class="flex-1 border border-gray-300 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm focus:ring-blue-500 focus:border-blue-500"
								bind:value={appointmentSortOption}
								aria-label="Sort appointments"
							>
								<option value="date-desc">Date (Newest)</option>
								<option value="date-asc">Date (Oldest)</option>
								<option value="name-asc">Patient (A → Z)</option>
								<option value="name-desc">Patient (Z → A)</option>
							</select>
						</div>
					</div>
					<div class="overflow-x-auto -mx-3 sm:mx-0">
						<table class="min-w-full divide-y divide-gray-200">
							<thead>
								<tr>
									<th class="px-2 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Patient</th>
									<th class="px-2 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
									<th class="px-2 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-200">
								{#if filteredAppointments.length}
									{#each filteredAppointments.slice(0, 5) as appointment}
										<tr class="hover:bg-gray-50 transition-colors duration-150 group">
											<td class="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-900">
												<button class="text-left text-blue-600 hover:underline truncate max-w-[120px] sm:max-w-none" on:click={() => viewPatientDetails(appointment.patientId)}>{appointment.patientName}</button>
											</td>
											<td class="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-500 whitespace-nowrap">{appointment.date}</td>
											<td class="px-2 sm:px-4 py-2 sm:py-3">
												<span class="px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs font-medium rounded-full whitespace-nowrap
													{appointment.status && appointment.status.toLowerCase().includes('completed') ? 'bg-green-100 text-green-800' :
													appointment.status && appointment.status.toLowerCase().includes('pending') ? 'bg-yellow-100 text-yellow-800' :
													appointment.status && appointment.status.toLowerCase().includes('accepted') ? 'bg-blue-100 text-blue-800' :
													appointment.status && appointment.status.toLowerCase().includes('missed') ? 'bg-red-100 text-red-800' :
													appointment.status && appointment.status.toLowerCase().includes('declined') ? 'bg-gray-200 text-gray-800' :
													'bg-gray-300 text-gray-700'}">
													{appointment.status}
												</span>
											</td>
										</tr>
									{/each}
									{:else}
										<tr>
											<td colspan="3" class="px-2 sm:px-4 py-4 sm:py-6 text-center text-xs sm:text-sm text-gray-500">No appointments match the current filters.</td>
										</tr>
									{/if}
								</tbody>
							</table>
						</div>
					</div>				<div class="bg-white rounded-xl sm:rounded-2xl shadow-lg p-3 sm:p-4 lg:p-6 border border-indigo-100 hover:shadow-xl transition-shadow">
					<div class="flex justify-between items-center mb-3 sm:mb-4 pb-1 sm:pb-2 border-b-2 border-indigo-100">
						<h3 class="text-sm sm:text-base lg:text-lg font-bold text-gray-800">Recent Members</h3>
						<button
							class="text-xs sm:text-sm font-semibold text-blue-900 hover:text-indigo-700 transition-colors whitespace-nowrap"
							on:click={() => handleOpenTable('patients')}
						>
							View All →
						</button>
					</div>
					<div class="flex flex-col gap-2 sm:gap-3 mb-3 sm:mb-4">
						<div class="relative w-full">
							<input
								type="text"
								placeholder="Search by name or ID..."
								class="w-full border border-gray-300 rounded-lg px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm focus:ring-blue-500 focus:border-blue-500"
								bind:value={patientSearchTerm}
								aria-label="Search patients"
							/>
							<svg class="w-3 h-3 sm:w-4 sm:h-4 text-gray-400 absolute right-2 sm:right-3 top-2 sm:top-3 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1010.5 18.5a7.5 7.5 0 006.15-3.85z" />
							</svg>
						</div>
						<div class="flex flex-col sm:flex-row gap-2">
							<select
								class="flex-1 border border-gray-300 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm focus:ring-blue-500 focus:border-blue-500"
								bind:value={patientStatusFilter}
								aria-label="Filter by status"
							>
								<option value="all">All Statuses</option>
								<option value="active">Active</option>
								<option value="inactive">Inactive</option>
							</select>
							<select
								class="flex-1 border border-gray-300 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm focus:ring-blue-500 focus:border-blue-500"
								bind:value={patientSortOption}
								aria-label="Sort patients"
							>
								<option value="name-asc">Name (A → Z)</option>
								<option value="name-desc">Name (Z → A)</option>
								<option value="age-asc">Age (Youngest)</option>
								<option value="age-desc">Age (Oldest)</option>
							</select>
						</div>
					</div>
					<div class="overflow-x-auto -mx-3 sm:mx-0">
						<table class="min-w-full divide-y divide-gray-200">
							<thead>
								<tr>
									<th class="px-2 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Patient</th>
									<th class="px-2 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">Registered</th>
									<th class="px-2 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Phone</th>
									<th class="px-2 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-200">
								{#if filteredPatients.length}
									{#each filteredPatients.slice(0, 5) as patient}
										<tr class="hover:bg-gray-50 transition-colors duration-150 group">
											<td class="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-900">
												<div class="member-cell flex items-center">
													<div class="initials-circle bg-gray-200 text-gray-700 rounded-full w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center font-semibold mr-2 sm:mr-3 transition-transform transform group-hover:scale-110 text-[10px] sm:text-sm" aria-hidden="true">{getPatientInitials(patient)}</div>
													<button class="text-left text-blue-600 hover:underline truncate max-w-[100px] sm:max-w-none" on:click={() => viewPatientDetails(patient.id)}>
														{patient.name} {patient.lastName}
													</button>
												</div>
											</td>
											<td class="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-500 hidden sm:table-cell whitespace-nowrap">{patient.registrationDate}</td>
											<td class="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-500 hidden md:table-cell">{patient.phone}</td>
											<td class="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-500">
												<select
													class="status-select text-[10px] sm:text-xs px-1 sm:px-2 py-0.5 sm:py-1 rounded"
													aria-label="Set member status"
													value={patient.status ?? 'active'}
													on:change={(event) => updateMemberStatus(patient.id, event.currentTarget.value as MemberStatus)}
												>
													<option value="active">Active</option>
													<option value="inactive">Inactive</option>
												</select>
											</td>
										</tr>
									{/each}
								{:else}
									<tr>
										<td colspan="4" class="px-4 py-6 text-center text-sm text-gray-500">No members match the current filters.</td>
									</tr>
								{/if}
							</tbody>
						</table>
					</div>
				</div>
			</div>
		</div>
	</div>

<!-- Full Table Views -->
{#if openTable}
    <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
        <div class="bg-white rounded-lg p-3 sm:p-4 lg:p-6 w-full max-w-6xl max-h-[90vh] overflow-auto">
            <div class="flex justify-between items-center mb-3 sm:mb-4">
				<h2 class="text-base sm:text-lg lg:text-xl font-bold text-gray-800">
					{openTable === 'appointments' ? 'All Appointments' :
					 openTable === 'patients' ? 'All Members' :
					 'Monthly Appointments'}
				</h2>
				<button
					aria-label="Close table dialog"
					class="text-gray-500 hover:text-gray-700 p-1"
					on:click={() => openTable = null}
				>
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {#if openTable === 'appointments'}
                <div class="space-y-4">
                    <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div class="relative w-full lg:w-1/2">
                            <input
                                type="text"
                                placeholder="Search by patient or service..."
                                class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                                bind:value={appointmentSearchTerm}
                                aria-label="Search appointments"
                            />
                            <svg class="w-4 h-4 text-gray-400 absolute right-3 top-3.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1010.5 18.5a7.5 7.5 0 006.15-3.85z" />
                            </svg>
                        </div>
                        <div class="flex flex-wrap gap-2 w-full lg:w-1/2">
                            <select
                                class="flex-1 min-w-[140px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                                bind:value={appointmentStatusFilter}
                                aria-label="Filter appointments by status"
                            >
                                <option value="all">All Statuses</option>
                                <option value="pending">Pending</option>
                                <option value="accepted">Accepted</option>
                                <option value="completed">Completed</option>
                                <option value="missed">Missed</option>
                                <option value="declined">Declined</option>
                                <option value="other">Other</option>
                            </select>
                            <select
                                class="flex-1 min-w-[160px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                                bind:value={appointmentSortOption}
                                aria-label="Sort appointments"
                            >
                                <option value="date-desc">Date (Newest)</option>
                                <option value="date-asc">Date (Oldest)</option>
                                <option value="name-asc">Patient (A → Z)</option>
                                <option value="name-desc">Patient (Z → A)</option>
                            </select>
                        </div>
                    </div>
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead>
                            <tr>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Patient</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Service</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200">
                            {#if filteredAppointments.length}
                            {#each filteredAppointments as appointment}
										<tr class="hover:bg-gray-50 transition-colors duration-150 group">
									<td class="px-4 py-3 text-sm text-gray-900">
										<button class="text-left text-blue-600 hover:underline" on:click={() => viewPatientDetails(appointment.patientId)}>{appointment.patientName}</button>
									</td>
                                    <td class="px-4 py-3 text-sm text-gray-500">{appointment.date}</td>
                                    <td class="px-4 py-3 text-sm text-gray-500">{appointment.time}</td>
                                    <td class="px-4 py-3 text-sm text-gray-500">{appointment.service}</td>
                                    <td class="px-4 py-3">
                                        <span class="px-2 py-1 text-xs font-medium rounded-full
                                            {appointment.status && appointment.status.toLowerCase().includes('completed') ? 'bg-green-100 text-green-800' :
                                            appointment.status && appointment.status.toLowerCase().includes('pending') ? 'bg-yellow-100 text-yellow-800' :
                                            appointment.status && appointment.status.toLowerCase().includes('accepted') ? 'bg-blue-100 text-blue-800' :
                                            appointment.status && appointment.status.toLowerCase().includes('missed') ? 'bg-red-100 text-red-800' :
                                            appointment.status && appointment.status.toLowerCase().includes('declined') ? 'bg-gray-200 text-gray-800' :
                                            'bg-gray-300 text-gray-700'}">
                                            {appointment.status}
                                        </span>
                                    </td>
                                </tr>
                            {/each}
                            {:else}
                                <tr>
                                    <td colspan="5" class="px-4 py-6 text-center text-sm text-gray-500">No appointments match the current filters.</td>
                                </tr>
                            {/if}
                        </tbody>
                    </table>
                </div>
                </div>
            {:else if openTable === 'patients'}
                <div class="space-y-4">
                    <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div class="relative w-full lg:w-1/2">
                            <input
                                type="text"
                                placeholder="Search by name or ID..."
                                class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                                bind:value={patientSearchTerm}
                                aria-label="Search patients"
                            />
                            <svg class="w-4 h-4 text-gray-400 absolute right-3 top-3.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1010.5 18.5a7.5 7.5 0 006.15-3.85z" />
                            </svg>
                        </div>
                        <div class="flex flex-wrap gap-2 w-full lg:w-1/2">
                            <select
                                class="flex-1 min-w-[140px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                                bind:value={patientStatusFilter}
                                aria-label="Filter by status"
                            >
                                <option value="all">All Statuses</option>
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                            </select>
                            <select
                                class="flex-1 min-w-[160px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                                bind:value={patientSortOption}
                                aria-label="Sort patients"
                            >
                                <option value="name-asc">Name (A → Z)</option>
                                <option value="name-desc">Name (Z → A)</option>
                                <option value="age-asc">Age (Youngest)</option>
                                <option value="age-desc">Age (Oldest)</option>
                            </select>
                        </div>
                    </div>
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead>
                            <tr>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Age</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Gender</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Registration Date</th>
								<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200">
                            {#if filteredPatients.length}
                            {#each filteredPatients as patient}
								<tr class="hover:bg-gray-50">
									<td class="px-4 py-3 text-sm text-gray-900">
										<button class="text-left text-blue-600 hover:underline" on:click={() => viewPatientDetails(patient.id)}>{patient.name} {patient.lastName}</button>
									</td>
                                    <td class="px-4 py-3 text-sm text-gray-500">{patient.age && patient.age > 0 ? patient.age : 'N/A'}</td>
                                    <td class="px-4 py-3 text-sm text-gray-500">{patient.gender && patient.gender.trim() ? patient.gender : 'N/A'}</td>
                                    <td class="px-4 py-3 text-sm text-gray-500">{patient.phone}</td>
                                    <td class="px-4 py-3 text-sm text-gray-500">{patient.registrationDate}</td>
									<td class="px-4 py-3 text-sm text-gray-500">
										<select
											class="status-select"
											aria-label="Set member status"
											value={patient.status ?? 'active'}
											on:change={(event) => updateMemberStatus(patient.id, event.currentTarget.value as MemberStatus)}
										>
											<option value="active">Active</option>
											<option value="inactive">Inactive</option>
										</select>
									</td>
                                </tr>
                            {/each}
                            {:else}
                                <tr>
                                    <td colspan="6" class="px-4 py-6 text-center text-sm text-gray-500">No members match the current filters.</td>
                                </tr>
                            {/if}
                        </tbody>
                    </table>
                </div>
                </div>
            
            {:else if openTable === 'monthlyAppointments'}
                <div class="space-y-4">
                    <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div class="relative w-full lg:w-1/2">
                            <input
                                type="text"
                                placeholder="Search by patient or service..."
                                class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                                bind:value={appointmentSearchTerm}
                                aria-label="Search monthly appointments"
                            />
                            <svg class="w-4 h-4 text-gray-400 absolute right-3 top-3.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1010.5 18.5a7.5 7.5 0 006.15-3.85z" />
                            </svg>
                        </div>
                        <div class="flex flex-wrap gap-2 w-full lg:w-1/2">
                            <select
                                class="flex-1 min-w-[140px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                                bind:value={appointmentStatusFilter}
                                aria-label="Filter monthly appointments by status"
                            >
                                <option value="all">All Statuses</option>
                                <option value="pending">Pending</option>
                                <option value="accepted">Accepted</option>
                                <option value="completed">Completed</option>
                                <option value="missed">Missed</option>
                                <option value="declined">Declined</option>
                                <option value="other">Other</option>
                            </select>
                            <select
                                class="flex-1 min-w-[160px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                                bind:value={appointmentSortOption}
                                aria-label="Sort monthly appointments"
                            >
                                <option value="date-desc">Date (Newest)</option>
                                <option value="date-asc">Date (Oldest)</option>
                                <option value="name-asc">Patient (A → Z)</option>
                                <option value="name-desc">Patient (Z → A)</option>
                            </select>
                        </div>
                    </div>
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead>
                            <tr>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Patient</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Service</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200">
                            {#if filteredMonthlyAppointments.length}
                            {#each filteredMonthlyAppointments as appointment}
                                <tr class="hover:bg-gray-50">
									<td class="px-4 py-3 text-sm text-gray-900">
										<button class="text-left text-blue-600 hover:underline" on:click={() => viewPatientDetails(appointment.patientId)}>{appointment.patientName}</button>
									</td>
                                    <td class="px-4 py-3 text-sm text-gray-500">{appointment.date}</td>
                                    <td class="px-4 py-3 text-sm text-gray-500">{appointment.time}</td>
                                    <td class="px-4 py-3 text-sm text-gray-500">{appointment.service}</td>
                                    <td class="px-4 py-3">
                                        <span class="px-2 py-1 text-xs font-medium rounded-full
                                            {appointment.status && appointment.status.toLowerCase().includes('completed') ? 'bg-green-100 text-green-800' :
                                            appointment.status && appointment.status.toLowerCase().includes('pending') ? 'bg-yellow-100 text-yellow-800' :
                                            appointment.status && appointment.status.toLowerCase().includes('accepted') ? 'bg-blue-100 text-blue-800' :
                                            appointment.status && appointment.status.toLowerCase().includes('missed') ? 'bg-red-100 text-red-800' :
                                            appointment.status && appointment.status.toLowerCase().includes('declined') ? 'bg-gray-200 text-gray-800' :
                                            'bg-gray-300 text-gray-700'}">
                                            {appointment.status}
                                        </span>
                                    </td>
                                </tr>
                            {/each}
                            {:else}
                                <tr>
                                    <td colspan="5" class="px-4 py-6 text-center text-sm text-gray-500">No appointments match the current filters.</td>
                                </tr>
                            {/if}
                        </tbody>
                    </table>
                </div>
                </div>
            {/if}
        </div>
    </div>
{/if}

{#if selectedPatient}
	<div class="fixed inset-0 flex items-center justify-center z-50" transition:fade={{ duration: 150 }}>
		<div class="absolute inset-0 bg-black bg-opacity-40"></div>

		<div class="relative bg-white rounded-2xl p-6 w-11/12 max-w-md shadow-2xl transform" in:scale={{ duration: 220, start: 0.9 }} out:scale={{ duration: 160, start: 0.9 }}>
			<div class="flex items-start justify-between mb-4">
				<div class="flex items-center gap-4">
					<div class="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-xl font-semibold">
						{#if selectedPatient.name}{selectedPatient.name.charAt(0).toUpperCase()}{selectedPatient.lastName ? selectedPatient.lastName.charAt(0).toUpperCase() : ''}{:else}U{/if}
					</div>
					<div>
						<h2 class="text-lg font-bold text-gray-800">{selectedPatient.name} {selectedPatient.lastName}</h2>
						<p class="text-sm text-gray-500">Member ID: {selectedPatient.displayId ?? selectedPatient.id}</p>
					</div>
				</div>
				<button aria-label="Close member details" class="text-gray-500 hover:text-gray-700" on:click={() => selectedPatient = null}>
					<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<div class="grid grid-cols-1 gap-2 text-sm text-gray-700">
				<div><span class="font-medium">Age:</span> {selectedPatient.age ?? 'N/A'}</div>
				<div><span class="font-medium">Birthday:</span> {selectedPatient.birthday ?? 'N/A'}</div>
				<div><span class="font-medium">Gender:</span> {selectedPatient.gender ?? 'N/A'}</div>
				<div><span class="font-medium">Phone:</span> {selectedPatient.phone ?? 'N/A'}</div>
				<div><span class="font-medium">Registered:</span> {selectedPatient.registrationDate ?? 'N/A'}</div>
				<div class="flex items-center gap-2">
					<span class="font-medium">Status:</span>
					<span class={`status-pill ${selectedPatient.status === 'inactive' ? 'inactive' : 'active'}`}>
						{selectedPatient.status === 'inactive' ? 'Inactive' : 'Active'}
					</span>
				</div>
			</div>

			<div class="mt-6 flex justify-end gap-3">
				<button class="px-4 py-2 rounded-md border border-gray-200 text-sm text-gray-700 hover:bg-gray-50" on:click={() => { openTable = 'appointments'; selectedPatient = null; }}>View Appointments</button>
				<button class="px-4 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700" on:click={() => selectedPatient = null}>Close</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.member-cell {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.initials-circle {
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 9999px;
		background: linear-gradient(135deg, #1e3a66 0%, #2c5282 100%);
		color: #fff;
		font-weight: 700;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		box-shadow: 0 2px 4px rgba(30, 58, 102, 0.2);
	}

	.status-select {
		width: 100%;
		padding: 0.35rem 0.5rem;
		border: 1px solid #d1d5db;
		border-radius: 0.5rem;
		background-color: #fff;
		font-size: 0.85rem;
		color: #1f2937;
	}

	.status-select:focus {
		outline: none;
		border-color: #2563eb;
		box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
	}

	.status-pill {
		padding: 0.2rem 0.75rem;
		border-radius: 9999px;
		font-size: 0.8rem;
		font-weight: 600;
		text-transform: capitalize;
	}

	.status-pill.active {
		background-color: #dcfce7;
		color: #166534;
	}

	.status-pill.inactive {
		background-color: #fee2e2;
		color: #b91c1c;
	}
</style>


