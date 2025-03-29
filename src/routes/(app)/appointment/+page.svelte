<script lang="ts">
  import { onMount } from 'svelte';
  import { getFirestore,  onSnapshot, collection, getDocs, query, where, updateDoc, doc, addDoc } from 'firebase/firestore';
  import { initializeApp } from 'firebase/app';
  import { firebaseConfig } from '$lib/firebaseConfig';
  import { Card, Tabs, TabItem } from 'flowbite-svelte';
  import { AngleLeftOutline, AngleRightOutline } from 'flowbite-svelte-icons';
  import { Modal } from 'flowbite-svelte';
  import { writable } from 'svelte/store';
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  import Swal from 'sweetalert2';

  const morningSlots = [
  "8:00 AM", "8:30 AM", "9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
];
const afternoonSlots = [
  "1:00 PM", "1:30 PM", "2:00 PM", "2:30 PM", "3:00 PM", "3:30 PM", "4:00 PM", "4:30 PM",
];

let availableSlots = [...morningSlots, ...afternoonSlots];
 // Array to store available time slots
let date: string = ''; // Date selected by the user
let time: string = ''; // Time selected by the user
let newTime: string = ''; // New time slot for the appointment
let appointmentId: string = ''; // Appointment ID if modifying an existing one
let appointmentService: string = '';
let subServices: string = '';
let remarks: string = '';
let cancelReason: string = '';
let cancellationStatus: string = 'Pending'; // Default cancellation status
let showModal: boolean = false; // Control to show/hide the modal

  // Define types
  type Appointment = {
    remarks: any;
    subServices: any;
    cancelReason: any;
    cancellationStatus: any;
    id: string;
    date: string;
    time: string;
    status: string;
    patientId: string;
    service: string;
    [key: string]: any;
  };

  interface PatientProfile {
  id: string;
  name: string;
  lastName: string;
  age: number;
  // Add any other properties as needed
}
interface Prescription {
    appointmentId: string;
    medicine: string;
    dosage: string;
    instructions: string;
  }
  let prescription: Prescription = {
    appointmentId: '',
    medicine: '',
    dosage: '',
    instructions: ''
  };
// Variables
let totalAppointments = 0;
let pendingAppointments = 0;
let completedAppointments = 0;
let loading = true;
let currentView: 'today' | 'week' | 'month' = 'today';
let currentSection = 0;

let appointments: Appointment[] = [];
let patientProfiles: PatientProfile[] = [];
let pendingAppointmentsList: Appointment[] = [];
let selectedAppointment: Appointment | null = null;
let isModalOpen = false;

let showReasonModal = false; 
let rejectionReason = ''; // Stores the entered reason
let pendingAppointmentId = ''; // Stores the ID of the appointment to be updated

let dateVisited: string = '';
let prescriber: string = '';
interface Medicine {
    id: string; // or whatever properties are relevant
    name: string;
    stock: number;
    quantity: number;
}
let availableMedicines: Medicine[] = [];
let medication = '';                   
let qtyRefills = '';                     
let instructions = '';                
let selectedMedicine: Medicine | null = null;
let manualMedicines: Medicine[] = [];    

interface PrescriptionMedicine {
    medicine: string; // or whatever type is appropriate
    dosage: string; // or number, depending on your use case
    instructions: string;
}

let prescriptionMedicines: PrescriptionMedicine[] = []; // Update the type of prescriptionMedicines
let prescriptionAdded = false;

// Define 'today' as the current date
const today = new Date();

// Reset form fields
dateVisited = today.toISOString().split('T')[0]; 
medication = '';
instructions = '';
qtyRefills = '';
prescriber = '';

// svelte-ignore export_let_unused
export let show = false;
// Fetch appointments and profiles
onMount(async () => {
  try {
    await fetchAppointments();
    await fetchPatientProfiles();
  } catch (error) {
    console.error('Error fetching data:', error);
  } finally {
    loading = false;
  }
});

// Open the reason modal
const openReasonModal = (appointmentId: string) => {
  showReasonModal = true;
  pendingAppointmentId = appointmentId;
};

// Handle the rejection process with a reason
const confirmRejection = async () => {
  if (!rejectionReason.trim()) {
    // Alert if the reason is empty
    await Swal.fire({
      title: 'Error!',
      text: 'Please provide a reason for rejection.',
      icon: 'error',
    });
    return;
  }

  // Close the modal
  showReasonModal = false;

  // Call the existing updatePendingAppointmentStatus function with the reason
  await updatePendingAppointmentStatus(pendingAppointmentId, 'Decline');
  rejectionReason = ''; // Clear the reason input
};

const fetchAppointments = async () => {
  const appointmentsRef = collection(db, 'appointments');
  const appointmentSnapshot = await getDocs(appointmentsRef);

  appointments = appointmentSnapshot.docs.map(doc => {
    const data = doc.data() as Appointment;
    return {
        id: doc.id,
        date: data.date,
        time: data.time,
        status: data.status,
        patientId: data.patientId,
        service: data.service,
        cancellationStatus: data.cancellationStatus,
        subServices: data.subServices,
        cancelReason: data.cancelReason,
        remarks: data.remarks || '',
    };
  });

  pendingAppointmentsList = appointments.filter(appointment => 
    appointment.status === '' && appointment.cancellationStatus === 'requested'
  );

  const rescheduleRequests = appointments.filter(appointment => 
    appointment.status === 'Reschedule Requested'
  );

  const appointmentRequests = appointments.filter(appointment => !appointment.cancellationStatus);

  totalAppointments = appointments.length;

  pendingAppointments = appointments.filter(app => 
    app.status === 'pending' && !app.cancellationStatus
  ).length;

  completedAppointments = appointments.filter(app => 
    app.status === 'Completed'
  ).length;

  pendingAppointmentsList = [...pendingAppointmentsList, ...appointmentRequests, ...rescheduleRequests];
};

const fetchPatientProfiles = async () => {
  try {
    const profilesRef = collection(db, 'patientProfiles');
    const querySnapshot = await getDocs(profilesRef);
    patientProfiles = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name,
        lastName: data.lastName,
        age: data.age
      };
    });
  } catch (error) {
    console.error('Error fetching profiles:', error);
  } finally {
    loading = false;
  }
};

