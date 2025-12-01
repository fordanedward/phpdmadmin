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
	middleName?: string;
	lastName: string;
	suffix?: string;
	age?: number;
	birthday?: string;
	gender?: string;
	phone?: string;
	email?: string;
	registrationDate?: string;
	status?: MemberStatus;
	profileImage?: string;
	// Medical Information
	bloodType?: string;
	allergies?: string;
	currentMedications?: string;
	medicalConditions?: any;
	surgicalHistory?: any;
	familyHistory?: any;
	otherMedicalConditions?: string;
	otherFamilyHistory?: string;
	bloodTransfusionHistory?: string;
	bloodTransfusionDate?: string;
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
		cancellationStatus?: string;
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
	}

	interface DailyAppointmentCount {
		day: string;
		count: number;
	}

	interface AppointmentReportData {
		dateRange: { start: string; end: string };
		totalAppointments: number;
		statusBreakdown: Record<string, number>;
		serviceBreakdown: Record<string, number>;
		dailyBreakdown: Record<string, number>;
		avgPerDay: string;
		mostCommonService: string;
		busiestDay: string;
		appointments: Appointment[];
	}

	let isCollapsed = false;
	let stats: Stats = {
		newAppointments: 0, totalPatients: 0, todaysPatients: 0, todaysAppointments: 0,
		monthlyAppointments: 0
	};

	let allAppointments: Appointment[] = [];
	let allPatients: Patient[] = [];
	let monthlyAppointmentsData: Appointment[] = [];

	let openTable: 'patients' | 'appointments' | 'monthlyAppointments' | null = null;
	let appointmentViewMode: 'all' | 'today' = 'all';
	let exportType: 'excel' | 'pdf' = 'excel';
	let selectedYear = CURRENT_YEAR;
	let selectedMonth = new Date().getMonth() + 1;

	// Reports modal state
	let showReportsModal = false;
	let reportStartDate = '';
	let reportEndDate = '';
	let reportData: AppointmentReportData | null = null;
	let isGeneratingReport = false;
	let reportValidationError = '';

	// Chart instances
	let lineChartInstance: Chart | null = null;
	let appointmentStatusChartInstance: Chart | null = null;
	let genderDistributionChartInstance: Chart | null = null;
	let weeklyAppointmentsChartInstance: Chart | null = null;
	let completedMissedChartInstance: Chart | null = null;

	// Chart Data (populated by functions)
	let lineChartLabels: string[] = [];
	let lineChartNewAppointmentsData: number[] = [];
	let lineChartTotalPatientsData: number[] = [];
	let weeklyAppointmentCounts: DailyAppointmentCount[] = []; 

let patientMap = new Map<string, Patient>();
let selectedPatient: Patient | null = null;
let showPatientDetailsModal = false;

let patientSearchTerm = '';
let patientStatusFilter: MemberStatus | 'all' = 'all';
type PatientSortOption = 'name-asc' | 'name-desc' | 'age-asc' | 'age-desc' | 'date-asc' | 'date-desc';
let patientSortOption: PatientSortOption = 'name-asc';
let filteredPatients: Patient[] = [];

type AppointmentStatusFilter = 'all' | 'pending' | 'completed' | 'accepted' | 'missed' | 'declined' | 'cancellation_requested' | 'cancelled';
type AppointmentSortOption = 'date-desc' | 'date-asc' | 'name-asc' | 'name-desc';
let appointmentSearchTerm = '';
let appointmentStatusFilter: AppointmentStatusFilter = 'all';
let appointmentSortOption: AppointmentSortOption = 'date-desc';
let appointmentFilterStartDate = '';
let appointmentFilterEndDate = '';
let filteredAppointments: Appointment[] = [];
let todaysAppointmentsFiltered: Appointment[] = [];
let filteredMonthlyAppointments: Appointment[] = [];

	function viewPatientDetails(patientId: string) {
		selectedPatient = patientMap.get(patientId) || allPatients.find(p => p.id === patientId) || null;
		if (selectedPatient) {
			showPatientDetailsModal = true;
			// Disable body scroll when modal opens
			if (typeof document !== 'undefined') {
				document.body.style.overflow = 'hidden';
			}
		}
	}

	function closePatientDetailsModal() {
		showPatientDetailsModal = false;
		selectedPatient = null;
		// Re-enable body scroll when modal closes
		if (typeof document !== 'undefined') {
			document.body.style.overflow = '';
		}
	}

	function formatDateDisplay(dateString: string | undefined): string {
		if (!dateString || dateString === 'N/A') return 'N/A';
		try {
			const date = new Date(dateString);
			return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
		} catch {
			return dateString;
		}
	}

	function getCheckedConditionsDisplay(conditions: any): string[] {
		if (!conditions || typeof conditions !== 'object') return [];
		return Object.entries(conditions)
			.filter(([_, value]) => value === true)
			.map(([key]) => key.replace(/([A-Z])/g, ' $1').trim())
			.map(str => str.charAt(0).toUpperCase() + str.slice(1));
	}

	function getFamilyHistoryDisplay(familyHistory: any): Array<{relative: string, conditions: string[]}> {
		if (!familyHistory || typeof familyHistory !== 'object') return [];
		
		const relativeLabels: {[key: string]: string} = {
			mother: 'Mother',
			father: 'Father',
			sister: 'Sister',
			brother: 'Brother',
			daughter: 'Daughter',
			son: 'Son',
			otherRelative: 'Other Relative'
		};
		
		return Object.entries(familyHistory)
			.map(([relative, conditions]: [string, any]) => {
				const checkedConditions = Object.entries(conditions || {})
					.filter(([_, value]) => value === true)
					.map(([key]) => key.replace(/([A-Z])/g, ' $1').trim())
					.map(str => str.charAt(0).toUpperCase() + str.slice(1));
				
				return {
					relative: relativeLabels[relative] || relative,
					conditions: checkedConditions
				};
			})
			.filter(item => item.conditions.length > 0);
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
		const result = f === 'cancelled';
		if (debug) console.log('apptFilterDebug: status empty', { id: appointment.id, statusRaw, filter, result });
		return result;
	}

	// Map filter values to possible status variations
	const tokensMap: Record<string, string[]> = {
		pending: ['pending'],
		completed: ['complete', 'completed', 'done'],
		accepted: ['accept', 'accepted'],
		missed: ['miss', 'missed', 'no-show', 'noshow'],
		declined: ['declin', 'declined', 'decline'],
		'cancellation requested': ['cancellationrequest'],
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
	
	// If no match found and filter is 'cancelled', check if status doesn't match any known status
	if (!match && f === 'cancelled') {
		const allKnownTokens = Object.values(tokensMap).flat();
		const isCancelled = !allKnownTokens.some(tok => statusNormalized.includes(tok));
		if (debug) console.log('apptFilterDebug: status cancelled check', { id: appointment.id, statusRaw, isCancelled });
		return isCancelled;
	}
	
	return match;
}

