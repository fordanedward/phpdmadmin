<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';

	// Firebase and Data Libraries
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
	// Import autoTable - this module modifies the jsPDF prototype when imported
	import autoTable from 'jspdf-autotable';
	// Import the UserOptions type for type safety
	import type { UserOptions } from 'jspdf-autotable';
	import Chart from 'chart.js/auto';

	// Components



	// --- Constants ---
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
		// Handle initialization error appropriately
	}

	// --- Interfaces ---
	interface Patient {
		id: string;
		name: string;
		lastName: string;
		age?: number;
		birthday?: string;
		gender?: string;
		phone?: string;
		registrationDate?: string;
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
		createdAt?: Timestamp | Date;
	}

	interface Stats {
		newAppointments: number;
		totalPatients: number;
		todaysPatients: number;
		todaysAppointments: number;
		todaysPrescriptions: number;
		totalPrescriptions: number;
		monthlyAppointments: number;
	}

	interface DailyAppointmentCount {
		day: string;
		count: number;
	}

	// --- Component State ---
	let isCollapsed = false;
	let stats: Stats = {
		newAppointments: 0, totalPatients: 0, todaysPatients: 0, todaysAppointments: 0,
		todaysPrescriptions: 0, totalPrescriptions: 0, monthlyAppointments: 0
	};

	let allAppointments: Appointment[] = [];
	let allPatients: Patient[] = [];
	let allPrescriptions: Prescription[] = [];
	let monthlyAppointmentsData: Appointment[] = [];

	let openTable: 'patients' | 'appointments' | 'prescriptions' | 'monthlyAppointments' | null = null;
	let exportType: 'excel' | 'pdf' = 'excel';
	let selectedYear = CURRENT_YEAR;
	let selectedMonth = new Date().getMonth() + 1;

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
	let weeklyAppointmentCounts: DailyAppointmentCount[] = []; // Populated later

	let patientMap = new Map<string, Patient>();

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
			const snapshot = await getDocs(collection(db, FIRESTORE_COLLECTIONS.PATIENTS));
			const patients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Patient));
			patientMap.clear();
			patients.forEach(p => patientMap.set(p.id, p));
			console.log(`Fetched ${patients.length} patients.`);
			return patients;
		} catch (error) {
			console.error("Error fetching patients:", error);
			return [];
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

	async function fetchAllPrescriptions(): Promise<Prescription[]> {
		console.log("Fetching all prescriptions...");
		try {
			const snapshot = await getDocs(collection(db, FIRESTORE_COLLECTIONS.PRESCRIPTIONS));
			 // Ensure appointments are fetched first to get patient details
			if (allAppointments.length === 0) {
				 console.warn("Appointments not fetched yet, fetching them now for prescription mapping.");
				 allAppointments = await fetchAllAppointments(); // Fetch if not already available
			}
			const appointmentMap = new Map(allAppointments.map(a => [a.id, a]));

			const prescriptions = snapshot.docs.map(doc => {
				const data = doc.data();
				const appointment = appointmentMap.get(data.appointmentId);
				return {
					id: doc.id,
					appointmentId: data.appointmentId || 'N/A',
					patientId: appointment?.patientId,
					patientName: appointment ? getPatientName(appointment.patientId) : 'Unknown (Appt. Missing)',
					prescriber: data.prescriber || 'N/A',
					medicines: data.medicines || [],
					date: data.date || 'N/A',
					createdAt: data.createdAt,
				} as Prescription;
			});
			console.log(`Fetched ${prescriptions.length} prescriptions.`);
			return prescriptions;
		} catch (error) {
			console.error("Error fetching prescriptions:", error);
			return [];
		}
	}

	async function fetchDashboardStats(): Promise<Stats> {
		console.log("Fetching dashboard stats...");
		const today = getTodayString();
		const currentMonth = new Date().getMonth() + 1;
		const currentYear = new Date().getFullYear();
		const statsResult: Stats = {
			newAppointments: 0, totalPatients: 0, todaysPatients: 0, todaysAppointments: 0,
			todaysPrescriptions: 0, totalPrescriptions: 0, monthlyAppointments: 0,
		};
		try {
			 // Ensure data is available, fetch if not
			 if (!allPatients.length) allPatients = await fetchAllPatients();
			 if (!allAppointments.length) allAppointments = await fetchAllAppointments();
			 if (!allPrescriptions.length) allPrescriptions = await fetchAllPrescriptions();

			statsResult.totalPatients = allPatients.length;
			statsResult.newAppointments = allAppointments.length;
			statsResult.totalPrescriptions = allPrescriptions.length;

			statsResult.todaysPatients = allPatients.filter(p => p.registrationDate === today).length;
			statsResult.todaysAppointments = allAppointments.filter(a => a.date === today).length;
			statsResult.todaysPrescriptions = allPrescriptions.filter(p => p.date === today).length;

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
				{ label: 'Cumulative Patients (Registered This Month)', data: lineChartTotalPatientsData, borderColor: '#f44336', backgroundColor: 'rgba(244, 67, 54, 0.2)', tension: 0.3, fill: true }
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
		if (!canvas) { console.error('Appointment status pie chart canvas not found.'); return; }

		if (!allAppointments.length) allAppointments = await fetchAllAppointments();

		const statusCounts = { completed: 0, pending: 0, missed: 0, other: 0 };
		allAppointments.forEach(a => {
			const status = (a.status || '').toLowerCase();
			if (status === 'completed') statusCounts.completed++;
			else if (status === 'pending') statusCounts.pending++;
			else if (status === 'missed') statusCounts.missed++;
			else statusCounts.other++;
		});

		const pieData = {
			labels: ['Completed', 'Pending', 'Missed', 'Other'],
			datasets: [{ data: [statusCounts.completed, statusCounts.pending, statusCounts.missed, statusCounts.other], backgroundColor: ['#4caf50', '#ff9800', '#f44336', '#9e9e9e'] }]
		};

		if (appointmentStatusChartInstance) appointmentStatusChartInstance.destroy();
		appointmentStatusChartInstance = new Chart(canvas, { type: 'pie', data: pieData, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } });
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

	// --- Report Generation ---
	async function generateReport(): Promise<void> {
		console.log('Generating report...');
		try {
			 // Ensure data is loaded concurrently
			await Promise.all([
				allPatients.length === 0 ? fetchAllPatients().then(data => allPatients = data) : Promise.resolve(),
				allAppointments.length === 0 ? fetchAllAppointments().then(data => allAppointments = data) : Promise.resolve(),
				allPrescriptions.length === 0 ? fetchAllPrescriptions().then(data => allPrescriptions = data) : Promise.resolve()
			]);

			console.log('Data ready for report generation.');
			 if (exportType === 'pdf') {
				downloadPdfReport(allAppointments, allPatients, allPrescriptions);
			} else {
				downloadExcelReport(allAppointments, allPatients, allPrescriptions);
			}
		} catch (error) {
			console.error('Failed to fetch data for report:', error);
			alert('Error generating report. Failed to fetch required data.');
		}
	}

	function downloadPdfReport(appointmentsData: Appointment[], patientsData: Patient[], prescriptionsData: Prescription[]): void {
		console.log('Generating PDF Report...');
		const pdfDoc = new jsPDF();
		let currentY = 20;

		pdfDoc.setFontSize(16); pdfDoc.setFont('helvetica', 'bold');
		pdfDoc.text('Data Report Summary', pdfDoc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });

		// Prescriptions
		if (prescriptionsData.length > 0) {
			pdfDoc.setFontSize(12); pdfDoc.setFont('helvetica', 'bold'); pdfDoc.text('Prescriptions', 10, currentY); currentY += 7;
			const body = prescriptionsData.flatMap(pres => pres.medicines.map(med => [ pres.patientName || 'Unknown', med.medicine || 'N/A', med.dosage || 'N/A', med.instructions || 'N/A', pres.prescriber || 'N/A' ]));
			if (body.length > 0) {
				pdfDoc.autoTable({ head: [['Patient Name', 'Medicine', 'Dosage', 'Instructions', 'Prescriber']], body: body, startY: currentY, theme: 'striped', headStyles: { fillColor: [41, 128, 185], textColor: 255 } });
				currentY = pdfDoc.lastAutoTable.finalY + 10;
			} else { currentY += 5; }
		}

		// Appointments
		if (appointmentsData.length > 0) {
			pdfDoc.setFontSize(12); pdfDoc.setFont('helvetica', 'bold'); pdfDoc.text('Appointments', 10, currentY); currentY += 7;
			pdfDoc.autoTable({ head: [['Patient Name', 'Date', 'Time', 'Service', 'Subservice', 'Status']], body: appointmentsData.map(appt => [ appt.patientName || 'Unknown', appt.date || 'N/A', appt.time || 'N/A', appt.service || 'N/A', appt.subServices?.join(', ') || 'N/A', appt.status || 'N/A' ]), startY: currentY, theme: 'grid', headStyles: { fillColor: [39, 174, 96], textColor: 255 } });
			currentY = pdfDoc.lastAutoTable.finalY + 10;
		}

		// Patients
		if (patientsData.length > 0) {
			pdfDoc.setFontSize(12); pdfDoc.setFont('helvetica', 'bold'); pdfDoc.text('Patients', 10, currentY); currentY += 7;
			pdfDoc.autoTable({ head: [['Name', 'Age', 'Birthday', 'Gender', 'Phone']], body: patientsData.map(p => [ `${p.name} ${p.lastName}`.trim(), p.age ?? 'N/A', p.birthday || 'N/A', p.gender || 'N/A', p.phone || 'N/A' ]), startY: currentY, theme: 'plain', headStyles: { fillColor: [88, 86, 214], textColor: 255 } });
			// currentY = pdfDoc.lastAutoTable.finalY + 10; // Only if more sections follow
		}

		pdfDoc.save('Data_Report.pdf');
		console.log('PDF Report Saved.');
	}

	function downloadExcelReport(appointmentsData: Appointment[], patientsData: Patient[], prescriptionsData: Prescription[]): void {
		console.log('Generating Excel Report...');
		const workbook = XLSX.utils.book_new();

		// Prescriptions Sheet
		if (prescriptionsData.length > 0) {
			 const sheetData = prescriptionsData.flatMap(pres => pres.medicines.map(med => ({ 'Patient Name': pres.patientName || 'Unknown', 'Medicine Name': med.medicine || 'N/A', 'Dosage': med.dosage || 'N/A', 'Instructions': med.instructions || 'N/A', 'Prescriber': pres.prescriber || 'N/A', 'Prescription Date': pres.date || 'N/A', 'Appointment ID': pres.appointmentId || 'N/A' })));
			if (sheetData.length > 0) { XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sheetData), 'Prescriptions'); }
		}
		// Appointments Sheet
		if (appointmentsData.length > 0) {
			const sheetData = appointmentsData.map(appt => ({ 'Patient Name': appt.patientName || 'Unknown', 'Date': appt.date || 'N/A', 'Time': appt.time || 'N/A', 'Service': appt.service || 'N/A', 'Subservice': appt.subServices?.join(', ') || 'N/A', 'Status': appt.status || 'N/A', 'Patient ID': appt.patientId || 'N/A' }));
			XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sheetData), 'Appointments');
		}
		// Patients Sheet
		if (patientsData.length > 0) {
			const sheetData = patientsData.map(p => ({ 'Full Name': `${p.name} ${p.lastName}`.trim(), 'First Name': p.name || 'N/A', 'Last Name': p.lastName || 'N/A', 'Age': p.age ?? 'N/A', 'Birthday': p.birthday || 'N/A', 'Gender': p.gender || 'N/A', 'Phone Number': p.phone || 'N/A', 'Registration Date': p.registrationDate || 'N/A', 'Patient ID': p.id }));
			XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sheetData), 'Patients');
		}

		if (workbook.SheetNames.length > 0) {
			XLSX.writeFile(workbook, 'Data_Report.xlsx'); console.log('Excel Report Saved.');
		} else {
			console.log('No data available to generate Excel report.'); alert('No data found to include in the report.');
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
			 // Fetch prescriptions (depends on appointments)
			 allPrescriptions = await fetchAllPrescriptions();

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
</script>


	<!-- Main Content Area -->
	<div class="flex-grow p-4 sm:p-6 lg:p-8 overflow-y-auto">
		<!-- Header/Summary Section -->
		<section class="mb-6" aria-labelledby="summary-heading">
			<div class="flex justify-between items-center flex-wrap gap-4 mb-4">
				<h2 id="summary-heading" class="text-xl sm:text-2xl font-semibold text-gray-700">
					Dashboard Summary
				</h2>
				<div class="flex items-center gap-2 sm:gap-4 flex-wrap">
					<label for="exportTypeSelect" class="font-medium text-sm">Export Format:</label>
					<select
						id="exportTypeSelect"
						bind:value={exportType}
						class="border border-gray-300 rounded px-2 py-1 text-sm appearance-none bg-white pr-8 focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
					>
						<option value="excel">Excel (.xlsx)</option>
						<option value="pdf">PDF (.pdf)</option>
					</select>
					<button
						on:click={generateReport}
						class="inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded text-sm font-medium transition duration-200 ease-in-out bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow hover:from-blue-600 hover:to-blue-700 hover:shadow-md hover:-translate-y-px focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
						disabled={!allPatients.length && !allAppointments.length && !allPrescriptions.length}
					>
						<span class="fas fa-download text-xs" aria-hidden="true"></span> Download Report
					</button>
				</div>
			</div>
		</section>

		<!-- Stats Cards Section -->
		<section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6" aria-label="Statistics Summary">
			<!-- Monthly Appointments Card -->
			<button
				class="relative bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between cursor-pointer overflow-hidden transition duration-200 ease-in-out shadow hover:shadow-lg hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-400 text-left"
				on:click={() => handleOpenTable('monthlyAppointments')}
				aria-controls="monthly-appointments-table"
				aria-expanded={openTable === 'monthlyAppointments'}
			>
				<div
					class="absolute top-0 left-0 h-1.5 w-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-t-lg"
				></div>
				<span class="icon fas fa-calendar-day text-2xl text-gray-600 mr-3 mt-1" aria-hidden="true"></span>
				<div class="text-right flex-grow">
					<h3 class="text-xl sm:text-2xl font-bold text-gray-800">{stats.monthlyAppointments}</h3>
					<p class="text-xs sm:text-sm text-gray-500">This Month's Appts</p>
				</div>
			</button>

			<!-- Total Appointments Card -->
			<button
				class="relative bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between cursor-pointer overflow-hidden transition duration-200 ease-in-out shadow hover:shadow-lg hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-400 text-left"
				on:click={() => handleOpenTable('appointments')}
				aria-controls="all-appointments-table"
				aria-expanded={openTable === 'appointments'}
			>
				<div
					class="absolute top-0 left-0 h-1.5 w-full bg-gradient-to-r from-blue-400 to-indigo-500 rounded-t-lg"
				></div>
				<span class="icon fas fa-calendar-alt text-2xl text-gray-600 mr-3 mt-1" aria-hidden="true"></span>
				<div class="text-right flex-grow">
					<h3 class="text-xl sm:text-2xl font-bold text-gray-800">{stats.newAppointments}</h3>
					<p class="text-xs sm:text-sm text-gray-500">Total Appointments</p>
				</div>
			</button>

			<!-- Total Patients Card -->
			<button
				class="relative bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between cursor-pointer overflow-hidden transition duration-200 ease-in-out shadow hover:shadow-lg hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-400 text-left"
				on:click={() => handleOpenTable('patients')}
				aria-controls="all-patients-table"
				aria-expanded={openTable === 'patients'}
			>
				<div
					class="absolute top-0 left-0 h-1.5 w-full bg-gradient-to-r from-green-400 to-teal-500 rounded-t-lg"
				></div>
				<span class="icon fas fa-users text-2xl text-gray-600 mr-3 mt-1" aria-hidden="true"></span>
				<div class="text-right flex-grow">
					<h3 class="text-xl sm:text-2xl font-bold text-gray-800">{stats.totalPatients}</h3>
					<p class="text-xs sm:text-sm text-gray-500">Total Patients</p>
				</div>
			</button>

			<!-- Total Prescriptions Card -->
			<button
				class="relative bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between cursor-pointer overflow-hidden transition duration-200 ease-in-out shadow hover:shadow-lg hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-400 text-left"
				on:click={() => handleOpenTable('prescriptions')}
				aria-controls="all-prescriptions-table"
				aria-expanded={openTable === 'prescriptions'}
			>
				<div
					class="absolute top-0 left-0 h-1.5 w-full bg-gradient-to-r from-purple-400 to-pink-500 rounded-t-lg"
				></div>
				<span
					class="icon fas fa-file-prescription text-2xl text-gray-600 mr-3 mt-1"
					aria-hidden="true"
				></span>
				<div class="text-right flex-grow">
					<h3 class="text-xl sm:text-2xl font-bold text-gray-800">{stats.totalPrescriptions}</h3>
					<p class="text-xs sm:text-sm text-gray-500">Total Prescriptions</p>
				</div>
			</button>
		</section>

		<!-- Charts Section -->
		<section class="mb-6" aria-labelledby="charts-heading">
			<h2 id="charts-heading" class="sr-only">Data Charts</h2>

			<!-- Filter Controls for Charts/Monthly Table -->
			<div
				class="flex items-center flex-wrap gap-3 sm:gap-4 p-3 sm:p-4 bg-white border border-gray-200 rounded-lg mb-6 shadow-sm"
			>
				<label for="yearSelect" class="font-medium text-sm mr-1">Year:</label>
				<select
					id="yearSelect"
					bind:value={selectedYear}
					class="border border-gray-300 rounded px-2 py-1 text-sm appearance-none bg-white pr-8 focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
				>
					{#each YEARS as year}
						<option value={year}>{year}</option>
					{/each}
				</select>
				<label for="monthSelect" class="font-medium text-sm mr-1">Month:</label>
				<select
					id="monthSelect"
					bind:value={selectedMonth}
					class="border border-gray-300 rounded px-2 py-1 text-sm appearance-none bg-white pr-8 focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
				>
					{#each MONTH_NAMES as month, index}
						<option value={index + 1}>{month}</option>
					{/each}
				</select>
				<span class="text-xs text-gray-500 hidden sm:inline"
					>(Filters Line Chart & Monthly Table)</span
				>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
				<!-- Line Chart: Appts & Reg -->
				<div
					class="bg-white border border-gray-200 rounded-lg p-4 shadow flex flex-col md:col-span-2 xl:col-span-2"
				>
					<h3 class="text-base font-medium text-center mb-3 text-gray-700">
						Appts & Patient Reg. ({MONTH_NAMES[selectedMonth - 1]} {selectedYear})
					</h3>
					<div class="flex-grow h-64 sm:h-72">
						<canvas id="lineChart"></canvas>
					</div>
				</div>

				<!-- Pie Chart: Status -->
				<div class="bg-white border border-gray-200 rounded-lg p-4 shadow flex flex-col">
					<h3 class="text-base font-medium text-center mb-3 text-gray-700">
						Appointment Status (All Time)
					</h3>
					<div class="flex-grow flex items-center justify-center h-64 sm:h-72">
						<canvas id="appointmentStatusPieChart" class="max-h-full w-auto"></canvas>
					</div>
				</div>

				<!-- Doughnut Chart: Gender -->
				<div class="bg-white border border-gray-200 rounded-lg p-4 shadow flex flex-col">
					<h3 class="text-base font-medium text-center mb-3 text-gray-700">Gender Distribution</h3>
					<div class="flex-grow flex items-center justify-center h-64 sm:h-72">
						<canvas id="genderDistributionDoughnutChart" class="max-h-full w-auto"></canvas>
					</div>
				</div>

				<!-- Bar Chart: Weekly -->
				<div class="bg-white border border-gray-200 rounded-lg p-4 shadow flex flex-col">
					<h3 class="text-base font-medium text-center mb-3 text-gray-700">
						Weekly Appointments (This Week)
					</h3>
					<div class="flex-grow h-64 sm:h-72">
						<canvas id="weeklyAppointmentsBarChart"></canvas>
					</div>
				</div>

				<!-- Line Chart: Completed/Missed -->
				<div
					class="bg-white border border-gray-200 rounded-lg p-4 shadow flex flex-col md:col-span-2 xl:col-span-3"
				>
					<h3 class="text-base font-medium text-center mb-3 text-gray-700">
						Completed vs Missed (Current Year)
					</h3>
					<div class="flex-grow h-64 sm:h-72">
						<canvas id="completedMissedLineChart"></canvas>
					</div>
				</div>
			</div>
		</section>

		<!-- Data Tables Section -->
		<section aria-labelledby="data-tables-heading">
			<h2 id="data-tables-heading" class="sr-only">Detailed Data Tables</h2>

			{#if openTable === 'patients'}
				<div
					class="mb-6 bg-white border border-gray-200 rounded-lg p-4 shadow-sm overflow-x-auto"
					id="all-patients-table"
					aria-live="polite"
				>
					<h3 class="mb-3 text-lg font-semibold text-gray-700">All Patients</h3>
					<table class="w-full border-collapse">
						<thead>
							<tr class="bg-blue-500 text-white">
								<th class="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Name</th>
								<th class="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Age</th>
								<th class="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Gender</th>
								<th class="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Phone</th>
								<th class="border border-gray-300 px-3 py-2 text-left text-sm font-medium"
									>Registered</th
								>
							</tr>
						</thead>
						<tbody>
							{#each allPatients as patient (patient.id)}
								<tr class="hover:bg-gray-100 even:bg-gray-50">
									<td class="border border-gray-300 px-3 py-2 text-sm align-middle"
										>{patient.name} {patient.lastName}</td
									>
									<td class="border border-gray-300 px-3 py-2 text-sm align-middle"
										>{patient.age ?? 'N/A'}</td
									>
									<td class="border border-gray-300 px-3 py-2 text-sm align-middle"
										>{patient.gender ?? 'N/A'}</td
									>
									<td class="border border-gray-300 px-3 py-2 text-sm align-middle"
										>{patient.phone ?? 'N/A'}</td
									>
									<td class="border border-gray-300 px-3 py-2 text-sm align-middle"
										>{patient.registrationDate ?? 'N/A'}</td
									>
								</tr>
							{:else}
								<tr>
									<td colspan="5" class="border border-gray-300 px-3 py-2 text-sm text-center"
										>No patients found or data loading...</td
									>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}

			{#if openTable === 'appointments'}
				<div
					class="mb-6 bg-white border border-gray-200 rounded-lg p-4 shadow-sm overflow-x-auto"
					id="all-appointments-table"
					aria-live="polite"
				>
					<h3 class="mb-3 text-lg font-semibold text-gray-700">All Appointments</h3>
					<table class="w-full border-collapse">
						<thead>
							<tr class="bg-blue-500 text-white">
								<th class="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Patient</th>
								<th class="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Date</th>
								<th class="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Time</th>
								<th class="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Service</th>
								<th class="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Status</th>
							</tr>
						</thead>
						<tbody>
							{#each allAppointments as appt (appt.id)}
								<tr class="hover:bg-gray-100 even:bg-gray-50">
									<td class="border border-gray-300 px-3 py-2 text-sm align-middle"
										>{appt.patientName}</td
									>
									<td class="border border-gray-300 px-3 py-2 text-sm align-middle">{appt.date}</td>
									<td class="border border-gray-300 px-3 py-2 text-sm align-middle"
										>{appt.time ?? 'N/A'}</td
									>
									<td class="border border-gray-300 px-3 py-2 text-sm align-middle"
										>{appt.service ?? 'N/A'}</td
									>
									<td class="border border-gray-300 px-3 py-2 text-sm align-middle">{appt.status}</td>
								</tr>
							{:else}
								<tr>
									<td colspan="5" class="border border-gray-300 px-3 py-2 text-sm text-center"
										>No appointments found or data loading...</td
									>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}

			{#if openTable === 'monthlyAppointments'}
				<div
					class="mb-6 bg-white border border-gray-200 rounded-lg p-4 shadow-sm overflow-x-auto"
					id="monthly-appointments-table"
					aria-live="polite"
				>
					<h3 class="mb-3 text-lg font-semibold text-gray-700">
						Appointments for {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
					</h3>
					<table class="w-full border-collapse">
						<thead>
							<tr class="bg-blue-500 text-white">
								<th class="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Patient</th>
								<th class="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Date</th>
								<th class="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Time</th>
								<th class="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Service</th>
								<th class="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Status</th>
							</tr>
						</thead>
						<tbody>
							{#each monthlyAppointmentsData as appt (appt.id)}
								<tr class="hover:bg-gray-100 even:bg-gray-50">
									<td class="border border-gray-300 px-3 py-2 text-sm align-middle"
										>{appt.patientName}</td
									>
									<td class="border border-gray-300 px-3 py-2 text-sm align-middle">{appt.date}</td>
									<td class="border border-gray-300 px-3 py-2 text-sm align-middle"
										>{appt.time ?? 'N/A'}</td
									>
									<td class="border border-gray-300 px-3 py-2 text-sm align-middle"
										>{appt.service ?? 'N/A'}</td
									>
									<td class="border border-gray-300 px-3 py-2 text-sm align-middle">{appt.status}</td>
								</tr>
							{:else}
								<tr>
									<td colspan="5" class="border border-gray-300 px-3 py-2 text-sm text-center"
										>No appointments found for this period.</td
									>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}

			{#if openTable === 'prescriptions'}
				<div
					class="mb-6 bg-white border border-gray-200 rounded-lg p-4 shadow-sm overflow-x-auto"
					id="all-prescriptions-table"
					aria-live="polite"
				>
					<h3 class="mb-3 text-lg font-semibold text-gray-700">All Prescriptions</h3>
					<table class="w-full border-collapse">
						<thead>
							<tr class="bg-blue-500 text-white">
								<th class="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Patient</th>
								<th class="border border-gray-300 px-3 py-2 text-left text-sm font-medium"
									>Prescriber</th
								>
								<th class="border border-gray-300 px-3 py-2 text-left text-sm font-medium"
									>Prescr. Date</th
								>
								<th class="border border-gray-300 px-3 py-2 text-left text-sm font-medium"
									>Medication</th
								>
								<th class="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Dosage</th>
								<th class="border border-gray-300 px-3 py-2 text-left text-sm font-medium"
									>Instructions</th
								>
							</tr>
						</thead>
						<tbody>
							{#each allPrescriptions as pres (pres.id)}
								{#if pres.medicines && pres.medicines.length > 0}
									{#each pres.medicines as med, i (med.medicine + i)}
										<tr class="hover:bg-gray-100 even:bg-gray-50">
											{#if i === 0}
												<td
													rowspan={pres.medicines.length}
													class="border border-gray-300 px-3 py-2 text-sm align-middle"
													>{pres.patientName}</td
												>
												<td
													rowspan={pres.medicines.length}
													class="border border-gray-300 px-3 py-2 text-sm align-middle"
													>{pres.prescriber}</td
												>
												<td
													rowspan={pres.medicines.length}
													class="border border-gray-300 px-3 py-2 text-sm align-middle"
													>{pres.date}</td
												>
											{/if}
											<td class="border border-gray-300 px-3 py-2 text-sm align-middle"
												>{med.medicine}</td
											>
											<td class="border border-gray-300 px-3 py-2 text-sm align-middle"
												>{med.dosage}</td
											>
											<td class="border border-gray-300 px-3 py-2 text-sm align-middle"
												>{med.instructions ?? 'N/A'}</td
											>
										</tr>
									{/each}
								{:else}
									<tr class="hover:bg-gray-100 even:bg-gray-50">
										<td class="border border-gray-300 px-3 py-2 text-sm align-middle"
											>{pres.patientName}</td
										>
										<td class="border border-gray-300 px-3 py-2 text-sm align-middle"
											>{pres.prescriber}</td
										>
										<td class="border border-gray-300 px-3 py-2 text-sm align-middle"
											>{pres.date}</td
										>
										<td
											colspan="3"
											class="border border-gray-300 px-3 py-2 text-sm align-middle text-center italic"
											>No medicines listed.</td
										>
									</tr>
								{/if}
							{:else}
								<tr>
									<td colspan="6" class="border border-gray-300 px-3 py-2 text-sm text-center"
										>No prescriptions found or data loading...</td
									>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>
	</div>
	<!-- /content -->