// Call fetchPatientProfiles when component is created
fetchPatientProfiles();
const updatePendingAppointmentStatus = async (appointmentId: string, newStatus: string) => {
  try {
    // Confirm action with SweetAlert
    const result = await Swal.fire({
      title: 'Are you sure?',
      text: `Do you want to update the status to ${newStatus}?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Yes, update it!',
    });

    if (!result.isConfirmed) {
      return; // Stop if the user cancels
    }

    // Get a reference to the appointment document in Firestore
    const appointmentRef = doc(db, 'appointments', appointmentId);

    // Update the status and reason fields in Firestore
    await updateDoc(appointmentRef, {
      status: newStatus,
      cancellationStatus: newStatus === 'Accepted' ? '' : 'decline', // Make empty when Accepted
      reason: newStatus === 'Decline' ? rejectionReason : null, // Add the rejection reason
    });

    // Optimistically update the local state
    appointments = appointments.map(appointment =>
      appointment.id === appointmentId
        ? {
            ...appointment,
            status: newStatus,
            cancellationStatus: newStatus === 'Accepted' ? '' : 'decline', // Make empty when Accepted
            reason: newStatus === 'Decline' ? rejectionReason : null, // Update local reason
          }
        : appointment
    );



    // Re-fetch the data to ensure the status update is reflected
    await fetchAppointments();

    // Success alert
    await Swal.fire({
      title: 'Success!',
      text: `The status has been updated to ${newStatus}.`,
      icon: 'success',
    });
  } catch (error) {
    console.error('Error updating appointment status:', error);

    // Error alert
    await Swal.fire({
      title: 'Error!',
      text: 'There was an error updating the status. Please try again.',
      icon: 'error',
    });
  }
};

onMount(() => { 
  currentView = 'today';
});

const filterAppointments = (view: 'today' | 'week' | 'month') => {
  const now = new Date();
  return appointments.filter(appt => {
    const apptDate = new Date(appt.date);
    // Include accepted, rescheduled, or completed appointments
    if (!['Accepted', 'Rescheduled', 'Completed','Scheduled'].includes(appt.status)) return false;

    if (view === 'today') {
      return apptDate.toDateString() === now.toDateString();
    } else if (view === 'week') {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      return apptDate >= startOfWeek && apptDate <= endOfWeek;
    } else if (view === 'month') {
      return apptDate.getMonth() === now.getMonth() && apptDate.getFullYear() === now.getFullYear();
    }
  });
};


const openModal = (appointmentId: string) => {
  // Find the selected appointment by its ID
  selectedAppointment = appointments.find(appointment => appointment.id === appointmentId) ?? null;

  // Reset form fields
  dateVisited = today.toISOString().split('T')[0]; 
  medication = '';
  instructions = '';
  qtyRefills = '';
  prescriber = '';

  if (selectedAppointment) {
    const patient = patientProfiles.find(profile => profile.id === selectedAppointment?.patientId);
    if (patient) {
      isModalOpen = true;
      console.log('Modal should open:', isModalOpen);
    } else {
      console.error("Patient not found for this appointment.");
    }
  } else {
    console.error("Appointment not found with ID:", appointmentId);
  }
};

// All medicines in the prescription

// Fetch available medicines from the database
const fetchAvailableMedicines = async () => {
  try {
    const db = getFirestore();
    const medicineRef = collection(db, "medicines");
    const querySnapshot = await getDocs(medicineRef);

    // Populate availableMedicines with the correct type
    
    availableMedicines = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Medicine[];

    console.log("Fetched medicines:", availableMedicines);
  } catch (error) {
    if (error instanceof Error) {
        console.error("Error fetching medicines:", error.message);
    } else {
        console.error("Error fetching medicines:", error);
    }
  }
};

// Call the function to fetch available medicines
onMount(async () => {
  await fetchAvailableMedicines();
});

const addSelectedMedicine = async () => {
  if (selectedMedicine && qtyRefills) {
    const db = getFirestore();
    const { id, quantity, name } = selectedMedicine;

    const qtyRefillsNumber = Number(qtyRefills); // Convert qtyRefills to a number

    if (quantity >= qtyRefillsNumber) { // Ensure sufficient stock
      try {
        // Decrease the stock in Firestore first
        const updatedQuantity = quantity - qtyRefillsNumber;
        await updateDoc(doc(db, "medicines", id), { quantity: updatedQuantity });

        console.log(`Stock updated: ${name} now has ${updatedQuantity} left.`);

        // Check if a prescription already exists for this appointment
        const existingPrescriptionQuery = await getDocs(
          query(
            collection(db, "prescriptions"),
            where("appointmentId", "==", selectedAppointment?.id)
          )
        );

        if (!existingPrescriptionQuery.empty) {
          console.error("A prescription already exists for this appointment.");
          return; // Prevent adding if a prescription already exists
        }

        // Check if the medicine is already in the prescription
        const isMedicineInPrescription = prescriptionMedicines.some(
          (item) => item.medicine === name
        );

        if (isMedicineInPrescription) {
          console.error("This medicine has already been added to the prescription.");
          return; // Prevent adding if the medicine already exists in the prescription
        }

        // Add the medicine to the prescription
        prescriptionMedicines.push({
          medicine: name,
          dosage: qtyRefills,
          instructions,
        });

        // Clear input fields
        selectedMedicine = null;
        qtyRefills = '';
        instructions = '';
      } catch (error) {
        console.error("Error updating medicine stock:", error);
      }
    } else {
      console.error("Insufficient stock for the selected medicine.");
    }
  } else {
    console.error("Please select a medicine and specify the quantity.");
  }
};

const addManualMedicine = () => {
  if (medication && qtyRefills) {
    // Check if the manually entered medicine already exists in the prescription
    const isMedicineInPrescription = prescriptionMedicines.some(
      (item) => item.medicine === medication
    );

    if (isMedicineInPrescription) {
      console.error("This medicine has already been added to the prescription.");
      return; // Prevent adding if the medicine already exists
    }

    // Add manually to the prescription
    prescriptionMedicines.push({
      medicine: medication,
      dosage: qtyRefills,
      instructions,
    });

    console.log("Manually added medicine:", medication);

    // Clear fields
    medication = '';
    qtyRefills = '';
    instructions = '';
  } else {
    console.error("Please enter the medicine name and quantity.");
  }
};

// Submit prescription
const submitPrescription = async () => {
    try {
      if (selectedAppointment) {
        const db = getFirestore();

        // Check if a prescription already exists for this appointment
        const existingPrescriptionQuery = await getDocs(
          query(
            collection(db, "prescriptions"),
            where("appointmentId", "==", selectedAppointment.id)
          )
        );

        if (!existingPrescriptionQuery.empty) {
          // Show a Swal alert and stop if a prescription already exists
          await Swal.fire({
            title: 'Duplicate Prescription',
            text: 'A prescription already exists for this appointment.',
            icon: 'warning',
            confirmButtonText: 'OK',
          });
          console.error("A prescription already exists for this appointment.");
          return; // Stop execution if a prescription already exists
        }

        // Create the new prescription document
        const prescription = {
          appointmentId: selectedAppointment.id,
          medicines: prescriptionMedicines,
          prescriber,
          createdAt: new Date().toISOString(),
        };

        await addDoc(collection(db, "prescriptions"), prescription);

        console.log("Prescription successfully Added!");

        // Mark prescription as added
        prescriptionAdded = true; // Disable the button

        // Clear prescription data
        prescriptionMedicines = [];
        prescriber = '';
        isModalOpen = false;

        // Show success alert
        await Swal.fire({
          title: 'Success!',
          text: 'Prescription successfully Added!',
          icon: 'success',
        });
      } else {
        await Swal.fire({
          title: 'No Appointment Selected',
          text: 'Please select an appointment to submit a prescription.',
          icon: 'error',
          confirmButtonText: 'OK',
        });
        console.error("No selected appointment found.");
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error("Error saving prescription to Firestore:", error.message);
        // Show error alert
        await Swal.fire({
          title: 'Error!',
          text: `Error saving prescription: ${error.message}`,
          icon: 'error',
        });
      } else {
        console.error("Error saving prescription to Firestore:", error);
        // Show fallback error alert
        await Swal.fire({
          title: 'Error!',
          text: 'An unknown error occurred while saving the prescription.',
          icon: 'error',
        });
      }
    }
  };

const closeModal = () => {
    isModalOpen = false; // Close the modal
  };
 
  // Sidebar toggle
  let isCollapsed = false;
  function toggleSidebar() {
    isCollapsed = !isCollapsed;
  }

  // Logout
  function logout() {
    window.location.href = '/';
  }


  const updateCancellationStatus = async (id: string, status: string, appointments: any[], fetchAppointments: Function) => {
  try {
    const appointmentRef = doc(db, 'appointments', id);
    await updateDoc(appointmentRef, { cancellationStatus: status });

    // Update local appointments list
    appointments = appointments.map(appointment =>
      appointment.id === id
        ? { ...appointment, cancellationStatus: status }
        : appointment
    );

    // Refresh appointments list
    await fetchAppointments();
    Swal.fire('Success', `Appointment status updated to "${status}"`, 'success');
  } catch (error) {
    console.error('Error updating cancellation request status:', error);
    Swal.fire('Error', 'Failed to update the status. Please try again.', 'error');
  }
};
const confirmStatusChange = async (id: string, status: string) => {
    const result = await Swal.fire({
      title: 'Are you sure?',
      text: `Do you want to mark this appointment as "${status}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: status === 'Approved' ? '#28a745' : '#dc3545',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Yes, proceed!',
    });

    if (result.isConfirmed) {
      updateCancellationStatus(id, status, appointments, fetchAppointments);
    }
  };


  export const appointmentStore = writable<Appointment[]>([]);


  export const handleCompletedAppointment = async (appointmentId: string, newStatus: string, remarks: string) => {
  try {
    // Ensure remarks is never undefined, default to an empty string if necessary
    const remarksToSave = remarks || '';

    // Check if the status is 'Completed' and ensure remarks is provided
    if (newStatus === 'Completed' && !remarksToSave.trim()) {
      await Swal.fire({
        title: 'Remarks Required',
        text: 'Please provide remarks to mark the appointment as completed.',
        icon: 'warning',
        confirmButtonText: 'OK',
      });
      console.error('Remarks are required to mark the appointment as completed.');
      return; // Prevent update if remarks are not provided
    }

    // Confirm the action with SweetAlert
    const result = await Swal.fire({
      title: 'Are you sure?',
      text: `Do you want to mark this appointment as ${newStatus}?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Yes, update it!',
    });

    if (!result.isConfirmed) {
      return; // If the user cancels, stop the function here
    }

    // Get a reference to the appointment document in Firestore
    const appointmentRef = doc(db, 'appointments', appointmentId);

    // Get the current timestamp for the appointment completion time
    const completionTime = newStatus === 'Completed' ? new Date().toISOString() : null;

    // Update the status, remarks, and completion time field in Firestore
    await updateDoc(appointmentRef, {
      status: newStatus === 'Completed' ? 'Completed' : 'Missed',
      remarks: remarksToSave, // Save the remarks entered by the user
      completionTime: completionTime, // Save the timestamp for completed appointments
    });

    // Optimistically update the local state
    appointmentStore.update((prevAppointments: Appointment[]) =>
      prevAppointments.map((appointment: Appointment) =>
        appointment.id === appointmentId
          ? { 
              ...appointment, 
              status: newStatus === 'Completed' ? 'Completed' : 'Missed', 
              remarks: remarksToSave,
              completionTime: completionTime, // Update the local completion time
            }
          : appointment
      )
    );

    // If re-fetching is still needed
    await fetchAppointments();

    // Show success alert
    await Swal.fire({
      title: 'Success!',
      text: `The appointment has been marked as ${newStatus}.`,
      icon: 'success',
    }).then(async (result) => {
      if (result.isConfirmed) {
        // Fetch appointments after the user clicks "OK"
        await fetchAppointments();
      }
    });
  } catch (error) {
    console.error('Error updating appointment status:', error);
    // Show error alert
    await Swal.fire({
      title: 'Error!',
      text: 'There was an error updating the appointment. Please try again.',
      icon: 'error',
    });
  }
};


async function acceptReschedule(appointmentId: string) {
  const result = await Swal.fire({
    title: 'Accept Reschedule?',
    text: 'Are you sure you want to accept this reschedule request?',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Yes, Accept',
    cancelButtonText: 'Cancel',
  });

  if (result.isConfirmed) {
    const appointment = pendingAppointmentsList.find(app => app.id === appointmentId);

    if (!appointment) {
      await Swal.fire('Error!', 'Appointment not found.', 'error');
      return;
    }

    if (!appointment.date || !appointment.time) {
      console.error("Invalid appointment data:", appointment);
      await Swal.fire('Error!', 'Invalid appointment data. Please try again.', 'error');
      return;
    }

    try {
      const appointmentsRef = collection(db, "appointments");
      const conflictQuery = query(
        appointmentsRef,
        where("date", "==", appointment.date),
        where("time", "==", appointment.time),
        where("status", "in", ["Accepted", "Pending", "accepted", "pending"])
      );
      const conflictSnapshot = await getDocs(conflictQuery);

      if (!conflictSnapshot.empty) {
        await Swal.fire(
          'Conflict Detected!',
          'Another appointment already exists in the requested time slot. Cannot accept this reschedule.',
          'error'
        );
        return;
      }

      // Update appointment status
      const appointmentRef = doc(db, "appointments", appointmentId);
      await updateDoc(appointmentRef, { status: 'Rescheduled' });

      // Remove the accepted appointment from the local list
      pendingAppointmentsList = pendingAppointmentsList.filter(app => app.id !== appointmentId);

      // Notify success
      await Swal.fire('Accepted!', 'The reschedule request has been accepted.', 'success');
    } catch (error) {
      console.error("Error handling reschedule:", error);
      await Swal.fire('Error!', 'An unexpected error occurred.', 'error');
    }
  }
}

async function rejectReschedule(appointmentId: string, previousDate: string | undefined, previousTime: string | undefined) {
  // Validate required parameters
  if (!previousDate || !previousTime) {
    console.error("Error: Missing required parameters - previousDate or previousTime is undefined.");
    await Swal.fire('Error!', 'Invalid appointment data. Please try again.', 'error');
    return;
  }

  const result = await Swal.fire({
    title: 'Reject Reschedule?',
    text: 'Are you sure you want to reject this reschedule request?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Yes, Reject',
    cancelButtonText: 'Cancel',
  });

  if (result.isConfirmed) {
    try {
      // Check for conflicts in the previous date and time
      const appointmentsRef = collection(db, "appointments");
      const conflictQuery = query(
        appointmentsRef,
        where("date", "==", previousDate),
        where("time", "==", previousTime),
        where("status", "in", ["Accepted", "Pending", "accepted", "pending"]) // Check both "pending" and "accepted"
      );
      const conflictSnapshot = await getDocs(conflictQuery);

      const appointmentRef = doc(db, "appointments", appointmentId);
      if (!conflictSnapshot.empty) {
        // Conflict exists, update status to 'Rejected'
        await updateDoc(appointmentRef, { status: 'Rejected' });

        // Use onSnapshot to listen for real-time updates
        const appointmentsQuery = query(collection(db, "appointments"));
        onSnapshot(appointmentsQuery, (snapshot) => {
          const updatedAppointments: Appointment[] = [];
          snapshot.forEach((doc) => {
            const data = { id: doc.id, ...doc.data() } as Appointment;
            updatedAppointments.push(data);
          });
          // Update local state with real-time data
          pendingAppointmentsList = updatedAppointments;
        });

        await Swal.fire(
          'Rejected!',
          'The reschedule request has been rejected as the original time slot is no longer available.',
          'info'
        );
        return;
      }

      // No conflict, proceed to update the status to 'Accepted'
      await updateDoc(appointmentRef, { status: 'Accepted' });

      // Use onSnapshot to listen for real-time updates
      const appointmentsQuery = query(collection(db, "appointments"));
      onSnapshot(appointmentsQuery, (snapshot) => {
        const updatedAppointments: Appointment[] = [];
        snapshot.forEach((doc) => {
          const data = { id: doc.id, ...doc.data() } as Appointment;
          updatedAppointments.push(data);
        });
        // Update local state with real-time data
        pendingAppointmentsList = updatedAppointments;
      });

      await Swal.fire(
        'Rejected and Reverted!',
        'The reschedule request has been rejected, and the appointment has been reverted to Accepted.',
        'success'
      );
    } catch (error) {
      console.error("Error checking for conflicts or updating status: ", error);
      await Swal.fire('Error!', 'An unexpected error occurred. Please try again later.', 'error');
    }
  }
}

// Function to load available time slots for the selected date
async function loadAvailableSlots() {
  const selectedDate = date; // Get the date value from the form
  
  // Ensure selectedDate is valid
  if (!selectedDate) {
    console.error("Selected date is invalid.");
    return;
  }

  // Query the database to check which slots are already booked for the selected date
  const q = query(
    collection(db, "appointments"),
    where("date", "==", selectedDate),
    where("cancellationStatus", "==", "") // Ensure it excludes cancelled appointments
  );

  const querySnapshot = await getDocs(q);
  const bookedSlots = querySnapshot.docs.map((doc) => doc.data().time);

  // Filter out the booked slots from the available slots
  availableSlots = [...morningSlots, ...afternoonSlots].filter(
    (slot) => !bookedSlots.includes(slot)
  );
}

// Function to show the appointment modal (to view and modify details)
function showAppointmentModal(appointment: Appointment) {
  appointmentId = appointment.id;
  appointmentService = appointment.service;
  date = appointment.date;
  time = appointment.time;
  remarks = appointment.remarks;
  subServices = appointment.subServices;
  cancelReason = appointment.cancelReason;
  cancellationStatus = appointment.cancellationStatus;
  showModal = true;

  // Ensure that patientId is assigned correctly
  selectedAppointment = appointment; // Ensure this is set correctly

  // Load available slots when the modal is shown
  loadAvailableSlots();
}

// Function to close the modal and reset the form values
function hideAppointmentModal() {
  showModal = false;
  // Reset form values to clear the modal
  appointmentId = '';
  appointmentService = '';
  date = '';
  time = '';
  remarks = '';
  subServices = '';
  cancelReason = '';
  cancellationStatus = '';
  availableSlots = []; // Clear available slots when hiding the modal
}

// Function to handle adding a new appointment (without updating the patient profile)
// Function to handle adding a new appointment (without updating the patient profile)
async function addNewAppointment() {
  // Ensure that the required fields are valid before proceeding
  if (!newTime || !date || !appointmentService) {
    Swal.fire({
      icon: "warning",
      title: "Missing Required Information",
      text: "Please ensure that all required fields are filled out (Date, Time, Service).",
    });
    return; // Exit if any required field is missing
  }

  // Check if the time slot is already booked before saving
  const q = query(
    collection(db, "appointments"),
    where("date", "==", date),
    where("time", "==", newTime),
    where("cancellationStatus", "==", "")
  );

  const querySnapshot = await getDocs(q);
  const existingAppointment = querySnapshot.docs.find(
    (doc) => doc.data().status === "Accepted" || doc.data().status === "Pending"
  );

  if (existingAppointment) {
    Swal.fire({
      icon: "info",
      title: "Time Slot Unavailable",
      text: "This time slot is already booked or pending. Please choose a different time.",
    });
    return; // Exit if the slot is already booked
  }

  // Ensure the patient profile exists (via user-side function or check)
  const patientId = selectedAppointment?.patientId;

  if (!patientId) {
    Swal.fire({
      icon: "error",
      title: "Patient Not Selected",
      text: "Please select a patient before scheduling the appointment.",
    });
    return; // Exit if no patient profile is found
  }

  // Check if the patient profile exists in the list (if applicable)
  const patientProfile = patientProfiles.find(profile => profile.id === patientId);

  if (!patientProfile) {
    Swal.fire({
      icon: "error",
      title: "Profile Not Found",
      text: "The patient profile doesn't exist. Please ensure the patient has a profile before proceeding.",
    });
    return; // Exit if no patient profile is found
  }

  // If available, save the new appointment to the database
  const newAppointment: Appointment = {
    id: appointmentId || '', // Fallback to an empty string if not set
    service: appointmentService || '', // Fallback to empty string if not set
    date: date || '', // Fallback to empty string if not set
    time: newTime || '', // Fallback to empty string if not set
    remarks: remarks || '', // Fallback to empty string if not set
    subServices: subServices || '', // Fallback to empty string if not set
    cancelReason: cancelReason || '', // Fallback to empty string if not set
    cancellationStatus: cancellationStatus || 'Pending', // Default to 'Pending'
    status: 'Scheduled', // Default status for new appointments
    patientId: patientId, // Ensure patientId is included
  };

  // Log and save the new appointment
  console.log("Adding appointment:", newAppointment);

  try {
    await addDoc(collection(db, "appointments"), newAppointment);

    // Now that the new follow-up appointment has been added,
    // Update the status of the selected appointment to "Completed: Need Follow-up"
    if (selectedAppointment) {
      const updatedAppointment = {
        ...selectedAppointment,
        status: "Completed: Need Follow-up", // Update status here
      };

      // Ensure selectedAppointment is not null before updating
      if (selectedAppointment?.id) {
        await updateDoc(doc(db, "appointments", selectedAppointment.id), {
          status: updatedAppointment.status,
        });
      }
    }

    Swal.fire({
      icon: "success",
      title: "Appointment Added",
      text: "Your appointment has been successfully scheduled and the previous appointment status updated.",
    });

    hideAppointmentModal(); // Close the modal after adding the appointment
  } catch (error) {
    console.error("Error adding appointment:", error);
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "There was an issue adding the appointment. Please try again.",
    });
  }
}

// Function to validate the form data before adding an appointment
function validateAppointmentData() {
  if (!appointmentService || !newTime || !date) {
    Swal.fire({
      icon: "warning",
      title: "Missing Required Fields",
      text: "Please fill in all required fields (Date, Time, Service).",
    });
    return false;
  }
  return true;
}

</script>
<!-- 
  Main Wrapper for this section of the page. 
  This div should be placed inside your main application's content area, 
  next to (not overlapping) your main sidebar.
-->
<div class="px-4 md:px-6 pb-4 md:pb-6 pt-0 space-y-6">
  
  {#if loading}
    <p>Loading data...</p>
  {:else}
    <!-- Use Flexbox for Desktop layout, Stacking on Mobile -->
    <div class="flex flex-col lg:flex-row gap-6">

      <!-- Main Content Area (Accepted Appointments) - Takes more space -->
      <div class="flex-grow lg:w-2/3 order-2 lg:order-1"> 
        <div class="bg-white p-4 rounded-lg shadow-md"> 
          <h2 class="text-xl font-semibold mb-4">Accepted Appointments</h2>
      
          <!-- Tabs for Filtering -->
          <div class="tabs mb-4 border-b border-gray-200">
            
            <button
              type="button"
              class="tab-item px-4 py-2 mr-1 rounded-t-md {currentView === 'today' ? 'bg-blue-500 text-white' : 'text-blue-500 hover:bg-blue-100'}"
              on:click={() => currentView = 'today'}
            >
              Today
            </button>
            <button
              type="button"
              class="tab-item px-4 py-2 mr-1 rounded-t-md {currentView === 'week' ? 'bg-blue-500 text-white' : 'text-blue-500 hover:bg-blue-100'}"
              on:click={() => currentView = 'week'}
            >
              This Week
            </button>
            <button
              type="button"
              class="tab-item px-4 py-2 rounded-t-md {currentView === 'month' ? 'bg-blue-500 text-white' : 'text-blue-500 hover:bg-blue-100'}"
              on:click={() => currentView = 'month'}
            >
              This Month
            </button>
          </div>
      
          <!-- Display Appointments if any -->
          {#if filterAppointments(currentView).length > 0}
            <div class="space-y-4">
              {#each filterAppointments(currentView) as appointment}
              
                <article class="border border-gray-300 rounded-lg p-4 bg-white shadow"> 
                  <section class="appointment-details mb-3">
                    
                    <p class="font-semibold text-gray-800">
                      {#each patientProfiles as profile (profile.id)}
                        {#if profile.id === appointment.patientId}
                          {profile.name} {profile.lastName} <span class="text-sm font-normal text-gray-600">({profile.age} years old)</span>
                        {/if}
                      {/each}
                    </p>
        
                    <div class="my-1">
                      <p class="text-sm text-gray-700">
                        <strong>{new Date(appointment.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</strong>
                        <span class="text-gray-600"> | {appointment.time}</span>
                      </p>
                    </div>
        
                    <p class="text-sm text-gray-600 mt-1">Service: {appointment.service}</p>
                    {#if appointment.subServices && appointment.subServices.length > 0}
                      <p class="text-sm text-gray-600">Sub-services: {appointment.subServices.join(', ')}</p>
                    {/if}
        
               
                    <div class="remarks-container mt-2">
                      <label for="remarks-{appointment.id}" class="text-sm font-medium text-gray-700 mb-1 block">Remarks:</label>
                      <input
                        type="text"
                        id="remarks-{appointment.id}"
                        class="remarks-input w-full border border-gray-300 rounded p-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                        bind:value={appointment.remarks}
                        placeholder="Enter remarks here"
                        aria-label="Enter remarks for {appointment.date} at {appointment.time}"
                      />
                    </div>
                  </section>

                 
                   <div class="appointment-buttons flex flex-wrap gap-2 justify-end mt-3">
                     {#if appointment.status === 'Completed'}
                       <button class="bg-green-500 hover:bg-green-600 text-white text-sm px-3 py-1 rounded shadow" on:click={() => showAppointmentModal(appointment)}>
                         Add Appointment
                       </button>
                     {:else}
                       <button
                         on:click={() => openModal(appointment.id)}
                         class="bg-green-100 hover:bg-green-200 text-green-700 text-sm px-3 py-1 rounded disabled:opacity-50"
                         disabled={prescriptionAdded}
                       >
                         Add Prescription
                       </button>
                       <button
                         class="bg-blue-100 hover:bg-blue-200 text-blue-700 text-sm px-3 py-1 rounded"
                         on:click={() => handleCompletedAppointment(appointment.id, 'Completed', appointment.remarks || '')}
                       >
                         Completed
                       </button>
                       <button
                         class="bg-red-100 hover:bg-red-200 text-red-700 text-sm px-3 py-1 rounded"
                         on:click={() => handleCompletedAppointment(appointment.id, 'Missed', appointment.remarks || '')}
                       >
                         Missed
                       </button>
                     {/if}
                   </div>
                </article>
              {/each}
            </div>
          {:else}
            <div class="no-appointments text-center py-10 text-gray-500">
              <p>No appointments for the selected period.</p>
            </div>
          {/if}
        </div>
      </div>

      <!-- Sidebar-like Content Area (Stats & Pending Lists) -->
      <div class="w-full lg:w-1/3 order-1 lg:order-2 space-y-6"> 
        
        <!-- Stats Card -->
        <Card class="w-full p-4 shadow-lg bg-white rounded-lg">
          <div class="card-content1 space-y-3"> 
            <div>
              <p class="text-gray-500 text-sm">Total Appointment This Month</p>
              <p class="text-2xl font-bold text-gray-900">{totalAppointments}</p>
            </div>
            <div>
              <p class="text-gray-500 text-sm">Pending Appointment This Month</p>
              <p class="text-2xl font-bold text-gray-900">{pendingAppointments}</p>
            </div>
            <div>
              <p class="text-gray-500 text-sm">Completed Appointment This Month</p>
              <p class="text-2xl font-bold text-gray-900">{completedAppointments}</p>
            </div>
          </div>
        </Card>

        <!-- Pending Items Container -->
        <div class="appointment-container1 bg-white p-4 rounded-lg shadow-md space-y-4" style="max-height: 70vh; overflow-y: auto;">
          <div class="appointment-header text-center space-y-3"> 
            <p class="appointment-title text-lg font-semibold">
              {#if currentSection === 0}
                Pending Appointments
              {:else if currentSection === 1}
                Pending Reschedule Requests
              {:else if currentSection === 2}
                Pending Cancellation requests
              {/if}
            </p>
        
            <div class="icon-buttons flex justify-center space-x-6 pt-2">
              <button
                class="icon-button p-1 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-400 {currentSection === 0 ? 'bg-blue-100 ring-2 ring-blue-500' : ''}"
                on:click={() => (currentSection = 0)}
                aria-label="Pending Appointments"
              >
                <img src="./images/pending-appointment.png" alt="Pending Appointments" class="icon w-8 h-8" /> 
              </button>
              <button
                class="icon-button p-1 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-400 {currentSection === 1 ? 'bg-blue-100 ring-2 ring-blue-500' : ''}"
                on:click={() => (currentSection = 1)}
                aria-label="Pending Reschedule Requests"
              >
                <img src="./images/pending-reschedule.png" alt="Pending Reschedule Requests" class="icon w-8 h-8" />
              </button>
              <button
                class="icon-button p-1 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-400 {currentSection === 2 ? 'bg-blue-100 ring-2 ring-blue-500' : ''}"
                on:click={() => (currentSection = 2)}
                aria-label="Pending Cancellation Requests"
              >
                <img src="./images/pending-cancellation.png" alt="Pending Cancellation Requests" class="icon w-8 h-8" />
              </button>
            </div>
          </div>
        
          <!-- Divider -->
          <hr class="my-4"> 

          <!-- View All Link common position -->
          <div class="text-right mb-2">
             <a class="view-all text-sm text-blue-600 hover:underline" href="/allstatus">View All</a>
          </div>

          <!-- Conditional Sections for Pending Items -->
          {#if currentSection === 0}
            <div class="pending-appointments space-y-3">
              {#if pendingAppointmentsList.filter(a => a.status === 'pending').length > 0}
                {#each pendingAppointmentsList as appointment}
                  {#if appointment.status === 'pending'} 
                    <!-- Use Tailwind for card styling -->
                    <div class="appointment-card border border-gray-200 rounded-md p-3 shadow-sm">
                      <div class="patient-info mb-2">
                        {#each patientProfiles as profile (profile.id)}
                          {#if profile.id === appointment.patientId}
                            <div class="patient-details text-sm">
                              <p class="patient-name font-semibold text-gray-800">{profile.name} {profile.lastName}</p>
                              <p class="patient-age text-gray-600">{profile.age} years old</p>
                              <p class="appointment-details text-gray-600">{appointment.date} at {appointment.time}</p>
                              <p class="service text-gray-600 mt-1">
                                Service: {appointment.service}
                              </p>
                              {#if appointment.subServices && appointment.subServices.length > 0}
                                <p class="sub-services text-gray-600">
                                  Sub-services: {appointment.subServices.join(', ')}
                                </p>
                              {/if}
                            </div>
                          {/if}
                        {/each}
                      </div>
                      <div class="appointment-buttons flex gap-2 justify-end">
                       
                        <button class="bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs px-3 py-1 rounded" on:click={() => updatePendingAppointmentStatus(appointment.id, 'Accepted')}>
                          Accept
                        </button>
                        <button class="bg-red-100 hover:bg-red-200 text-red-700 text-xs px-3 py-1 rounded" on:click={() => openReasonModal(appointment.id)}>
                          Reject
                        </button>
                      </div>
                    </div>
                  {/if}
                {/each}
              {:else}
                <p class="text-center text-sm text-gray-500 py-4">No pending appointment requests available.</p>
              {/if}
            </div>
    
          {:else if currentSection === 1}
            <div class="reschedule-requests space-y-3">
              {#if pendingAppointmentsList.filter(a => a.status === 'Reschedule Requested').length > 0}
                {#each pendingAppointmentsList as appointment}
                  {#if appointment.status === 'Reschedule Requested'}
                    <div class="appointment-card border border-gray-200 rounded-md p-3 shadow-sm">
                      <div class="patient-info mb-2">
                        {#each patientProfiles as profile (profile.id)}
                          {#if profile.id === appointment.patientId}
                            <div class="patient-details text-sm">
                              <p class="patient-name font-semibold text-gray-800">{profile.name} {profile.lastName}</p>
                              <p class="patient-age text-gray-600">{profile.age} years old</p>
                              <p class="text-gray-600 italic">Requesting to reschedule</p>
                              <p class="text-gray-600">Requested: {appointment.date} at {appointment.time}</p>
                              <p class="service text-gray-600 mt-1">Service: {appointment.service}</p>
                              {#if appointment.subServices && appointment.subServices.length > 0}
                                <p class="sub-services text-gray-600">Sub-services: {appointment.subServices.join(', ')}</p>
                              {/if}
                            </div>
                          {/if}
                        {/each}
                      </div>
                      <div class="appointment-buttons flex gap-2 justify-end">
                        <button class="bg-green-100 hover:bg-green-200 text-green-700 text-xs px-3 py-1 rounded" on:click={() => acceptReschedule(appointment.id)}>
                          Accept
                        </button>
                        <button class="bg-red-100 hover:bg-red-200 text-red-700 text-xs px-3 py-1 rounded" on:click={() => rejectReschedule(appointment.id, appointment.date, appointment.time)}>
                          Reject
                        </button>
                      </div>
                    </div>
                  {/if}
                {/each}
              {:else}
                <p class="text-center text-sm text-gray-500 py-4">No reschedule requests available.</p>
              {/if}
            </div>

          {:else if currentSection === 2}
            <div class="pending-cancellations space-y-3">
              {#if pendingAppointmentsList.filter(appointment => appointment.cancellationStatus === 'requested').length > 0}
                {#each pendingAppointmentsList as appointment}
                  {#if appointment.cancellationStatus === 'requested'}
                    <div class="appointment-card border border-gray-200 rounded-md p-3 shadow-sm">
                      <div class="patient-info mb-2">
                        {#each patientProfiles as profile (profile.id)}
                          {#if profile.id === appointment.patientId}
                            <div class="patient-details text-sm">
                              <p class="patient-name font-semibold text-gray-800">{profile.name} {profile.lastName}</p>
                              <p class="patient-age text-gray-600">{profile.age} years old</p>
                              <p class="appointment-details text-gray-600">{appointment.date} at {appointment.time}</p>
                              <p class="service text-gray-600 mt-1">Service: {appointment.service}</p>
                              {#if appointment.subServices && appointment.subServices.length > 0}
                                <p class="sub-service text-gray-600">Sub-services: {appointment.subServices.join(', ')}</p>
                              {/if}
                              <p class="cancellation-reason text-gray-600 mt-1">Reason: <span class="italic">{appointment.cancelReason || 'No reason provided'}</span></p>
                            </div>
                          {/if}
                        {/each}
                      </div>
                      <div class="appointment-buttons flex gap-2 justify-end">
                        <button class="bg-green-100 hover:bg-green-200 text-green-700 text-xs px-3 py-1 rounded" on:click={() => confirmStatusChange(appointment.id, 'Approved')}>
                          Approved
                        </button>
                        <button class="bg-red-100 hover:bg-red-200 text-red-700 text-xs px-3 py-1 rounded" on:click={() => confirmStatusChange(appointment.id, 'Declined')}>
                          Decline
                        </button>
                      </div>
                    </div>
                  {/if}
                {/each}
              {:else}
                <p class="text-center text-sm text-gray-500 py-4">No pending cancellation requests available.</p>
              {/if}
            </div>
          {/if} 
          
        </div>

      </div> <!-- End Sidebar-like Content Area -->

    </div> <!-- End Flex Container -->
  {/if}

  <!-- Modals (Keep As Is - Fixed positioning is correct for modals) -->
  
  <!-- Reason Modal -->
  {#if showReasonModal}
    <div class="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div class="bg-white rounded-lg p-6 w-full max-w-md shadow-lg mx-4">
        <h2 class="text-lg font-semibold mb-4">Reason for Rejection</h2>
        <textarea
          class="w-full border rounded p-2 mb-4 focus:ring-blue-500 focus:border-blue-500"
          rows="4"
          bind:value={rejectionReason}
          placeholder="Enter the reason for rejection..."
        ></textarea>
        <div class="flex justify-end space-x-4">
          <button
            class="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded"
            on:click={() => (showReasonModal = false)}
          >
            Cancel
          </button>
          <button
            class="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
            on:click={confirmRejection}
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Add Follow-up Appointment Modal -->
  {#if showModal}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="modal-overlay-new-appointment fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" role="dialog" tabindex="0" aria-modal="true" on:click={hideAppointmentModal} on:keydown={(e) => e.key === 'Escape' && hideAppointmentModal()}>
      <div class="modal-content-new-appointment bg-white p-6 rounded-lg shadow-lg w-full max-w-lg mx-4" role="document" on:click|stopPropagation>
        <h3 class="text-xl font-semibold mb-4 text-center">
          Add Follow-up Appointment for 
          {selectedAppointment 
            ? (() => {
                const patientProfile = patientProfiles.find(profile => profile.id === selectedAppointment?.patientId);
                return patientProfile ? `${patientProfile.name} ${patientProfile.lastName}` : 'Patient';
              })() 
            : 'Patient'}
        </h3>
        <form on:submit|preventDefault={addNewAppointment} class="space-y-4">
          <div>
            <label for="date" class="block text-sm font-medium text-gray-700">Date:</label>
            <input 
              type="date" 
              id="date" 
              name="date" 
              bind:value={date} 
              required 
              on:change={loadAvailableSlots} 
              min={new Date().toISOString().split('T')[0]}
              class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label for="newTime" class="block text-sm font-medium text-gray-700">Select a new time:</label>
            <select id="newTime" bind:value={newTime} required class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500">
              <option value="" disabled>Select a time</option>
              {#each availableSlots as slot}
                <option value={slot}>{slot}</option>
              {/each}
            </select>
          </div>
          <div>
            <label for="service" class="block text-sm font-medium text-gray-700">Service:</label>
            <input 
              type="text" 
              id="service" 
              name="service" 
              bind:value={appointmentService} 
              required 
              class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label for="subServices" class="block text-sm font-medium text-gray-700">Sub-services (optional, comma-separated):</label>
            <input 
              type="text" 
              id="subServices" 
              name="subServices" 
              bind:value={subServices} 
              placeholder="e.g., Cleaning, Consultation"
              class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label for="remarks" class="block text-sm font-medium text-gray-700">Remarks (optional):</label>
            <input 
              type="text" 
              id="remarks" 
              name="remarks" 
              bind:value={remarks} 
              placeholder="Enter remarks here"
              class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div class="flex justify-end space-x-3 pt-4">
            <button type="button" class="cancel-btn bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded-md" on:click={hideAppointmentModal}>Cancel</button>
            <button type="submit" class="submit-btn bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md">Add Appointment</button>
          </div>
        </form>
      </div>
    </div>
  {/if}

  <!-- Prescription Modal -->
  {#if isModalOpen}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="modal-overlay fixed inset-0 h-dvh bg-black bg-opacity-50 flex justify-center items-center z-50" role="dialog" tabindex="0" aria-labelledby="modal-title" aria-modal="true" on:click={closeModal} on:keydown={(e) => e.key === 'Escape' && closeModal()}>
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="modal-content bg-white p-6 rounded-lg shadow-lg relative w-full max-w-lg mx-4" role="document" on:click|stopPropagation>
        <button 
          class="absolute top-3 right-3 text-gray-500 hover:text-gray-800 text-2xl font-bold"
          on:click={closeModal}
          aria-label="Close Modal"
        >
          ×
        </button>
        <h2 id="modal-title" class="text-xl font-bold mb-5">
          Add Prescription for 
          {selectedAppointment 
            ? (() => {
                const patientProfile = patientProfiles.find(profile => profile.id === selectedAppointment?.patientId);
                return patientProfile ? `${patientProfile.name} ${patientProfile.lastName}` : 'Patient';
              })() 
            : 'Patient'}
        </h2>
        <form on:submit|preventDefault={submitPrescription} class="space-y-4">
          <div>
            <label for="dateVisited" class="block text-sm font-medium text-gray-700 mb-1">Date Visited</label>
            <input id="dateVisited" type="date" bind:value={dateVisited} required class="w-full border border-gray-300 rounded p-2 focus:ring-green-500 focus:border-green-500" />
          </div>
          <div>
            <label for="availableMedicine" class="block text-sm font-medium text-gray-700 mb-1">Available Medicines</label>
            <select id="availableMedicine" bind:value={selectedMedicine} class="w-full border border-gray-300 rounded p-2 focus:ring-green-500 focus:border-green-500">
              <option value="" disabled>Select a medicine</option>
              {#each availableMedicines as med}
                <option value={med}>
                  {med.name} (Stock: {med.quantity})
                </option>
              {/each}
            </select>

          </div>
          <div>
            <label for="manualMedication" class="block text-sm font-medium text-gray-700 mb-1">Medication</label>
            <input id="manualMedication" type="text" bind:value={medication} placeholder="Or type medication manually" class="w-full border border-gray-300 rounded p-2 focus:ring-green-500 focus:border-green-500" />
          </div>
          <div>
            <label for="qtyRefills" class="block text-sm font-medium text-gray-700 mb-1">Qty/Refills</label>
            <input id="qtyRefills" type="number" bind:value={qtyRefills} class="w-full border border-gray-300 rounded p-2 focus:ring-green-500 focus:border-green-500" />
          </div>
          <div>
            <label for="instructions" class="block text-sm font-medium text-gray-700 mb-1">Instructions</label>
            <textarea id="instructions" bind:value={instructions} rows="3" class="w-full border border-gray-300 rounded p-2 focus:ring-green-500 focus:border-green-500"></textarea>
          </div>
          <div>
            <label for="prescriber" class="block text-sm font-medium text-gray-700 mb-1">Prescriber</label>
            <select
              id="prescriber"
              bind:value={prescriber}
              class="w-full border border-gray-300 rounded p-2 focus:ring-green-500 focus:border-green-500"
            >
              <option value="" disabled>Select prescriber</option>
              <option value="Alfred Domingo">Alfred Domingo</option>
              <option value="Fernalyn Domingo">Fernalyn Domingo</option>
            </select>
          </div>
          <div class="flex justify-end pt-4">
         
            <button
              type="submit" 
              class="bg-green-500 hover:bg-green-600 text-white py-2 px-4 rounded focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
            >
              Submit Prescription
            </button>
          </div>
        </form>
      </div>
    </div>
  {/if}

</div>

<style>

  .icon-buttons img.icon {
    /* width: 40px; height: 40px; */ /* Use Tailwind w- h- classes instead */
    cursor: pointer;
    transition: transform 0.2s ease;
  }
  .icon-buttons img.icon:hover {
    transform: scale(1.1);
  }
  
  .modal-overlay {
  margin: 0 !important;
  padding: 0 !important;
}


   .appointment-container1::-webkit-scrollbar {
     width: 6px;
   }
   .appointment-container1::-webkit-scrollbar-thumb {
     background-color: #cbd5e1; /* gray-300 */
     border-radius: 3px;
   }
   .appointment-container1::-webkit-scrollbar-track {
     background-color: #f1f5f9; /* slate-100 */
   }
   .appointment-container1 {
     scrollbar-width: thin;
     scrollbar-color: #cbd5e1 #f1f5f9;
   }

</style>