function getFilteredAppointmentList(source: Appointment[]): Appointment[] {
	let list = [...source];

	// Apply date range filter first
	if (appointmentFilterStartDate || appointmentFilterEndDate) {
		const startDate = appointmentFilterStartDate ? new Date(appointmentFilterStartDate) : null;
		const endDate = appointmentFilterEndDate ? new Date(appointmentFilterEndDate) : null;
		
		list = list.filter(appt => {
			try {
				const apptDate = new Date(appt.date);
				
				if (startDate && apptDate < startDate) {
					return false;
				}
				
				if (endDate) {
					const endDateEnd = new Date(endDate);
					endDateEnd.setHours(23, 59, 59, 999);
					if (apptDate > endDateEnd) {
						return false;
					}
				}
				
				return true;
			} catch {
				return false;
			}
		});
	}

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
		case 'date-asc':
			patients.sort((a, b) => (a.registrationDate || '').localeCompare(b.registrationDate || ''));
			break;
		case 'date-desc':
			patients.sort((a, b) => (b.registrationDate || '').localeCompare(a.registrationDate || ''));
			break;
		default:
			patients.sort(comparePatientsByName);
			break;
	}

	return patients;
})();

	$: filteredAppointments = (() => {
		// This reactive block explicitly depends on all filtering variables
		const _ = [appointmentSearchTerm, appointmentStatusFilter, appointmentSortOption, appointmentFilterStartDate, appointmentFilterEndDate, allAppointments];
		return getFilteredAppointmentList(allAppointments);
	})();

	$: todaysAppointmentsFiltered = (() => {
		const today = getTodayString();
		const todaysAppts = allAppointments.filter(a => a.date === today);
		return getFilteredAppointmentList(todaysAppts);
	})();

	$: filteredMonthlyAppointments = (() => {
		// This reactive block explicitly depends on all filtering variables
		const _ = [appointmentSearchTerm, appointmentStatusFilter, appointmentSortOption, appointmentFilterStartDate, appointmentFilterEndDate, monthlyAppointmentsData];
		return getFilteredAppointmentList(monthlyAppointmentsData);
	})();

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

	// --- Appointment Reports Functions ---
	function openReportsModal(): void {
		// Set default date range to current month
		const now = new Date();
		const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
		const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
		
		reportStartDate = firstDay.toISOString().split('T')[0];
		reportEndDate = lastDay.toISOString().split('T')[0];
		showReportsModal = true;
		
		// Generate initial report
		generateAppointmentReport();
	}

	function generateAppointmentReport(): void {
		reportValidationError = '';
		
		if (!reportStartDate || !reportEndDate) {
			reportValidationError = 'Please select both start and end dates';
			return;
		}

		const start = new Date(reportStartDate);
		const end = new Date(reportEndDate);
		
		if (start > end) {
			reportValidationError = 'Start date must be before end date';
			return;
		}

		isGeneratingReport = true;
		// Simulate processing with a small delay for animation effect
		setTimeout(() => {
			// Filter appointments by date range
			const filteredAppointments = allAppointments.filter(apt => {
				const aptDate = new Date(apt.date);
				return aptDate >= start && aptDate <= end;
			});

			// Calculate statistics
			const totalAppointments = filteredAppointments.length;
		
		// Status breakdown
		const statusCounts: Record<string, number> = {};
		filteredAppointments.forEach(apt => {
			const status = (apt.status || 'unknown').toLowerCase();
			statusCounts[status] = (statusCounts[status] || 0) + 1;
		});

		// Service breakdown
		const serviceCounts: Record<string, number> = {};
		filteredAppointments.forEach(apt => {
			const service = apt.service || 'Unknown Service';
			serviceCounts[service] = (serviceCounts[service] || 0) + 1;
		});

		// Daily breakdown
		const dailyCounts: Record<string, number> = {};
		filteredAppointments.forEach(apt => {
			dailyCounts[apt.date] = (dailyCounts[apt.date] || 0) + 1;
		});

		// Calculate averages and trends
		const dateRange = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
		const avgPerDay = totalAppointments / dateRange;

		// Most common service
		const mostCommonService = Object.entries(serviceCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
		
		// Busiest day
		const busiestDay = Object.entries(dailyCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

		reportData = {
			dateRange: { start: reportStartDate, end: reportEndDate },
			totalAppointments,
			statusBreakdown: statusCounts,
			serviceBreakdown: serviceCounts,
			dailyBreakdown: dailyCounts,
			avgPerDay: avgPerDay.toFixed(2),
			mostCommonService,
			busiestDay,
			appointments: filteredAppointments
		};
		isGeneratingReport = false;
		}, 600);
	}

	function exportAppointmentReport(): void {
		if (!reportData) {
			alert('Please generate a report first');
			return;
		}

		const workbook = XLSX.utils.book_new();
		const reportDate = getTodayString();

		// Summary Sheet
		const summaryData = [
			['Appointment Report'],
			['Generated Date', reportDate],
			['Date Range', `${reportData.dateRange.start} to ${reportData.dateRange.end}`],
			[''],
			['SUMMARY STATISTICS'],
			['Total Appointments', reportData.totalAppointments],
			['Average Per Day', reportData.avgPerDay],
			['Most Common Service', reportData.mostCommonService],
			['Busiest Day', reportData.busiestDay],
			[''],
			['STATUS BREAKDOWN'],
			...Object.entries(reportData.statusBreakdown).map(([status, count]) => [
				status.charAt(0).toUpperCase() + status.slice(1),
				count
			]),
			[''],
			['SERVICE BREAKDOWN'],
			...Object.entries(reportData.serviceBreakdown).map(([service, count]) => [service, count])
		];

		const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
		XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

		// Detailed Appointments Sheet
		const appointmentData = reportData.appointments.map((apt: Appointment) => ({
			'Date': apt.date,
			'Time': apt.time || 'N/A',
			'Patient': apt.patientName || 'Unknown',
			'Service': apt.service || 'N/A',
			'Status': apt.status
		}));

		const detailSheet = XLSX.utils.json_to_sheet(appointmentData);
		XLSX.utils.book_append_sheet(workbook, detailSheet, 'Appointments');

		// Daily Breakdown Sheet
		const dailyData = Object.entries(reportData.dailyBreakdown)
			.sort((a, b) => a[0].localeCompare(b[0]))
			.map(([date, count]) => ({ 'Date': date, 'Appointments': count }));

		const dailySheet = XLSX.utils.json_to_sheet(dailyData);
		XLSX.utils.book_append_sheet(workbook, dailySheet, 'Daily Breakdown');

		// Save file
		const filename = `Appointment_Report_${reportData.dateRange.start}_to_${reportData.dateRange.end}.xlsx`;
		XLSX.writeFile(workbook, filename);
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
					middleName: data.middleName || '',
					lastName: data.lastName,
					suffix: data.suffix || '',
					age: data.age,
					birthday: data.birthday,
					gender: data.gender,
					phone: data.phone,
					email: data.email || '',
					registrationDate: users[doc.id]?.registrationDate ? 
						new Date(users[doc.id].registrationDate).toISOString().split('T')[0] : 
						'N/A', // Use registration date from users
					status: users[doc.id]?.isArchived || users[doc.id]?.archived ? 'inactive' : ((data.status as MemberStatus) ?? 'active'),
					profileImage: data.profileImage || '',
					// Medical Information
					bloodType: data.bloodType || '',
					allergies: data.allergies || '',
					currentMedications: data.currentMedications || '',
					medicalConditions: data.medicalConditions || {},
					surgicalHistory: data.surgicalHistory || {},
					familyHistory: data.familyHistory || {},
					otherMedicalConditions: data.otherMedicalConditions || '',
					otherFamilyHistory: data.otherFamilyHistory || '',
					bloodTransfusionHistory: data.bloodTransfusionHistory || '',
					bloodTransfusionDate: data.bloodTransfusionDate || ''
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
			monthlyAppointments: 0
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
    let currentY = 10; // Start Y position
    const pageWidth = pdfDoc.internal.pageSize.getWidth();
    const pageHeight = pdfDoc.internal.pageSize.getHeight();

    // --- Organization Header (Text Only) ---
    pdfDoc.setFontSize(14);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.setTextColor(16, 71, 138); // Permanente blue color
    pdfDoc.text('The Permanente Health Plan Corp.', pageWidth / 2, 10, { align: 'center' });
    
    pdfDoc.setFontSize(11);
    pdfDoc.setFont('helvetica', 'normal');
    pdfDoc.setTextColor(0, 0, 0);
    pdfDoc.text('Multi-Specialty Health Plan', pageWidth / 2, 17, { align: 'center' });
    pdfDoc.setFontSize(9);
    pdfDoc.text('Lot 19, Blk. 7, Mayumi St. Sta. Rita, Olongapo City', pageWidth / 2, 23, { align: 'center' });

    currentY = 30;

    // --- Report Title and Generation Date ---
    pdfDoc.setFontSize(14);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.setTextColor(0, 0, 0);
    pdfDoc.text('Data Report Summary', pageWidth / 2, currentY, { align: 'center' });
    currentY += 8;

    pdfDoc.setFontSize(10);
    pdfDoc.setFont('helvetica', 'normal');
    pdfDoc.text(`${REPORT_DATE_LABEL}: ${reportDate}`, pageWidth / 2, currentY, { align: 'center' });
    currentY += 5;
    pdfDoc.setFontSize(8);
    pdfDoc.text(`(${REPORT_DATE_DESCRIPTION})`, pageWidth / 2, currentY, { align: 'center' });
    currentY += 10;
    pdfDoc.setFontSize(10);

	// Prescriptions removed from report (focus on appointments and patients)

    // --- Appointments Section ---
    if (appointmentsData.length > 0) {
        // Check if adding this table will exceed the page height, add new page if needed
        if (currentY > pageHeight - 40) {
           pdfDoc.addPage();
           currentY = 20;
        }

        pdfDoc.setFontSize(12);
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.setTextColor(0, 0, 0);
        pdfDoc.text('Appointments', 10, currentY);
        currentY += 7;
		(pdfDoc as any).autoTable({
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
            theme: 'grid',
            headStyles: { 
                fillColor: [225, 168, 0], // #e1a800 - Gold color
                textColor: [0, 0, 0], // Black text
                fontStyle: 'bold',
                fontSize: 10
            },
            bodyStyles: {
                textColor: [0, 0, 0],
                fontSize: 9
            },
            alternateRowStyles: {
                fillColor: [255, 250, 240] // Very light gold background for alternate rows
            }
        });
        currentY = (pdfDoc as any).lastAutoTable.finalY + 10;
    }

    // --- Patients Section ---
    if (patientsData.length > 0) {
        if (currentY > pageHeight - 40) {
           pdfDoc.addPage();
           currentY = 20;
        }

        pdfDoc.setFontSize(12);
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.setTextColor(0, 0, 0);
        pdfDoc.text('Members', 10, currentY);
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
			theme: 'grid',
			headStyles: { 
                fillColor: [16, 71, 138], // #10478a - Permanente blue
                textColor: [255, 255, 255], // White text
                fontStyle: 'bold',
                fontSize: 10
            },
            bodyStyles: {
                textColor: [0, 0, 0],
                fontSize: 9
            },
            alternateRowStyles: {
                fillColor: [240, 245, 250] // Very light blue background for alternate rows
            }
		});
    }

    // --- Save the PDF with Date in Filename ---
    const filename = `Data_Report_${reportDate}.pdf`;
    pdfDoc.save(filename);
    console.log(`PDF Report Saved as ${filename}`);
}

