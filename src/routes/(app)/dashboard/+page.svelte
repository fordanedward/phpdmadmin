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

		const displayLabels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
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
    pdfDoc.text(`Generated on: ${reportDate}`, pdfDoc.internal.pageSize.getWidth() / 2, currentY, { align: 'center' });
    currentY += 10; // Add more space before the first table

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
            head: [['Patient Name', 'Date', 'Time', 'Service', 'Subservice', 'Status']],
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
            head: [['Name', 'Age', 'Birthday', 'Gender', 'Phone']],
            body: patientsData.map(p => [
                `${p.name} ${p.lastName}`.trim(),
                p.age ?? 'N/A',
                p.birthday || 'N/A',
                p.gender || 'N/A',
                p.phone || 'N/A'
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
      'Date': appt.date || 'N/A',
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
	<div class="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
		<div class="container mx-auto px-4 py-8">
			<!-- Header Section -->
			<div class="mb-8">
				<div class="flex justify-between items-center">
					<div>
						<h1 class="text-3xl font-bold text-gray-800">Dashboard</h1>
						<p class="text-gray-600 mt-2">Welcome to your dental clinic dashboard</p>
					</div>
					<div class="flex items-center gap-4">
						<div class="flex items-center gap-2">
							<label for="exportTypeSelect" class="text-sm font-medium text-gray-600">Export Format:</label>
							<select
								id="exportTypeSelect"
								bind:value={exportType}
								class="border border-gray-300 rounded px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
							>
								<option value="excel">Excel</option>
							</select>
						</div>
						<button
							on:click={generateReport}
							aria-label="Generate report"
							class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
						>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
							</svg>
							
						</button>
					</div>
				</div>
			</div>

			<!-- Stats Cards -->
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
				<div role="button" tabindex="0" on:keydown={(e) => (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') && handleCardClick('monthlyAppointments')} class="bg-white rounded-xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow cursor-pointer" on:click={() => handleCardClick('monthlyAppointments')}>
					<div class="flex items-center justify-between">
						<div>
							<p class="text-sm font-medium text-gray-600">This Month's Appointments</p>
							<h3 class="text-2xl font-bold text-gray-800 mt-2">{stats.monthlyAppointments}</h3>
						</div>
						<div class="p-3 bg-blue-50 rounded-lg">
							<svg class="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
							</svg>
						</div>
					</div>
				</div>
				<div role="button" tabindex="0" on:keydown={(e) => (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') && handleCardClick('appointments')} class="bg-white rounded-xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow cursor-pointer" on:click={() => handleCardClick('appointments')}>
					<div class="flex items-center justify-between">
						<div>
							<p class="text-sm font-medium text-gray-600">Total Appointments</p>
							<h3 class="text-2xl font-bold text-gray-800 mt-2">{stats.newAppointments}</h3>
						</div>
						<div class="p-3 bg-green-50 rounded-lg">
							<svg class="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
							</svg>
						</div>
					</div>
				</div>
				<div role="button" tabindex="0" on:keydown={(e) => (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') && handleCardClick('appointments')} class="bg-white rounded-xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow cursor-pointer" on:click={() => handleCardClick('appointments')}>
					<div class="flex items-center justify-between">
						<div>
							<p class="text-sm font-medium text-gray-600">Today's Appointments</p>
							<h3 class="text-2xl font-bold text-gray-800 mt-2">{stats.todaysAppointments}</h3>
						</div>
						<div class="p-3 bg-purple-50 rounded-lg">
							<svg class="w-6 h-6 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3" />
							</svg>
						</div>
					</div>
				</div>
				<div role="button" tabindex="0" on:keydown={(e) => (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') && handleCardClick('patients')} class="bg-white rounded-xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow cursor-pointer" on:click={() => handleCardClick('patients')}>
					<div class="flex items-center justify-between">
						<div>
							<p class="text-sm font-medium text-gray-600">Total Members</p>
							<h3 class="text-2xl font-bold text-gray-800 mt-2">{stats.totalPatients}</h3>
						</div>
						<div class="p-3 bg-orange-50 rounded-lg">
							<svg class="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
							</svg>
						</div>
					</div>
				</div>
			</div>

			<!-- Enhanced Patient Analytics Cards -->
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
				<div class="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
					<div class="flex items-center justify-between">
						<div>
							<p class="text-sm font-medium text-gray-600">New Members This Month</p>
							<h3 class="text-2xl font-bold text-gray-800 mt-2">{stats.newPatientsThisMonth}</h3>
						</div>
						<div class="p-3 bg-emerald-50 rounded-lg">
							<svg class="w-6 h-6 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
							</svg>
						</div>
					</div>
				</div>





				<div class="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
					<div class="flex items-center justify-between">
						<div>
							<p class="text-sm font-medium text-gray-600">Active Members</p>
							<h3 class="text-2xl font-bold text-gray-800 mt-2">{stats.activePatients}</h3>
						</div>
						<div class="p-3 bg-teal-50 rounded-lg">
							<svg class="w-6 h-6 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
						</div>
					</div>
				</div>
			</div>

			<!-- Charts Section -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
				<div class="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
					<h3 class="text-lg font-semibold text-gray-800 mb-4">Appointment Trends</h3>
					<div class="h-80">
						<canvas id="lineChart"></canvas>
					</div>
				</div>

				<div class="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
					<h3 class="text-lg font-semibold text-gray-800 mb-4">Weekly Appointments</h3>
					<div class="h-80">
						<canvas id="weeklyAppointmentsBarChart"></canvas>
					</div>
				</div>

				<div class="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
					<h3 class="text-lg font-semibold text-gray-800 mb-4">Appointment Status</h3>
					<div class="h-80">
						<canvas id="appointmentStatusPieChart"></canvas>
					</div>
				</div>

				<div class="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
					<h3 class="text-lg font-semibold text-gray-800 mb-4">Gender Distribution</h3>
					<div class="h-80">
						<canvas id="genderDistributionDoughnutChart"></canvas>
					</div>
				</div>

				<div class="bg-white rounded-xl shadow-sm p-6 border border-gray-100 lg:col-span-2">
					<h3 class="text-lg font-semibold text-gray-800 mb-4">Completed vs Missed Appointments</h3>
					<div class="h-80">
						<canvas id="completedMissedLineChart"></canvas>
					</div>
				</div>
			</div>

			<!-- Patient Analytics Section -->
			<div class="mb-8">
				<h2 class="text-2xl font-bold text-gray-800 mb-6">Patient Analytics</h2>
				<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
					<div class="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
						<h3 class="text-lg font-semibold text-gray-800 mb-4">Patient Growth Over Time</h3>
						<div class="h-80">
							<canvas id="patientGrowthChart"></canvas>
						</div>
					</div>

					<div class="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
						<h3 class="text-lg font-semibold text-gray-800 mb-4">Patient Age Distribution</h3>
						<div class="h-80">
							<canvas id="patientAgeDistributionChart"></canvas>
						</div>
					</div>

					<div class="bg-white rounded-xl shadow-sm p-6 border border-gray-100 lg:col-span-2">
						<h3 class="text-lg font-semibold text-gray-800 mb-4">New Patient Registrations (Last 12 Months)</h3>
						<div class="h-80">
							<canvas id="patientRegistrationChart"></canvas>
						</div>
					</div>
				</div>
			</div>

			<!-- Data Tables Section -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<div class="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
					<div class="flex justify-between items-center mb-4">
						<h3 class="text-lg font-semibold text-gray-800">Recent Appointments</h3>
						<button
							class="text-sm text-blue-600 hover:text-blue-800"
							on:click={() => handleOpenTable('appointments')}
						>
							View All
						</button>
					</div>
					<div class="overflow-x-auto">
						<table class="min-w-full divide-y divide-gray-200">
							<thead>
								<tr>
									<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Patient</th>
									<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
									<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-200">
								{#each allAppointments.slice(0, 5) as appointment}
									<tr class="hover:bg-gray-50">
										<td class="px-4 py-3 text-sm text-gray-900">
											<button class="text-left text-blue-600 hover:underline" on:click={() => viewPatientDetails(appointment.patientId)}>{appointment.patientName}</button>
										</td>
										<td class="px-4 py-3 text-sm text-gray-500">{appointment.date}</td>
										<td class="px-4 py-3">
											<span class="px-2 py-1 text-xs font-medium rounded-full
												{appointment.status && appointment.status.toLowerCase().includes('completed') ? 'bg-green-100 text-green-800' :
												appointment.status && appointment.status.toLowerCase().includes('pending') ? 'bg-yellow-100 text-yellow-800' :
												appointment.status && appointment.status.toLowerCase().includes('accepted') ? 'bg-blue-100 text-blue-800' :
												appointment.status && appointment.status.toLowerCase().includes('missed') ? 'bg-red-100 text-red-800' :
												'bg-gray-300 text-gray-700'}">
												{appointment.status}
											</span>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>

				<div class="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
					<div class="flex justify-between items-center mb-4">
						<h3 class="text-lg font-semibold text-gray-800">Recent Members</h3>
						<button
							class="text-sm text-blue-600 hover:text-blue-800"
							on:click={() => handleOpenTable('patients')}
						>
							View All
						</button>
					</div>
					<div class="overflow-x-auto">
						<table class="min-w-full divide-y divide-gray-200">
							<thead>
								<tr>
									<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Patient</th>
									<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Registered</th>
									<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
									<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-200">
								{#each allPatients.slice(0, 5) as patient}
									<tr class="hover:bg-gray-50">
										<td class="px-4 py-3 text-sm text-gray-900">
											<div class="member-cell">
												<div class="initials-circle" aria-hidden="true">{getPatientInitials(patient)}</div>
												<button class="text-left text-blue-600 hover:underline" on:click={() => viewPatientDetails(patient.id)}>
													{patient.name} {patient.lastName}
												</button>
											</div>
										</td>
										<td class="px-4 py-3 text-sm text-gray-500">{patient.registrationDate}</td>
										<td class="px-4 py-3 text-sm text-gray-500">{patient.phone}</td>
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
							</tbody>
						</table>
					</div>
				</div>
			</div>
		</div>
	</div>

<!-- Full Table Views -->
{#if openTable}
    <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg p-6 w-11/12 max-w-6xl max-h-[90vh] overflow-auto">
            <div class="flex justify-between items-center mb-4">
				<h2 class="text-xl font-bold text-gray-800">
					{openTable === 'appointments' ? 'All Appointments' :
					 openTable === 'patients' ? 'All Members' :
					 'Monthly Appointments'}
				</h2>
				<button
					aria-label="Close table dialog"
					class="text-gray-500 hover:text-gray-700"
					on:click={() => openTable = null}
				>
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {#if openTable === 'appointments'}
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
                            {#each allAppointments as appointment}
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
                                            'bg-gray-300 text-gray-700'}">
                                            {appointment.status}
                                        </span>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            {:else if openTable === 'patients'}
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
                            {#each allPatients as patient}
								<tr class="hover:bg-gray-50">
									<td class="px-4 py-3 text-sm text-gray-900">
										<button class="text-left text-blue-600 hover:underline" on:click={() => viewPatientDetails(patient.id)}>{patient.name} {patient.lastName}</button>
									</td>
                                    <td class="px-4 py-3 text-sm text-gray-500">{patient.age}</td>
                                    <td class="px-4 py-3 text-sm text-gray-500">{patient.gender}</td>
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
                        </tbody>
                    </table>
                </div>
            
            {:else if openTable === 'monthlyAppointments'}
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
                            {#each monthlyAppointmentsData as appointment}
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
                                            'bg-gray-300 text-gray-700'}">
                                            {appointment.status}
                                        </span>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
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
		background: linear-gradient(135deg, #2563eb, #7c3aed);
		color: #fff;
		font-weight: 600;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		text-transform: uppercase;
		letter-spacing: 0.03em;
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