function downloadPdfReportWithBreakdown(appointmentsData: Appointment[], patientsData: Patient[], statusBreakdown: Record<string, number>, serviceBreakdown: Record<string, number>): void {
    console.log('Generating PDF Report from Appointment Reports...');
    const pdfDoc = new jsPDF();
    const reportDate = getTodayString();
    let currentY = 10;
    const pageWidth = pdfDoc.internal.pageSize.getWidth();
    const pageHeight = pdfDoc.internal.pageSize.getHeight();

    // --- Organization Header ---
    pdfDoc.setFontSize(14);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.setTextColor(16, 71, 138);
    pdfDoc.text('The Permanente Health Plan Corp.', pageWidth / 2, 10, { align: 'center' });
    
    pdfDoc.setFontSize(11);
    pdfDoc.setFont('helvetica', 'normal');
    pdfDoc.setTextColor(0, 0, 0);
    pdfDoc.text('Multi-Specialty Health Plan', pageWidth / 2, 17, { align: 'center' });
    pdfDoc.setFontSize(9);
    pdfDoc.text('Lot 19, Blk. 7, Mayumi St. Sta. Rita, Olongapo City', pageWidth / 2, 23, { align: 'center' });

    currentY = 30;

    // --- Report Title and Generation Date ---
    pdfDoc.setFontSize(14);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.setTextColor(0, 0, 0);
    pdfDoc.text('Appointment Report', pageWidth / 2, currentY, { align: 'center' });
    currentY += 8;

    pdfDoc.setFontSize(10);
    pdfDoc.setFont('helvetica', 'normal');
    pdfDoc.text(`${REPORT_DATE_LABEL}: ${reportDate}`, pageWidth / 2, currentY, { align: 'center' });
    currentY += 5;
    pdfDoc.setFontSize(8);
    pdfDoc.text(`(${REPORT_DATE_DESCRIPTION})`, pageWidth / 2, currentY, { align: 'center' });
    currentY += 10;

    // --- Status Breakdown ---
    if (Object.keys(statusBreakdown).length > 0) {
        if (currentY > pageHeight - 50) {
            pdfDoc.addPage();
            currentY = 20;
        }

        pdfDoc.setFontSize(12);
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.setTextColor(0, 0, 0);
        pdfDoc.text('Status Breakdown', 10, currentY);
        currentY += 7;

        const statusData = Object.entries(statusBreakdown).map(([status, count]) => [
            status.charAt(0).toUpperCase() + status.slice(1),
            count.toString()
        ]);

        (pdfDoc as any).autoTable({
            head: [['Status', 'Count']],
            body: statusData,
            startY: currentY,
            theme: 'grid',
            headStyles: {
                fillColor: [101, 116, 205],
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 10
            },
            bodyStyles: {
                textColor: [0, 0, 0],
                fontSize: 9
            },
            alternateRowStyles: {
                fillColor: [240, 245, 250]
            }
        });
        currentY = (pdfDoc as any).lastAutoTable.finalY + 10;
    }

    // --- Service Breakdown ---
    if (Object.keys(serviceBreakdown).length > 0) {
        if (currentY > pageHeight - 50) {
            pdfDoc.addPage();
            currentY = 20;
        }

        pdfDoc.setFontSize(12);
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.setTextColor(0, 0, 0);
        pdfDoc.text('Service Breakdown', 10, currentY);
        currentY += 7;

        const serviceData = Object.entries(serviceBreakdown).map(([service, count]) => [
            service,
            count.toString()
        ]);

        (pdfDoc as any).autoTable({
            head: [['Service', 'Count']],
            body: serviceData,
            startY: currentY,
            theme: 'grid',
            headStyles: {
                fillColor: [16, 71, 138],
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 10
            },
            bodyStyles: {
                textColor: [0, 0, 0],
                fontSize: 9
            },
            alternateRowStyles: {
                fillColor: [240, 245, 250]
            }
        });
        currentY = (pdfDoc as any).lastAutoTable.finalY + 10;
    }

    // --- Appointments Section ---
    if (appointmentsData.length > 0) {
        if (currentY > pageHeight - 40) {
            pdfDoc.addPage();
            currentY = 20;
        }

        pdfDoc.setFontSize(12);
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.setTextColor(0, 0, 0);
        pdfDoc.text('Appointments', 10, currentY);
        currentY += 7;

        (pdfDoc as any).autoTable({
            head: [['Patient Name', 'Appointment Date', 'Time', 'Service', 'Status']],
            body: appointmentsData.map(appt => [
                appt.patientName || 'Unknown',
                appt.date || 'N/A',
                appt.time || 'N/A',
                appt.service || 'N/A',
                appt.status || 'N/A'
            ]),
            startY: currentY,
            theme: 'grid',
            headStyles: {
                fillColor: [225, 168, 0],
                textColor: [0, 0, 0],
                fontStyle: 'bold',
                fontSize: 10
            },
            bodyStyles: {
                textColor: [0, 0, 0],
                fontSize: 9
            },
            alternateRowStyles: {
                fillColor: [255, 250, 240]
            }
        });
        currentY = (pdfDoc as any).lastAutoTable.finalY + 10;
    }

    // --- Patients Section ---
    if (patientsData.length > 0) {
        if (currentY > pageHeight - 40) {
            pdfDoc.addPage();
            currentY = 20;
        }

        pdfDoc.setFontSize(12);
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.setTextColor(0, 0, 0);
        pdfDoc.text('Members', 10, currentY);
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
            theme: 'grid',
            headStyles: {
                fillColor: [16, 71, 138],
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 10
            },
            bodyStyles: {
                textColor: [0, 0, 0],
                fontSize: 9
            },
            alternateRowStyles: {
                fillColor: [240, 245, 250]
            }
        });
    }

    const filename = `Appointment_Report_${reportDate}.pdf`;
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

// Export filtered report data to Excel
function downloadExcelReportFromReport(
	appointmentsData: Appointment[],
	patientsData: Patient[],
	statusBreakdown?: Record<string, number>,
	serviceBreakdown?: Record<string, number>
): void {
  console.log('Generating Excel Report from Appointment Reports...');
  const workbook = XLSX.utils.book_new();
  const reportDate = getTodayString();
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

  const calculateColumnWidths = (data: any[]) => {
    const keys = Object.keys(data[0] || {});
    return keys.map(key => ({
      wch: Math.max(
        key.length,
        ...data.map(row => (row[key] ? row[key].toString().length : 0))
      ),
    }));
  };

  // Status Breakdown sheet
  if (statusBreakdown && Object.keys(statusBreakdown).length > 0) {
    const statusData = Object.entries(statusBreakdown).map(([status, count]) => ({
      'Status': status.charAt(0).toUpperCase() + status.slice(1),
      'Count': count
    }));
    const ws = XLSX.utils.json_to_sheet(statusData);
    ws['!cols'] = calculateColumnWidths(statusData);
    XLSX.utils.book_append_sheet(workbook, ws, 'Status Breakdown');
  }

  // Service Breakdown sheet
  if (serviceBreakdown && Object.keys(serviceBreakdown).length > 0) {
    const serviceData = Object.entries(serviceBreakdown).map(([service, count]) => ({
      'Service': service,
      'Count': count
    }));
    const ws = XLSX.utils.json_to_sheet(serviceData);
    ws['!cols'] = calculateColumnWidths(serviceData);
    XLSX.utils.book_append_sheet(workbook, ws, 'Service Breakdown');
  }

  // Appointments sheet
  if (appointmentsData.length > 0) {
    const appointmentSheetData = appointmentsData.map(appt => ({
      'Patient Name': appt.patientName || 'Unknown',
      'Appointment Date': appt.date || 'N/A',
      'Time': appt.time || 'N/A',
      'Service': appt.service || 'N/A',
      'Subservice': appt.subServices?.join(', ') || 'N/A',
      'Status': appt.status || 'N/A',
    }));
    const ws = XLSX.utils.json_to_sheet(appointmentSheetData);
    ws['!cols'] = calculateColumnWidths(appointmentSheetData);
    XLSX.utils.book_append_sheet(workbook, ws, 'Appointments');
  }

  // Patients sheet
  if (patientsData.length > 0) {
    const patientSheetData = patientsData.map(p => ({
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
    const ws = XLSX.utils.json_to_sheet(patientSheetData);
    ws['!cols'] = calculateColumnWidths(patientSheetData);
    XLSX.utils.book_append_sheet(workbook, ws, 'Patients');
  }

  if (workbook.SheetNames.length > 1) {
    const filename = `Appointment_Report_${reportDate}.xlsx`;
    XLSX.writeFile(workbook, filename);
    console.log(`Excel Report Saved as ${filename}`);
  } else {
    alert('No data available to export.');
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
				updateAndRenderLineChart(currentYear, currentMonth)
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
 function handleCardClick(tableType: typeof openTable, mode: 'all' | 'today' = 'all'): void {
     openTable = openTable === tableType ? null : tableType;
	 if (tableType === 'appointments') {
	 	appointmentViewMode = mode;
	 }
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
						<button
							on:click={openReportsModal}
							aria-label="View appointment reports"
							class="bg-gradient-to-r from-yellow-500 to-yellow-500 hover:from-yellow-600 hover:to-yellow-600 text-white px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
						>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
							</svg>
							<span class="hidden sm:inline">Reports</span>
						</button>
					</div>
				</div>
			</div>

			<!-- Stats Cards -->
			<div class="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-6 mb-4 sm:mb-6 lg:mb-8">
				<div role="button" tabindex="0" on:keydown={(e) => (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') && handleCardClick('monthlyAppointments')} class="bg-white rounded-lg sm:rounded-2xl shadow-md p-2 sm:p-6 border border-indigo-100 transition-all transform hover:shadow-xl hover:scale-105 hover:-translate-y-2 cursor-pointer group hover:border-indigo-200" on:click={() => handleCardClick('monthlyAppointments')}>
					<div class="flex items-center justify-between gap-2">
						<div class="min-w-0">
							<p class="text-xs sm:text-sm font-semibold text-gray-600 uppercase tracking-wide">This Month's Appointments</p>
							<h3 class="text-lg sm:text-3xl font-bold bg-gradient-to-r from-blue-900 to-indigo-700 bg-clip-text text-transparent mt-1 sm:mt-2">{stats.monthlyAppointments}</h3>
						</div>
							<div class="p-2 sm:p-4 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-lg sm:rounded-xl transition-all duration-300 transform group-hover:scale-110 group-hover:rotate-3 shadow-sm group-hover:shadow-md flex-shrink-0">
								<svg class="w-4 h-4 sm:w-7 sm:h-7 text-blue-900 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
							</svg>
						</div>
					</div>
				</div>
				<div role="button" tabindex="0" on:keydown={(e) => (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') && handleCardClick('appointments', 'all')} class="bg-white rounded-lg sm:rounded-2xl shadow-md p-2 sm:p-6 border border-emerald-100 transition-all transform hover:shadow-xl hover:scale-105 hover:-translate-y-2 cursor-pointer group hover:border-emerald-200" on:click={() => handleCardClick('appointments', 'all')}>
					<div class="flex items-center justify-between gap-2">
						<div class="min-w-0">
							<p class="text-xs sm:text-sm font-semibold text-gray-600 uppercase tracking-tight">Total Appointments</p>
							<h3 class="text-lg sm:text-3xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent mt-1 sm:mt-2">{stats.newAppointments}</h3>
						</div>
							<div class="p-2 sm:p-4 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-lg sm:rounded-xl transition-all duration-300 transform group-hover:scale-110 group-hover:rotate-3 shadow-sm group-hover:shadow-md flex-shrink-0">
								<svg class="w-4 h-4 sm:w-7 sm:h-7 text-emerald-700 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
							</svg>
						</div>
					</div>
				</div>
				<div role="button" tabindex="0" on:keydown={(e) => (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') && handleCardClick('appointments', 'today')} class="bg-white rounded-lg sm:rounded-2xl shadow-md p-2 sm:p-6 border border-purple-100 transition-all transform hover:shadow-xl hover:scale-105 hover:-translate-y-2 cursor-pointer group hover:border-purple-200" on:click={() => handleCardClick('appointments', 'today')}>
					<div class="flex items-center justify-between gap-2">
						<div class="min-w-0">
							<p class="text-xs sm:text-sm font-semibold text-gray-600 uppercase tracking-tight">Today's Appointments</p>
							<h3 class="text-lg sm:text-3xl font-bold bg-gradient-to-r from-purple-600 to-violet-600 bg-clip-text text-transparent mt-1 sm:mt-2">{stats.todaysAppointments}</h3>
						</div>
							<div class="p-2 sm:p-4 bg-gradient-to-br from-purple-100 to-violet-100 rounded-lg sm:rounded-xl transition-all duration-300 transform group-hover:scale-110 group-hover:rotate-3 shadow-sm group-hover:shadow-md flex-shrink-0">
								<svg class="w-4 h-4 sm:w-7 sm:h-7 text-purple-700 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3" />
							</svg>
						</div>
					</div>
				</div>
				<div role="button" tabindex="0" on:keydown={(e) => (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') && handleCardClick('patients')} class="bg-white rounded-lg sm:rounded-2xl shadow-md p-2 sm:p-6 border border-amber-100 transition-all transform hover:shadow-xl hover:scale-105 hover:-translate-y-2 cursor-pointer group hover:border-amber-200" on:click={() => handleCardClick('patients')}>
					<div class="flex items-center justify-between gap-2">
						<div class="min-w-0">
							<p class="text-xs sm:text-sm font-semibold text-gray-600 uppercase tracking-tight">Total Members</p>
							<h3 class="text-lg sm:text-3xl font-bold bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent mt-1 sm:mt-2">{stats.totalPatients}</h3>
						</div>
							<div class="p-2 sm:p-4 bg-gradient-to-br from-amber-100 to-orange-100 rounded-lg sm:rounded-xl transition-all duration-300 transform group-hover:scale-110 group-hover:rotate-3 shadow-sm group-hover:shadow-md flex-shrink-0">
								<svg class="w-4 h-4 sm:w-7 sm:h-7 text-amber-600 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
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
						<div class="flex flex-col gap-2">
						<!-- Date Range on Mobile, Status/Sort on Desktop -->
						<div class="flex flex-col sm:flex-row gap-2 order-first sm:order-last">
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
								<option value="cancellation_requested">Cancellation Requested</option>
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
						<!-- Date Range First on Mobile -->
						<div class="flex flex-col gap-2 order-last sm:order-first">
							<div class="flex flex-col sm:flex-row gap-2 sm:items-end">
								<div class="flex-1">
									<label for="appt-filter-start" class="block text-xs font-semibold text-gray-600 mb-1">From</label>
									<input id="appt-filter-start" type="date" bind:value={appointmentFilterStartDate} class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500" placeholder="MM/DD/YYYY" aria-label="Filter appointments from date" />
								</div>
								<div class="flex-1">
									<label for="appt-filter-end" class="block text-xs font-semibold text-gray-600 mb-1">To</label>
									<input id="appt-filter-end" type="date" bind:value={appointmentFilterEndDate} class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500" placeholder="MM/DD/YYYY" aria-label="Filter appointments to date" />
								</div>
							</div>
							{#if appointmentFilterStartDate || appointmentFilterEndDate}
								<button type="button" on:click={() => { appointmentFilterStartDate = ''; appointmentFilterEndDate = ''; }} class="bg-gray-300 hover:bg-gray-400 text-gray-800 px-2 py-1.5 sm:py-2 rounded text-xs font-semibold w-full sm:w-auto">Clear</button>
							{/if}
						</div>
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
												<button class="text-left text-blue-600 hover:underline truncate max-w-[120px] sm:max-w-none member-name-clickable" on:click={() => viewPatientDetails(appointment.patientId)}>{appointment.patientName}</button>
											</td>
											<td class="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-500 whitespace-nowrap">{appointment.date}</td>
											<td class="px-2 sm:px-4 py-2 sm:py-3">
												<span class="px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs font-medium rounded-full whitespace-nowrap
													{appointment.status && appointment.status.toLowerCase().includes('completed') ? 'bg-green-100 text-green-800' :
													appointment.status && appointment.status.toLowerCase().includes('pending') ? 'bg-yellow-100 text-yellow-800' :
													appointment.status && appointment.status.toLowerCase().includes('accepted') ? 'bg-blue-100 text-blue-800' :
													appointment.status && appointment.status.toLowerCase().includes('missed') ? 'bg-red-100 text-red-800' :
													appointment.status && appointment.status.toLowerCase().includes('declined') ? 'bg-gray-200 text-gray-800' :
													appointment.status && appointment.status.toLowerCase().includes('cancellationrequest') ? 'bg-orange-100 text-orange-800' :
													appointment.status && appointment.status.toLowerCase().includes('cancelled') ? 'bg-red-200 text-red-900' :
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
													<button class="text-left text-blue-600 hover:underline truncate max-w-[100px] sm:max-w-none member-name-clickable" on:click={() => viewPatientDetails(patient.id)}>
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
					{openTable === 'appointments' ? (appointmentViewMode === 'today' ? "Today's Appointments" : 'All Appointments') :
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
                    <!-- Search Bar (Top) -->
                    <div class="relative w-full">
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

                    <!-- Date Range Filters (Middle) -->
                    <div class="flex flex-col gap-3 w-full">
                        <div class="text-xs font-semibold text-gray-600 uppercase">Date Range</div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                            <div>
                                <!-- svelte-ignore a11y_label_has_associated_control -->
                                <label for="aptFilterStartDate" class="block text-xs font-medium text-gray-600 mb-2">From</label>
                                <input id="aptFilterStartDate" type="date" bind:value={appointmentFilterStartDate} placeholder="mm/dd/yyyy" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500" aria-label="Filter appointments from date" />
                            </div>
                            <div>
                                <!-- svelte-ignore a11y_label_has_associated_control -->
                                <label for="aptFilterEndDate" class="block text-xs font-medium text-gray-600 mb-2">To</label>
                                <input id="aptFilterEndDate" type="date" bind:value={appointmentFilterEndDate} placeholder="mm/dd/yyyy" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500" aria-label="Filter appointments to date" />
                            </div>
                        </div>
                        {#if appointmentFilterStartDate || appointmentFilterEndDate}
                            <button type="button" on:click={() => { appointmentFilterStartDate = ''; appointmentFilterEndDate = ''; }} class="bg-gray-300 hover:bg-gray-400 text-gray-800 px-3 py-2 rounded text-sm font-semibold whitespace-nowrap w-fit">Clear Dates</button>
                        {/if}
                    </div>

                    <!-- Status and Sort Dropdowns (Below) -->
                    <div class="flex flex-wrap gap-2 w-full">
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
                            <option value="cancellation_requested">Cancellation Requested</option>
                            <option value="cancelled">Cancelled</option>
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
                            {#if (appointmentViewMode === 'today' ? todaysAppointmentsFiltered : filteredAppointments).length}
                            {#each (appointmentViewMode === 'today' ? todaysAppointmentsFiltered : filteredAppointments) as appointment}
										<tr class="hover:bg-gray-50 transition-colors duration-150 group">
									<td class="px-4 py-3 text-sm text-gray-900">
										<button class="text-left text-blue-600 hover:underline member-name-clickable" on:click={() => viewPatientDetails(appointment.patientId)}>{appointment.patientName}</button>
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
                                            appointment.status && appointment.status.toLowerCase().includes('cancellation') ? 'bg-orange-100 text-orange-800' :
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
                                <option value="date-asc">Date Registered (Oldest)</option>
                                <option value="date-desc">Date Registered (Newest)</option>
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
										<button class="text-left text-blue-600 hover:underline member-name-clickable" on:click={() => viewPatientDetails(patient.id)}>{patient.name} {patient.lastName}</button>
									</td>
                                    <td class="px-4 py-3 text-sm text-gray-500">{patient.age && patient.age > 0 ? patient.age : 'N/A'}</td>
                                    <td class="px-4 py-3 text-sm text-gray-500">{patient.gender && patient.gender.trim() ? patient.gender : 'N/A'}</td>
                                    <td class="px-4 py-3 text-sm text-gray-500">{patient.phone}</td>
                                    <td class="px-4 py-3 text-sm text-gray-500">{formatDateDisplay(patient.registrationDate)}</td>
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
                                <option value="cancellation_requested">Cancellation Requested</option>
                                <option value="cancelled">Cancelled</option>
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
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                            <div>
                                <!-- svelte-ignore a11y_label_has_associated_control -->
                                <label for="monthlyFilterStartDate" class="block text-xs font-medium text-gray-600 mb-2">From</label>
                                <input id="monthlyFilterStartDate" type="date" bind:value={appointmentFilterStartDate} placeholder="mm/dd/yyyy" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500" aria-label="Filter monthly appointments from date" />
                            </div>
                            <div>
                                <!-- svelte-ignore a11y_label_has_associated_control -->
                                <label for="monthlyFilterEndDate" class="block text-xs font-medium text-gray-600 mb-2">To</label>
                                <input id="monthlyFilterEndDate" type="date" bind:value={appointmentFilterEndDate} placeholder="mm/dd/yyyy" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500" aria-label="Filter monthly appointments to date" />
                            </div>
                        </div>
                        {#if appointmentFilterStartDate || appointmentFilterEndDate}
                            <button type="button" on:click={() => { appointmentFilterStartDate = ''; appointmentFilterEndDate = ''; }} class="bg-gray-300 hover:bg-gray-400 text-gray-800 px-3 py-2 rounded text-sm font-semibold whitespace-nowrap w-fit">Clear Dates</button>
                        {/if}
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
										<button class="text-left text-blue-600 hover:underline member-name-clickable" on:click={() => viewPatientDetails(appointment.patientId)}>{appointment.patientName}</button>
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
                                            appointment.status && appointment.status.toLowerCase().includes('cancellationrequest') ? 'bg-orange-100 text-orange-800' :
                                            appointment.status && appointment.status.toLowerCase().includes('cancelled') ? 'bg-red-200 text-red-900' :
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

{#if showPatientDetailsModal && selectedPatient}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 flex items-center justify-center z-50 p-4 bg-black bg-opacity-50" on:click={closePatientDetailsModal} transition:fade={{ duration: 300 }}>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="relative bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl" on:click|stopPropagation transition:scale={{ duration: 300, start: 0.9, opacity: 0 }}>
			<!-- Header -->
			<div class="sticky top-0 text-white px-6 py-4 rounded-t-2xl flex justify-between items-center z-10" style="background-color: #1e3a66;">
				<h2 class="text-xl font-bold">Member Information</h2>
				<button
					on:click={closePatientDetailsModal}
					class="text-white hover:text-gray-200 transition-colors"
					aria-label="Close member details"
				>
					<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<div class="p-6">
				<!-- Profile Section -->
				<div class="flex items-center gap-6 mb-6 pb-6 border-b-2 border-gray-100">
					<div class="flex-shrink-0">
						{#if selectedPatient.profileImage}
							<img src={selectedPatient.profileImage} alt="Profile" class="w-24 h-24 rounded-full object-cover border-4 border-blue-200 shadow-lg profile-image-animated" />
						{:else}
							<div class="w-24 h-24 rounded-full text-white flex items-center justify-center text-2xl font-bold border-4 border-blue-200 shadow-lg profile-image-animated" style="background-color: #1e3a66;">
								{selectedPatient.name?.charAt(0).toUpperCase()}{selectedPatient.lastName?.charAt(0).toUpperCase()}
							</div>
						{/if}
					</div>
					<div class="flex-grow">
						<h3 class="text-2xl font-bold text-gray-800">
							{[selectedPatient.name, selectedPatient.middleName, selectedPatient.lastName, selectedPatient.suffix].filter(Boolean).join(' ')}
						</h3>
						<p class="text-gray-600 mt-1">Member ID: {selectedPatient.displayId || selectedPatient.id}</p>
						<div class="mt-2">
							<span class="status-pill {selectedPatient.status === 'inactive' ? 'inactive' : 'active'}">
								{selectedPatient.status === 'inactive' ? 'Inactive' : 'Active'}
							</span>
						</div>
					</div>
				</div>

				<!-- Personal Information -->
				<div class="mb-6">
					<h4 class="text-lg font-bold text-blue-900 mb-3 pb-2 border-b-2 border-blue-100 section-title-animated">Personal Information</h4>
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div class="info-item-dash">
							<span class="info-label-dash">Age:</span>
							<span class="info-value-dash">{selectedPatient.age || 'N/A'}</span>
						</div>
						<div class="info-item-dash">
							<span class="info-label-dash">Birthday:</span>
							<span class="info-value-dash">{formatDateDisplay(selectedPatient.birthday)}</span>
						</div>
						<div class="info-item-dash">
							<span class="info-label-dash">Gender:</span>
							<span class="info-value-dash">{selectedPatient.gender || 'N/A'}</span>
						</div>
						<div class="info-item-dash">
							<span class="info-label-dash">Phone:</span>
							{#if selectedPatient.phone && selectedPatient.phone !== 'N/A'}
								<div class="flex items-center gap-2">
									<a href="tel:{selectedPatient.phone}" class="info-value-dash text-blue-600 hover:text-blue-800 hover:underline cursor-pointer transition-colors">
										{selectedPatient.phone}
									</a>
									<a href="tel:{selectedPatient.phone}" class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 hover:bg-blue-200 transition-colors" title="Call phone number" aria-label="Call {selectedPatient.phone}">
										<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
										</svg>
									</a>
								</div>
							{:else}
								<span class="info-value-dash">N/A</span>
							{/if}
						</div>
						<div class="info-item-dash col-span-full">
							<span class="info-label-dash">Email:</span>
							<span class="info-value-dash">{selectedPatient.email || 'N/A'}</span>
						</div>
						<div class="info-item-dash">
							<span class="info-label-dash">Registered:</span>
							<span class="info-value-dash">{formatDateDisplay(selectedPatient.registrationDate)}</span>
						</div>
						<div class="info-item-dash">
							<span class="info-label-dash">Status:</span>
							<span class="info-value-dash">{selectedPatient.status === 'inactive' ? 'Inactive' : 'Active'}</span>
						</div>
					</div>
				</div>

				<!-- Medical Information -->
				<div class="mb-6">
					<h4 class="text-lg font-bold text-blue-900 mb-3 pb-2 border-b-2 border-blue-100 section-title-animated">Medical Information</h4>
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div class="info-item-dash">
							<span class="info-label-dash">Blood Type:</span>
							<span class="info-value-dash">{selectedPatient.bloodType || 'Not specified'}</span>
						</div>
						<div class="info-item-dash col-span-full">
							<span class="info-label-dash">Allergies:</span>
							<span class="info-value-dash">{selectedPatient.allergies || 'None reported'}</span>
						</div>
						<div class="info-item-dash col-span-full">
							<span class="info-label-dash">Current Medications:</span>
							<span class="info-value-dash">{selectedPatient.currentMedications || 'None reported'}</span>
						</div>
					</div>
				</div>

			<!-- Medical Conditions -->
			{#if selectedPatient.medicalConditions && Object.keys(selectedPatient.medicalConditions).length > 0}
				{@const conditions = getCheckedConditionsDisplay(selectedPatient.medicalConditions)}
				{#if conditions.length > 0}
					<div class="mb-6">
						<h4 class="text-lg font-bold text-blue-900 mb-3 pb-2 border-b-2 border-blue-100 section-title-animated">Medical Conditions</h4>
						<div class="flex flex-wrap gap-2">
							{#each conditions as condition}
								<span class="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium badge-animated">{condition}</span>
							{/each}
						</div>
					</div>
				{/if}
			{/if}

			<!-- Surgical History -->
			{#if selectedPatient.surgicalHistory && Object.keys(selectedPatient.surgicalHistory).length > 0}
				{@const surgeries = getCheckedConditionsDisplay(selectedPatient.surgicalHistory)}
				{#if surgeries.length > 0}
					<div class="mb-6">
						<h4 class="text-lg font-bold text-blue-900 mb-3 pb-2 border-b-2 border-blue-100 section-title-animated">Surgical History</h4>
						<div class="flex flex-wrap gap-2">
							{#each surgeries as surgery}
								<span class="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-sm font-medium badge-animated">{surgery}</span>
							{/each}
						</div>
					</div>
				{/if}
			{/if}				<!-- Family History -->
				{#if selectedPatient.familyHistory && Object.keys(selectedPatient.familyHistory).length > 0}
					{@const familyItems = getFamilyHistoryDisplay(selectedPatient.familyHistory)}
					{#if familyItems.length > 0}
						<div class="mb-6">
							<h4 class="text-lg font-bold text-blue-900 mb-3 pb-2 border-b-2 border-blue-100">Family History</h4>
							<div class="space-y-2">
								{#each familyItems as item}
									<div class="bg-gray-50 p-3 rounded-lg border-l-4 border-blue-500">
										<strong class="text-gray-800">{item.relative}:</strong>
										<span class="text-gray-700 ml-2">{item.conditions.join(', ')}</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				{/if}

				<!-- Additional Medical Information -->
				{#if selectedPatient.otherMedicalConditions || selectedPatient.otherFamilyHistory || selectedPatient.bloodTransfusionHistory}
					<div class="mb-6">
						<h4 class="text-lg font-bold text-blue-900 mb-3 pb-2 border-b-2 border-blue-100">Additional Medical Information</h4>
						<div class="space-y-3">
							{#if selectedPatient.otherMedicalConditions}
								<div class="info-item-dash">
									<span class="info-label-dash">Other Medical Conditions:</span>
									<span class="info-value-dash">{selectedPatient.otherMedicalConditions}</span>
								</div>
							{/if}
							{#if selectedPatient.otherFamilyHistory}
								<div class="info-item-dash">
									<span class="info-label-dash">Other Family History:</span>
									<span class="info-value-dash">{selectedPatient.otherFamilyHistory}</span>
								</div>
							{/if}
							{#if selectedPatient.bloodTransfusionHistory}
								<div class="info-item-dash">
									<span class="info-label-dash">Blood Transfusion History:</span>
									<span class="info-value-dash">{selectedPatient.bloodTransfusionHistory}</span>
								</div>
							{/if}
							{#if selectedPatient.bloodTransfusionDate}
								<div class="info-item-dash">
									<span class="info-label-dash">Blood Transfusion Date:</span>
									<span class="info-value-dash">{formatDateDisplay(selectedPatient.bloodTransfusionDate)}</span>
								</div>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Action Buttons -->
				<div class="flex justify-end gap-3 pt-4 border-t-2 border-gray-100">
					<button 
						class="px-5 py-2 rounded-lg border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
						on:click={() => { openTable = 'appointments'; closePatientDetailsModal(); }}
					>
						View Appointments
					</button>
					<button 
						class="px-5 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors"
						on:click={closePatientDetailsModal}
					>
						Close
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Reports Modal -->
{#if showReportsModal}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4" transition:fade={{ duration: 200 }}>
		<div class="bg-white rounded-2xl w-full max-w-5xl lg:max-w-6xl max-h-[90vh] overflow-y-auto shadow-2xl" transition:scale={{ duration: 200, start: 0.95 }}>
			<!-- Modal Header -->
			<div class="sticky top-0 bg-gradient-to-r from-yellow-500 to-yellow-600 text-white px-6 py-4 rounded-t-2xl flex justify-between items-center z-10">
				<div class="flex items-center gap-3">
					<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
					</svg>
					<h2 class="text-xl font-bold">Appointment Reports</h2>
				</div>
				<button
					on:click={() => showReportsModal = false}
					class="text-white hover:text-gray-200 transition-colors"
					aria-label="Close reports modal"
				>
					<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Modal Content -->
			<div class="p-3 sm:p-4 md:p-6">
				<!-- Date Range Selector -->
				<div class="bg-gradient-to-r from-yellow-50 to-yellow-50 rounded-lg sm:rounded-xl p-3 sm:p-4 mb-4 sm:mb-6 border border-yellow-100">
					<h3 class="text-xs sm:text-sm font-semibold text-gray-700 mb-4">Select Date Range</h3>
					<div class="space-y-3 sm:space-y-0 sm:flex sm:gap-4 sm:items-end">
						<div class="flex-1">
							<label for="reportStartDate" class="block text-xs font-medium text-gray-600 mb-2">From</label>
							<input
								id="reportStartDate"
								type="date"
								bind:value={reportStartDate}
								placeholder="From date"
								class="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 min-h-[44px]"
								aria-label="Report start date"
							/>
						</div>
						<div class="flex-1">
							<label for="reportEndDate" class="block text-xs font-medium text-gray-600 mb-2">To</label>
							<input
								id="reportEndDate"
								type="date"
								bind:value={reportEndDate}
								placeholder="To date"
								class="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 min-h-[44px]"
								aria-label="Report end date"
							/>
						</div>
						<button
							on:click={generateAppointmentReport}
							disabled={isGeneratingReport}
							class="w-full sm:w-auto bg-gradient-to-r from-yellow-600 to-yellow-600 hover:from-yellow-700 hover:to-yellow-700 disabled:from-yellow-500 disabled:to-yellow-500 text-white px-6 py-3 rounded-lg text-sm font-semibold transition-all shadow-md hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-75 flex items-center justify-center gap-2 min-h-[44px] whitespace-nowrap"
						>
							{#if isGeneratingReport}
								<svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
									<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
									<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
								</svg>
								Generating...
							{:else}
								Generate Report
							{/if}
						</button>
					</div>
					{#if reportValidationError}
						<div class="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4 flex items-start gap-2 sm:gap-3">
							<svg class="w-4 h-4 sm:w-5 sm:h-5 text-red-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
								<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
							</svg>
							<span class="text-sm text-red-700 font-medium">{reportValidationError}</span>
						</div>
					{/if}
				</div>

				<!-- Export Controls -->
				{#if reportData}
					<div class="flex flex-col gap-3 sm:gap-4 mb-4 sm:mb-6 p-3 sm:p-4 bg-blue-50 rounded-lg border border-blue-100">
						<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
							<div class="flex items-center gap-2">
								<label for="exportFormatSelect" class="text-xs sm:text-sm font-semibold text-gray-700 whitespace-nowrap">Export as:</label>
								<select
									id="exportFormatSelect"
									bind:value={exportType}
									class="border border-gray-300 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
								>
									<option value="excel">Excel</option>
									<option value="pdf">PDF</option>
								</select>
							</div>
							<button
								on:click={() => {
									if (reportData) {
										if (exportType === 'pdf') {
											downloadPdfReportWithBreakdown(reportData.appointments, allPatients, reportData.statusBreakdown, reportData.serviceBreakdown);
										} else {
											downloadExcelReportFromReport(reportData.appointments, allPatients, reportData.statusBreakdown, reportData.serviceBreakdown);
										}
									}
								}}
								class="w-full sm:w-fit bg-gradient-to-r from-blue-900 to-indigo-800 hover:from-blue-800 hover:to-indigo-700 text-white px-4 sm:px-5 py-2.5 sm:py-2 rounded-lg text-sm font-semibold transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
							>
								<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
								</svg>
								<span>Download</span>
							</button>
						</div>
						<div class="text-xs sm:text-sm text-gray-700 bg-white rounded p-2 sm:p-3 border border-blue-200">
							{#if exportType === 'pdf'}
								<p class="font-semibold text-blue-900 mb-1">PDF Export includes:</p>
								<ul class="list-disc list-inside space-y-1 text-gray-600">
									<li>Report generation date and timestamp</li>
									<li>Status Breakdown table</li>
									<li>Service Breakdown table</li>
									<li>Filtered appointments data (Patient Name, Date, Time, Service, Status)</li>
									<li>Member information (Name, Age, Birthday, Gender, Phone, Registration Date)</li>
									<li>Professional formatting with color-coded tables</li>
								</ul>
							{:else}
								<p class="font-semibold text-blue-900 mb-1">Excel Export includes:</p>
								<ul class="list-disc list-inside space-y-1 text-gray-600">
									<li><strong>Report Info Sheet:</strong> Generation date and metadata</li>
									<li><strong>Status Breakdown Sheet:</strong> Count of appointments by status</li>
									<li><strong>Service Breakdown Sheet:</strong> Count of appointments by service</li>
									<li><strong>Appointments Sheet:</strong> Filtered appointments within your date range</li>
									<li><strong>Patients Sheet:</strong> Patient details (Name, Age, Gender, Phone, ID, Registration Date)</li>
									<li>Auto-sized columns for easy reading</li>
								</ul>
							{/if}
						</div>
					</div>
				{/if}

				{#if reportData}
					<!-- Summary Statistics -->
					<div class="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4 mb-4 sm:mb-6">
						<div class="bg-white rounded-lg sm:rounded-xl shadow-md p-2 sm:p-4 border border-indigo-100">
							<div class="flex items-center justify-between gap-2">
								<div class="min-w-0">
									<p class="text-xs font-semibold text-gray-600 uppercase tracking-tight">Total</p>
									<h3 class="text-lg sm:text-2xl font-bold text-indigo-700 mt-1">{reportData.totalAppointments}</h3>
								</div>
								<div class="p-2 sm:p-3 bg-indigo-100 rounded-lg flex-shrink-0">
									<svg class="w-4 h-4 sm:w-6 sm:h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
									</svg>
								</div>
							</div>
						</div>

						<div class="bg-white rounded-lg sm:rounded-xl shadow-md p-2 sm:p-4 border border-emerald-100">
							<div class="flex items-center justify-between gap-2">
								<div class="min-w-0">
									<p class="text-xs font-semibold text-gray-600 uppercase tracking-tight">Avg/Day</p>
									<h3 class="text-lg sm:text-2xl font-bold text-emerald-700 mt-1">{reportData.avgPerDay}</h3>
								</div>
								<div class="p-2 sm:p-3 bg-emerald-100 rounded-lg flex-shrink-0">
									<svg class="w-4 h-4 sm:w-6 sm:h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
									</svg>
								</div>
							</div>
						</div>

						<div class="bg-white rounded-lg sm:rounded-xl shadow-md p-2 sm:p-4 border border-purple-100 animate-slideInUp" style="--animation-delay: 0.15s;">
							<div class="flex items-center justify-between gap-2">
								<div class="min-w-0">
									<p class="text-xs font-semibold text-gray-600 uppercase tracking-tight">Common</p>
									<h3 class="text-lg sm:text-2xl font-bold text-purple-700 mt-1 truncate" title={reportData.mostCommonService}>{reportData.mostCommonService}</h3>
								</div>
								<div class="p-2 sm:p-3 bg-purple-100 rounded-lg flex-shrink-0">
									<svg class="w-4 h-4 sm:w-6 sm:h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
									</svg>
								</div>
							</div>
						</div>

						<div class="bg-white rounded-lg sm:rounded-xl shadow-md p-2 sm:p-4 border border-amber-100 animate-slideInUp" style="--animation-delay: 0.2s;">
							<div class="flex items-center justify-between gap-2">
								<div class="min-w-0">
									<p class="text-xs font-semibold text-gray-600 uppercase tracking-tight">Busiest</p>
									<h3 class="text-lg sm:text-2xl font-bold text-amber-700 mt-1 truncate">{reportData.busiestDay}</h3>
								</div>
								<div class="p-2 sm:p-3 bg-amber-100 rounded-lg flex-shrink-0">
									<svg class="w-4 h-4 sm:w-6 sm:h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
									</svg>
								</div>
							</div>
						</div>
					</div>

					<!-- Status Breakdown -->
					<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
						<div class="bg-white rounded-lg sm:rounded-xl shadow-lg p-4 sm:p-6 border border-gray-100">
							<h3 class="text-base sm:text-lg font-bold text-gray-800 mb-3 sm:mb-4 pb-2 border-b-2 border-indigo-100 flex items-center gap-2">
								<svg class="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
								<span class="truncate">Status Breakdown</span>
							</h3>
							<div class="space-y-2 sm:space-y-3">
								{#each Object.entries(reportData.statusBreakdown).sort((a, b) => b[1] - a[1]) as [status, count]}
									<div class="flex flex-col sm:flex-row sm:items-center justify-between p-2 sm:p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors gap-2">
										<div class="flex items-center gap-2 min-w-0">
											<span class="px-2.5 sm:px-3 py-0.5 sm:py-1 text-xs font-medium rounded-full whitespace-nowrap
												{status.includes('completed') ? 'bg-green-100 text-green-800' :
												status.includes('pending') ? 'bg-yellow-100 text-yellow-800' :
												status.includes('accepted') ? 'bg-blue-100 text-blue-800' :
												status.includes('missed') ? 'bg-red-100 text-red-800' :
												status.includes('declined') ? 'bg-gray-200 text-gray-800' :
												status.includes('cancellationrequest') ? 'bg-orange-100 text-orange-800' :
												status.includes('cancelled') ? 'bg-red-200 text-red-900' :
												'bg-gray-300 text-gray-700'}">
												{status.charAt(0).toUpperCase() + status.slice(1)}
											</span>
										</div>
										<div class="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
											<div class="flex-1 sm:w-24 bg-gray-200 rounded-full h-2">
												<div class="bg-gradient-to-r from-purple-600 to-violet-600 h-2 rounded-full transition-all" style="width: {(count / reportData.totalAppointments * 100).toFixed(1)}%"></div>
											</div>
											<span class="text-xs sm:text-sm font-bold text-gray-700 w-8 sm:w-12 text-right flex-shrink-0">{count}</span>
										</div>
									</div>
								{/each}
							</div>
						</div>

						<!-- Service Breakdown -->
						<div class="bg-white rounded-lg sm:rounded-xl shadow-lg p-4 sm:p-6 border border-gray-100">
							<h3 class="text-base sm:text-lg font-bold text-gray-800 mb-3 sm:mb-4 pb-2 border-b-2 border-indigo-100 flex items-center gap-2">
								<svg class="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
								</svg>
								<span class="truncate">Service Breakdown</span>
							</h3>
							<div class="space-y-2 sm:space-y-3 max-h-64 sm:max-h-80 overflow-y-auto">
								{#each Object.entries(reportData.serviceBreakdown).sort((a, b) => b[1] - a[1]) as [service, count]}
									<div class="flex flex-col sm:flex-row sm:items-center justify-between p-2 sm:p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors gap-2">
										<span class="text-xs sm:text-sm font-medium text-gray-700 truncate flex-1" title={service}>{service}</span>
										<div class="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
											<div class="flex-1 sm:w-20 bg-gray-200 rounded-full h-2">
												<div class="bg-gradient-to-r from-indigo-600 to-purple-600 h-2 rounded-full transition-all" style="width: {(count / reportData.totalAppointments * 100).toFixed(1)}%"></div>
											</div>
											<span class="text-xs sm:text-sm font-bold text-gray-700 w-8 text-right flex-shrink-0">{count}</span>
										</div>
									</div>
								{/each}
							</div>
						</div>
					</div>

					<!-- Close Button -->
					<div class="flex justify-end gap-2 sm:gap-3 pt-4 border-t border-gray-200">
						<button
							on:click={() => showReportsModal = false}
							class="px-4 sm:px-6 py-2 rounded-lg border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-colors w-full sm:w-auto"
						>
							Close
						</button>
					</div>
				{:else}
					<div class="text-center py-12 text-gray-500">
						<svg class="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
						</svg>
						<p class="text-lg font-medium">No report generated yet</p>
						<p class="text-sm mt-1">Select a date range and click "Generate Report"</p>
					</div>
				{/if}
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

	.info-item-dash {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		animation: slideInUp 0.5s ease-out forwards;
		opacity: 0;
	}

	.info-item-dash:nth-child(1) { animation-delay: 0.05s; }
	.info-item-dash:nth-child(2) { animation-delay: 0.1s; }
	.info-item-dash:nth-child(3) { animation-delay: 0.15s; }
	.info-item-dash:nth-child(4) { animation-delay: 0.2s; }
	.info-item-dash:nth-child(5) { animation-delay: 0.25s; }
	.info-item-dash:nth-child(6) { animation-delay: 0.3s; }
	.info-item-dash:nth-child(7) { animation-delay: 0.35s; }
	.info-item-dash:nth-child(8) { animation-delay: 0.4s; }

	.info-label-dash {
		font-weight: 600;
		font-size: 0.875rem;
		color: #6b7280;
	}

	.info-value-dash {
		font-size: 0.95rem;
		color: #1f2937;
		word-break: break-word;
	}

	/* Animation Keyframes */
	@keyframes slideInUp {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes fadeInScale {
		from {
			opacity: 0;
			transform: scale(0.8);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	/* Clickable Member Name Animations */
	:global(.member-name-clickable) {
		cursor: pointer;
		transition: all 0.3s ease;
		position: relative;
		display: inline-block;
	}

	:global(.member-name-clickable:hover) {
		color: #2563eb;
		transform: translateX(3px);
	}

	:global(.member-name-clickable:active) {
		transform: scale(0.98);
	}

	/* Profile Image Animation */
	:global(.profile-image-animated) {
		animation: fadeInScale 0.5s ease-out;
	}

	/* Badge Animations */
	:global(.badge-animated) {
		animation: slideInUp 0.4s ease-out forwards;
		opacity: 0;
	}

	:global(.badge-animated:nth-child(1)) { animation-delay: 0.1s; }
	:global(.badge-animated:nth-child(2)) { animation-delay: 0.15s; }
	:global(.badge-animated:nth-child(3)) { animation-delay: 0.2s; }
	:global(.badge-animated:nth-child(4)) { animation-delay: 0.25s; }
	:global(.badge-animated:nth-child(5)) { animation-delay: 0.3s; }
	:global(.badge-animated:nth-child(6)) { animation-delay: 0.35s; }

	/* Section Title Animation */
	:global(.section-title-animated) {
		animation: slideInUp 0.4s ease-out;
	}

	/* Report Generation Animations */
	:global(.animate-slideInUp) {
		animation: slideInUp 0.5s ease-out forwards;
		opacity: 0;
		animation-delay: var(--animation-delay, 0s);
	}
</style>


