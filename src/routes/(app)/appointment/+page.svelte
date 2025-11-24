<script lang="ts">
  import { onMount } from 'svelte';
  import { getFirestore, doc, getDoc, onSnapshot, collection, getDocs, query, where, updateDoc, addDoc, type Unsubscribe } from 'firebase/firestore';
  import { initializeApp } from 'firebase/app';
  import { firebaseConfig } from '$lib/firebaseConfig';
  import { Card } from 'flowbite-svelte';
  // import { Modal } from 'flowbite-svelte';
  import { writable } from 'svelte/store';
  import Swal from 'sweetalert2';

  let db: ReturnType<typeof getFirestore>;
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

  let availableSlots: string[] = [];
  let date: string = '';
  let time: string = ''; 
  let newTime: string = ''; 
  // let appointmentId: string = ''; 
  let appointmentService: string = '';
  let subServices: string = '';
  let remarks: string = '';
  // let cancelReason: string = '';
  // let cancellationStatus: string = '';
  let showModal: boolean = false; 

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
    completionTime?: string | null;
    followUpFrom?: string | null;
    createdAt?: string;
    reason?: string | null;
    // Added for enriched data
    patientName?: string;
    patientAge?: number;
    patientEmail?: string;
    paymentStatus?: string;
    [key: string]: any;
  };

  interface PatientProfile {
    id: string;
    name: string;
    lastName: string;
    age: number;
    email: string;
  }

  interface Prescription { 
    appointmentId: string;
    medicine: string;
    dosage: string;
    instructions: string;
  }
  // let prescription: Prescription = { appointmentId: '', medicine: '', dosage: '', instructions: '' };

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
  let isPrescriptionModalOpen = false;
  let showReasonModal = false; 
  let rejectionReason: string = '';
  let pendingAppointmentId: string = '';  

  let dateVisited: string = '';  
  let prescriber: string = ''; 
  interface Medicine {
    id: string;
    name: string;
    quantity: number;
  }
  let availableMedicines: Medicine[] = [];
  let medication = '';  
  let qtyRefills = '';  
  let instructions = ''; 
  let selectedMedicine: Medicine | null = null;  
 // interface PrescriptionMedicine {  
  //   medicine: string;
  //   dosage: string;
  //   instructions: string;
  // }
  // let prescriptionMedicines: PrescriptionMedicine[] = [];
  let prescriptionAdded = false;  

  const today = new Date();

  let search = '';
  let selectedService = '';
  let sortBy = 'dateDesc';
  let uniqueServices: string[] = [];

  export const appointmentStore = writable<Appointment[]>([]);

  let formTriedSubmit = false;

  onMount(() => {
      let unsubscribeAppointments: Unsubscribe = () => {};

      const init = async () => {
          loading = true;
          try {
              await fetchPatientProfiles();
              await fetchAvailableMedicines();

              const appointmentsQuery = query(collection(db, "appointments"));
              unsubscribeAppointments = onSnapshot(appointmentsQuery, (snapshot) => {
                  console.log("Appointment snapshot received. Processing...");
                  const rawAppointments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));

                  appointments = rawAppointments.map(app => {
                      const patient = patientProfiles.find(p => p.id === app.patientId);
                      return {
                          ...app,
                          patientName: patient ? `${patient.name || ''} ${patient.lastName || ''}`.trim() : 'Unknown Patient',
                          patientAge: patient?.age || 0,
                          patientEmail: patient?.email || ''
                      };
                  });
                  console.log("Enriched appointments count:", appointments.length);
                  if(appointments.length > 0) console.log("First enriched appointment example:", appointments[0]);


                  appointmentStore.set(appointments);
                  processAppointmentsData();

                  if (loading) {
                      loading = false;
                  }
              }, (error) => {
                  console.error("Error listening to appointments:", error);
                  Swal.fire('Error', 'Could not load appointments in real-time.', 'error');
                  loading = false;
              });

          } catch (error) {
              console.error('Error during initial data fetch:', error);
              Swal.fire('Error', 'Failed to load initial page data.', 'error');
              loading = false;
          }
      };

      init();
      dateVisited = today.toISOString().split('T')[0];

      return () => {
          console.log("Unsubscribing from appointments listener");
          unsubscribeAppointments();
      };
  });


  function updateUniqueServices() {
      const serviceSet = new Set<string>();
      appointments.forEach(a => {
        if (a.service && typeof a.service === 'string') serviceSet.add(a.service);
      });
      uniqueServices = Array.from(serviceSet).sort();
  }

  function processAppointmentsData() {
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      const appointmentsThisMonth = appointments.filter(app => {
          try {
             const appDate = new Date(app.date);
             return appDate.getMonth() === currentMonth && appDate.getFullYear() === currentYear;
          } catch { return false; }
      });

      totalAppointments = appointmentsThisMonth.length;
      pendingAppointments = appointmentsThisMonth.filter(app => app.status === 'pending' && !app.cancellationStatus).length;
      completedAppointments = appointmentsThisMonth.filter(app => app.status === 'Completed' || app.status === 'Completed: Need Follow-up').length;

      pendingAppointmentsList = appointments.filter(app =>
          (app.status === 'pending' && !app.cancellationStatus) ||
          app.status === 'Reschedule Requested' ||
          app.cancellationStatus === 'requested'
      );

      updateUniqueServices();

      console.log("Processed appointments data (summaries and pending list):", {
          totalThisMonth: totalAppointments,
          pendingThisMonth: pendingAppointments,
          completedThisMonth: completedAppointments,
          pendingListItemsCount: pendingAppointmentsList.length
      });
  }

  const fetchPatientProfiles = async () => {
    try {
      const profilesRef = collection(db, 'patientProfiles');
      const querySnapshot = await getDocs(profilesRef);
      patientProfiles = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name || '',
          lastName: data.lastName || '',
          age: data.age || 0,
          email: data.email || ''
        } as PatientProfile;
      });
      console.log("Fetched Patient Profiles:", patientProfiles.length);
      if (patientProfiles.length > 0) console.log("First patient profile example:", patientProfiles[0]);
    } catch (error) {
      console.error('Error fetching patient profiles:', error);
      Swal.fire('Error', 'Failed to load patient profiles. Patient names might not display correctly.', 'error');
    }
  };

  const fetchAvailableMedicines = async () => {
    try {
      const medicineRef = collection(db, "medicines");
      const querySnapshot = await getDocs(medicineRef);
      availableMedicines = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Medicine));
      console.log("Fetched Available Medicines:", availableMedicines.length);
    } catch (error) {
      console.error("Error fetching medicines:", error);
    }
  };

  const updatePendingAppointmentStatus = async (appointmentId: string, newStatus: 'Accepted' | 'Decline') => {
    if (newStatus === 'Decline' && !rejectionReason.trim()) {
        openReasonModal(appointmentId);
        return;
    }

    const confirmText = newStatus === 'Accepted'
        ? 'Do you want to accept this appointment request?'
        : `Do you want to decline this appointment request with reason: "${rejectionReason}"?`;

    const result = await Swal.fire({
        title: 'Are you sure?',
        text: confirmText,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: newStatus === 'Accepted' ? '#3085d6' : '#d33',
        cancelButtonColor: '#6c757d',
        confirmButtonText: `Yes, ${newStatus} it!`,
    });

    if (!result.isConfirmed) {
        if (newStatus === 'Decline') rejectionReason = '';
        return;
    }

    try {
        const appointmentRef = doc(db, 'appointments', appointmentId);
        const updateData: { status: string; reason?: string | null; cancellationStatus?: string } = {
            status: newStatus,
            reason: newStatus === 'Decline' ? rejectionReason : null,
        };
        if (newStatus === 'Accepted') {
            updateData.cancellationStatus = '';
        }
        await updateDoc(appointmentRef, updateData);

        const appointment = appointments.find(app => app.id === appointmentId);

        if (appointment && appointment.patientEmail) {
            console.log(`Attempting to send email to ${appointment.patientEmail} for appointment ${appointment.id} (Status: ${newStatus})`);
            try {
                const formattedDate = new Date(appointment.date).toLocaleDateString('en-US', {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                });
                const patientFullName = appointment.patientName || 'Patient';

                const emailResponse = await fetch('/appointment/sendEmail', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        patientEmail: appointment.patientEmail,
                        patientName: patientFullName,
                        status: newStatus,
                        appointmentDetails: {
                            date: formattedDate,
                            time: appointment.time,
                            service: appointment.service,
                            reason: newStatus === 'Decline' ? rejectionReason : null
                        }
                    })
                });

                const responseData = await emailResponse.json();

                if (!emailResponse.ok) {
                    console.error("Failed to send email:", responseData);
                    Swal.fire({
                        title: 'Warning',
                        text: `Appointment ${newStatus.toLowerCase()}, but failed to send email notification: ${responseData.message || 'Unknown error'}`,
                        icon: 'warning'
                    });
                } else {
                    console.log("Email sent successfully:", responseData);
                    Swal.fire('Success!', `The appointment has been ${newStatus.toLowerCase()} and the patient has been notified.`, 'success');
                }
            } catch (err) {
                console.error("Error sending email:", err);
                Swal.fire({
                    title: 'Warning',
                    text: `Appointment ${newStatus.toLowerCase()}, but encountered an error sending email notification.`,
                    icon: 'warning'
                });
            }
        } else {
            if (appointment && !appointment.patientEmail) {
                console.warn(`Cannot send email for appointment ${appointmentId}: Patient email not found.`, appointment);
                Swal.fire({
                    title: 'Warning',
                    text: `Appointment ${newStatus.toLowerCase()}, but no email address found for the patient to send notification.`,
                    icon: 'warning'
                });
            } else if (!appointment) {
                console.warn(`Cannot send email: Appointment with ID ${appointmentId} not found in local list.`);
            }
        }

        rejectionReason = '';
        showReasonModal = false;

    } catch (error) {
        console.error('Error updating appointment status:', error);
        Swal.fire('Error!', 'There was an error updating the status. Please try again.', 'error');
        if (newStatus === 'Decline') rejectionReason = '';
    }
  };

  const handleCompletedAppointment = async (appointmentId: string, newStatus: 'Completed' | 'Missed', remarksValue: string) => {
      const remarksToSave = remarksValue || '';

      if (newStatus === 'Completed' && !remarksToSave.trim()) {
          await Swal.fire('Remarks Required', 'Please provide remarks to mark the appointment as completed.', 'warning');
          return;
      }

      const result = await Swal.fire({
          title: 'Are you sure?',
          text: `Do you want to mark this appointment as ${newStatus}?`,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#3085d6',
          cancelButtonColor: '#d33',
          confirmButtonText: 'Yes, update it!',
      });

      if (!result.isConfirmed) return;

      try {
          const appointmentRef = doc(db, 'appointments', appointmentId);
          const completionTime = newStatus === 'Completed' ? new Date().toISOString() : null;

          await updateDoc(appointmentRef, {
              status: newStatus,
              remarks: remarksToSave,
              completionTime: completionTime,
          });

          const remarksInput = document.getElementById(`remarks-${appointmentId}`) as HTMLInputElement;
          if (remarksInput) remarksInput.value = remarksToSave;


          await Swal.fire('Success!', `The appointment has been marked as ${newStatus}.`, 'success');

      } catch (error) {
          console.error('Error updating appointment status:', error);
          await Swal.fire('Error!', 'There was an error updating the appointment. Please try again.', 'error');
      }
  };

  const updateCancellationStatus = async (id: string, status: 'Approved' | 'Declined') => {
      try {
          const appointmentRef = doc(db, 'appointments', id);
          const updateData: { cancellationStatus: string; status?: string } = {
              cancellationStatus: status
          };
          if (status === 'Approved') {
              updateData.status = 'Cancelled';
          }

          await updateDoc(appointmentRef, updateData);

          Swal.fire('Success', `Cancellation request ${status.toLowerCase()}.`, 'success');
      } catch (error) {
          console.error('Error updating cancellation request status:', error);
          Swal.fire('Error', 'Failed to update the status. Please try again.', 'error');
      }
  };

  const confirmCancellationStatusChange = async (id: string, status: 'Approved' | 'Declined') => {
      const result = await Swal.fire({
          title: 'Are you sure?',
          text: `Do you want to ${status.toLowerCase()} this cancellation request? ${status === 'Approved' ? 'This will cancel the appointment.' : ''}`,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: status === 'Approved' ? '#28a745' : '#dc3545',
          cancelButtonColor: '#6c757d',
          confirmButtonText: `Yes, ${status.toLowerCase()} it!`,
      });

      if (result.isConfirmed) {
          updateCancellationStatus(id, status);
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
      if (!result.isConfirmed) return;

      const appointment = appointments.find(app => app.id === appointmentId);
      if (!appointment || !appointment.date || !appointment.time) {
          await Swal.fire('Error!', 'Invalid appointment data.', 'error'); return;
      }

      try {
          const conflictQuery = query(
              collection(db, "appointments"),
              where("date", "==", appointment.date),
              where("time", "==", appointment.time),
              where("status", "in", ["Accepted", "Pending", "Scheduled", "Rescheduled", "Completed: Need Follow-up"]),
              where("__name__", "!=", appointmentId) // Exclude the current appointment from conflict check
          );
          const conflictSnapshot = await getDocs(conflictQuery);

          if (!conflictSnapshot.empty) {
              await Swal.fire('Conflict Detected!', 'Another appointment already exists in the requested time slot. Cannot accept this reschedule.', 'error');
              return;
          }

          const appointmentRef = doc(db, "appointments", appointmentId);
          await updateDoc(appointmentRef, { status: 'Rescheduled' });

          await Swal.fire('Accepted!', 'The reschedule request has been accepted.', 'success');

      } catch (error) {
          console.error("Error accepting reschedule:", error);
          await Swal.fire('Error!', 'An unexpected error occurred.', 'error');
      }
  }

  async function rejectReschedule(appointmentId: string) {
       const appointment = appointments.find(app => app.id === appointmentId);
       if (!appointment) {
           await Swal.fire('Error!', 'Appointment not found.', 'error'); return;
       }

       const result = await Swal.fire({
          title: 'Reject Reschedule?',
          text: 'Are you sure you want to decline this reschedule request? The appointment will revert to its previous status (likely \'Accepted\' or \'Scheduled\').',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Yes, Decline',
          cancelButtonText: 'Cancel',
      });

       if (result.isConfirmed) {
           try {
               const appointmentRef = doc(db, "appointments", appointmentId);
               await updateDoc(appointmentRef, {
                   status: 'Accepted'
               });

               await Swal.fire(
                   'Declined!',
                   'The reschedule request has been rejected. The appointment status has been reverted.',
                   'success'
               );
           } catch (error) {
               console.error("Error declining reschedule:", error);
               await Swal.fire('Error!', 'An unexpected error occurred. Please try again later.', 'error');
           }
       }
  }

  async function loadAvailableSlots() {
      const selectedDate = date; 
      availableSlots = [];
      console.log(`Loading slots for date: ${selectedDate}`);

      if (!selectedDate) {
          console.warn("No date selected for loading slots.");
          return;
      }

      try {
          const scheduleRef = doc(db, 'dailySchedules', selectedDate);
          const scheduleSnap = await getDoc(scheduleRef);

          let scheduledSlotsForDay: string[] = [];
          if (scheduleSnap.exists()) {
              const scheduleData = scheduleSnap.data();
              if (scheduleData.isWorkingDay === false) {
                  console.log(`${selectedDate} is marked as a non-working day.`);
                  return; 
              }
              scheduledSlotsForDay = scheduleData.availableSlots || [];
              console.log(`Scheduled slots from dailySchedules for ${selectedDate}:`, scheduledSlotsForDay);
          } else {
              console.log(`No schedule defined in dailySchedules for ${selectedDate}. No slots available.`);
              return; 
          }

          if (scheduledSlotsForDay.length === 0) {
              console.log(`Schedule exists for ${selectedDate}, but no availableSlots are defined in it.`);
              return;
          }

          const q = query(
              collection(db, "appointments"),
              where("date", "==", selectedDate),
              where("status", "in", ["Accepted", "Pending", "Scheduled", "Rescheduled", "Completed: Need Follow-up"]) // Consider active statuses
          );

          const querySnapshot = await getDocs(q);
          const bookedSlots = querySnapshot.docs.map((doc) => doc.data().time);
          console.log(`Booked slots on ${selectedDate}:`, bookedSlots);

          availableSlots = scheduledSlotsForDay.filter(
              (slot) => !bookedSlots.includes(slot)
          );
          
          availableSlots.sort((a, b) => new Date(`1970-01-01T${a}`).getTime() - new Date(`1970-01-01T${b}`).getTime());

          console.log(`Final available slots for ${selectedDate}:`, availableSlots);

      } catch (error) {
          console.error(`Error loading available slots for ${selectedDate}:`, error);
          Swal.fire('Error', `Could not load available time slots for ${selectedDate}.`, 'error');
          availableSlots = [];  
      }
  }

  const openReasonModal = (idOfAppointmentToReject: string) => {
      pendingAppointmentId = idOfAppointmentToReject;
      rejectionReason = '';  
      showReasonModal = true;
  };

  const confirmRejection = async () => {
      if (!rejectionReason.trim()) {
          await Swal.fire('Error!', 'Please provide a reason for decline.', 'error');
          return;
      }
      
      await updatePendingAppointmentStatus(pendingAppointmentId, 'Decline');
      // showReasonModal = false; 
  };

  const openPrescriptionModal = (appointmentIdToPrescribe: string) => {
      selectedAppointment = appointments.find(appointment => appointment.id === appointmentIdToPrescribe) ?? null;
      if (!selectedAppointment) {
          console.error("Appointment not found for prescription:", appointmentIdToPrescribe);
          Swal.fire('Error', 'Could not find the selected appointment to add prescription.', 'error');
          return;
      }

      dateVisited = today.toISOString().split('T')[0];  
      medication = '';
      instructions = '';
      qtyRefills = '';
      prescriber = '';
      selectedMedicine = null;
      // prescriptionMedicines = [];  
      prescriptionAdded = false;
      isPrescriptionModalOpen = true;
      console.log('Prescription Modal opened for appointment ID:', selectedAppointment.id);
  };

  const closePrescriptionModal = () => {
      isPrescriptionModalOpen = false;
      selectedAppointment = null; 
  };

  function showAppointmentModal(originatingAppointment: Appointment) { 
      console.log("Opening follow-up modal originating from appointment ID:", originatingAppointment.id);
      selectedAppointment = originatingAppointment; 

      date = '';  
      newTime = '';  
      availableSlots = [];  
      appointmentService = originatingAppointment.service; 
      subServices = ''; 
      remarks = '';  

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      date = tomorrow.toISOString().split('T')[0];  

      showModal = true; 
      loadAvailableSlots();  
  }

  function hideAppointmentModal() {  
      showModal = false;
      selectedAppointment = null;  
      // Reset form fields
      date = '';
      newTime = '';
      availableSlots = [];
      appointmentService = '';
      subServices = '';
      remarks = '';
  }

  async function addNewAppointment() {  
      if (!date || !newTime || !appointmentService) {
          Swal.fire("Missing Information", "Please select a Date, Time, and enter a Service for the follow-up.", "warning");
          return;
      }
      if (!selectedAppointment || !selectedAppointment.patientId) {
           Swal.fire("Error", "Cannot add follow-up. Original appointment context (including patient ID) is missing.", "error");
           return;
      }
       const patientIdForFollowUp = selectedAppointment.patientId;

      try {
           
          const conflictQuery = query(
              collection(db, "appointments"),
              where("date", "==", date),
              where("time", "==", newTime),
              where("status", "in", ["Accepted", "Pending", "Scheduled", "Rescheduled", "Completed: Need Follow-up"])
          );
          const conflictSnapshot = await getDocs(conflictQuery);

          if (!conflictSnapshot.empty) {
              Swal.fire("Time Slot Unavailable", `The time slot ${newTime} on ${date} is already booked or pending. Please choose a different time for the follow-up.`, "info");
              return;
          }

           const newFollowUpData: Omit<Appointment, 'id' | 'patientName' | 'patientAge' | 'patientEmail'> & { createdAt: string; followUpFrom: string } = {
             patientId: patientIdForFollowUp,
             service: appointmentService,
             date: date,
             time: newTime,
             subServices: subServices ? subServices.split(',').map(s => s.trim()) : [],
             remarks: remarks || '',
             status: 'Scheduled', // Follow-ups are typically directly scheduled
             cancellationStatus: '',
             cancelReason: null,
             completionTime: null,
             reason: null,
             createdAt: new Date().toISOString(),
             followUpFrom: selectedAppointment.id  
           };

          console.log("Adding new follow-up appointment data:", newFollowUpData);
          const addedDocRef = await addDoc(collection(db, "appointments"), newFollowUpData);
          console.log("Follow-up appointment added with ID:", addedDocRef.id);

          // Update status of the original appointment
          const originalAppointmentRef = doc(db, "appointments", selectedAppointment.id);
          await updateDoc(originalAppointmentRef, {
              status: "Completed: Need Follow-up"
          });
          console.log(`Updated original appointment ${selectedAppointment.id} status to 'Completed: Need Follow-up'.`);

          Swal.fire("Success", "Follow-up appointment scheduled successfully!", "success");
          hideAppointmentModal();  

      } catch (error) {
          console.error("Error adding follow-up appointment:", error);
          Swal.fire("Error", "There was an issue scheduling the follow-up appointment. Please try again.", "error");
      }
  }

  // const addSelectedMedicine = async () => { /* Not implemented in provided snippet */ };
  // const addManualMedicine = () => { /* Not implemented in provided snippet */ };

const submitPrescription = async () => {
    try {
      // Validate minimum fields
      if (selectedAppointment && prescriber && (selectedMedicine !== null || medication.trim()) && qtyRefills.trim()) {
        // Check for existing prescription for this appointment
        const existingPrescriptionQuery = query(
          collection(db, "prescriptions"),
          where("appointmentId", "==", selectedAppointment.id)
        );
        const existingSnapshot = await getDocs(existingPrescriptionQuery);

        if (!existingSnapshot.empty) {
          await Swal.fire('Duplicate Prescription', 'A prescription already exists for this appointment.', 'warning');
          return;
        }

        // Parse quantity from qtyRefills
        let quantityToDeduct = 0;
        const qtyMatch = qtyRefills.match(/(\d+)/);
        if (qtyMatch) quantityToDeduct = parseInt(qtyMatch[1], 10);

        // Deduct from inventory if using selectedMedicine from stock
        if (selectedMedicine !== null && quantityToDeduct > 0) {
          const medicineRef = doc(db, "medicines", selectedMedicine.id);
          // Find medicine in availableMedicines
          const med = availableMedicines.find(m => m.id === selectedMedicine!.id);
          if (med && med.quantity >= quantityToDeduct) {
            await updateDoc(medicineRef, {
              quantity: med.quantity - quantityToDeduct
            });
          } else {
            await Swal.fire('Insufficient Stock', 'Not enough stock for this medicine.', 'error');
            return;
          }
        }

        const medicineToAdd = {  
          medicine: selectedMedicine !== null ? selectedMedicine.name : medication.trim(),
          dosage: qtyRefills.trim(),
          instructions: instructions.trim(),
        };

        const prescriptionData = {
          appointmentId: selectedAppointment.id,
          patientId: selectedAppointment.patientId,  
          medicines: [medicineToAdd],  
          prescriber: prescriber,
          dateVisited: dateVisited,  
          createdAt: new Date().toISOString(),
        };

        await addDoc(collection(db, "prescriptions"), prescriptionData);

        prescriptionAdded = true; 
        closePrescriptionModal();
        await Swal.fire('Success!', 'Prescription successfully added!', 'success');

        // Reset fields after submission
        medication = '';
        qtyRefills = '';
        instructions = '';
        prescriber = '';
      } else {
        let message = "Cannot submit prescription: ";
        if (!selectedAppointment) message += "No appointment selected. ";
        if (!prescriber) message += "Prescriber not selected. ";
        if (selectedMedicine === null && !medication.trim()) message += "No medicine selected or entered. ";
        if (!qtyRefills.trim()) message += "Dosage/Qty is required.";
        await Swal.fire('Missing Information', message, 'warning');
      }
    } catch (error) {
      console.error("Error saving prescription:", error);
      await Swal.fire('Error!', 'An error occurred while saving the prescription.', 'error');
    }
  };

const filterAppointments = (view: 'today' | 'week' | 'month'): Appointment[] => {
    const now = new Date();
    const todayDateStr = now.toDateString();  

    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());  
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let filtered = appointments.filter(appt => {
        const inactiveStatuses = ['Cancelled', 'Rejected', 'Missed', 'Decline'];
        if (inactiveStatuses.includes(appt.status) || appt.cancellationStatus === 'Approved' || appt.cancellationStatus === 'Declined') {
            return false;
        }

        const displayStatuses = ['Accepted', 'Scheduled', 'Rescheduled', 'Completed: Need Follow-up'];
        if (!displayStatuses.includes(appt.status)) {
          return false;
        }

        try {
            const apptDate = new Date(appt.date);
            const apptDateNormalized = new Date(apptDate.getFullYear(), apptDate.getMonth(), apptDate.getDate());

            if (view === 'today') {
                return apptDateNormalized.toDateString() === todayDateStr;
            } else if (view === 'week') {
                return apptDateNormalized >= startOfWeek && apptDateNormalized <= endOfWeek;
            } else if (view === 'month') {
                return apptDateNormalized.getMonth() === currentMonth && apptDateNormalized.getFullYear() === currentYear;
            }
            return false;  
        } catch(e) {
             console.warn("Error parsing appointment date during filtering:", appt.date, e);
             return false;  
        }
    });

    // Apply search filter
    if (search.trim()) {
        const s = search.trim().toLowerCase();
        filtered = filtered.filter(appt =>
          (appt.patientName && appt.patientName.toLowerCase().includes(s)) ||
          (appt.patientEmail && appt.patientEmail.toLowerCase().includes(s)) ||
          (appt.patientId && appt.patientId.toLowerCase().includes(s))
        );
    }

    // Apply service filter
    if (selectedService) {
        filtered = filtered.filter(appt => appt.service === selectedService);
    }

    // Apply sorting
    if (sortBy === 'dateAsc') {
        filtered = filtered.slice().sort((a, b) => {
            const dateA = new Date(a.date).getTime();
            const dateB = new Date(b.date).getTime();
            if (dateA !== dateB) return dateA - dateB;
            try {
                const timeA = new Date(`1970-01-01T${a.time}`).getTime();
                const timeB = new Date(`1970-01-01T${b.time}`).getTime();
                if (isNaN(timeA) || isNaN(timeB)) return 0;
                return timeA - timeB;
            } catch {
                return 0;
            }
        });
    } else if (sortBy === 'dateDesc') {
        filtered = filtered.slice().sort((a, b) => {
            const dateA = new Date(a.date).getTime();
            const dateB = new Date(b.date).getTime();
            if (dateA !== dateB) return dateB - dateA;
            try {
                const timeA = new Date(`1970-01-01T${a.time}`).getTime();
                const timeB = new Date(`1970-01-01T${b.time}`).getTime();
                if (isNaN(timeA) || isNaN(timeB)) return 0;
                return timeB - timeA;
            } catch {
                return 0;
            }
        });
    } else if (sortBy === 'name') {
        filtered = filtered.slice().sort((a, b) => (a.patientName || '').localeCompare(b.patientName || ''));
    }

    return filtered;
  };

</script>

<div class="px-4 md:px-6 pb-4 md:pb-6 pt-0 ">

  {#if loading && appointments.length === 0}
    <p class="text-center text-gray-500 py-10">Loading appointments...</p>
  {:else}
    <div class="flex flex-col lg:flex-row gap-6">

      <div class="flex-grow lg:w-2/3 order-2 lg:order-1">
        <!-- Added mt-6 to match original, ensure consistent spacing -->
        <div class="bg-white p-4 rounded-lg shadow-md mt-6">
          <h2 class="text-xl font-semibold mb-4">Scheduled Appointments</h2>

          <!-- Search, Filter, and Sort Controls -->
          <div class="flex flex-wrap gap-3 sm:gap-4 mb-4 items-end">
            <div class="relative flex-1 min-w-[180px] sm:min-w-[200px]">
              <label for="search-input" class="block text-xs font-semibold text-gray-600 mb-1">Search</label>
              <input id="search-input" type="text" bind:value={search} placeholder="Name, email, or ID" class="w-full border rounded px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500 shadow-sm" />
            </div>
            <div class="min-w-[140px] sm:min-w-[150px]">
              <label for="service-select" class="block text-xs font-semibold text-gray-600 mb-1">Service</label>
              <select id="service-select" bind:value={selectedService} class="border rounded px-3 py-2 w-full text-sm focus:ring-blue-500 focus:border-blue-500 shadow-sm">
                <option value="">All Services</option>
                {#each uniqueServices as s (s)}
                  <option value={s}>{s}</option>
                {/each}
              </select>
            </div>
            <div class="min-w-[140px] sm:min-w-[150px]">
              <label for="sort-select" class="block text-xs font-semibold text-gray-600 mb-1">Sort By</label>
              <select id="sort-select" bind:value={sortBy} class="border rounded px-3 py-2 w-full text-sm focus:ring-blue-500 focus:border-blue-500 shadow-sm">
                <option value="dateDesc">Date (Newest)</option>
                <option value="dateAsc">Date (Oldest)</option>
                <option value="name">Patient Name</option>
              </select>
            </div>
          </div>

          <div class="tabs mb-4 border-b border-gray-200">
             <button type="button" class="tab-item px-4 py-2 mr-1 rounded-t-md {currentView === 'today' ? 'bg-blue-500 text-white' : 'text-blue-500 hover:bg-blue-100'}" on:click={() => currentView = 'today'}>Today</button>
             <button type="button" class="tab-item px-4 py-2 mr-1 rounded-t-md {currentView === 'week' ? 'bg-blue-500 text-white' : 'text-blue-500 hover:bg-blue-100'}" on:click={() => currentView = 'week'}>This Week</button>
             <button type="button" class="tab-item px-4 py-2 rounded-t-md {currentView === 'month' ? 'bg-blue-500 text-white' : 'text-blue-500 hover:bg-blue-100'}" on:click={() => currentView = 'month'}>This Month</button>
          </div>
          {#if filterAppointments(currentView).length > 0}
            <div class="space-y-4">
              {#each filterAppointments(currentView) as appointment (appointment.id)}
                <article class="border border-gray-300 rounded-lg p-4 bg-white shadow transition hover:shadow-lg">
                  <section class="appointment-details mb-3">
                     <!-- MODIFIED for direct patientName -->
                     {#if appointment.patientName && appointment.patientName !== 'Unknown Patient'}
                       <p class="font-semibold text-gray-800">
                          {appointment.patientName}
                          {#if appointment.patientAge && appointment.patientAge > 0}
                            <span class="text-sm font-normal text-gray-600">({appointment.patientAge} years old)</span>
                          {/if}
                       </p>
                     {:else}
                        <p class="font-semibold text-gray-800 italic">Patient ID: {appointment.patientId} (Profile details missing)</p>
                     {/if}

                      <div class="my-1">
                          <p class="text-sm text-gray-700">
                              <strong>{new Date(appointment.date).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}</strong>
                              <span class="text-gray-600"> | {appointment.time}</span>
                          </p>
                      </div>

                      <p class="text-sm text-gray-600 mt-1">Service: {appointment.service}</p>
                      {#if appointment.status === 'Accepted' && appointment.paymentStatus === 'paid'}
                        <span class="inline-block text-xs font-medium px-2.5 py-0.5 rounded bg-green-100 text-green-800 ml-1">
                          Paid
                        </span>
                      {/if}
                      {#if appointment.subServices && Array.isArray(appointment.subServices) && appointment.subServices.length > 0 && appointment.subServices.join(', ').trim() !== ''}
                         <p class="text-sm text-gray-600">Sub-services: {appointment.subServices.join(', ')}</p>
                      {/if}

                       <span class="inline-block text-xs font-medium px-2.5 py-0.5 rounded mt-1
                         {appointment.status === 'Accepted' || appointment.status === 'Scheduled' ? 'bg-blue-100 text-blue-800' : ''}
                         {appointment.status === 'Rescheduled' ? 'bg-yellow-100 text-yellow-800' : ''}
                         {appointment.status === 'Completed: Need Follow-up' ? 'bg-purple-100 text-purple-800' : ''}
                         {appointment.status === 'Completed' ? 'bg-green-100 text-green-800' : ''}
                       ">
                           {appointment.status}
                       </span>


                       {#if !['Completed', 'Missed', 'Completed: Need Follow-up'].includes(appointment.status)}
                          <div class="remarks-container mt-2">
                             <label for="remarks-{appointment.id}" class="text-sm font-medium text-gray-700 mb-1 block">Remarks:</label>
                             <input
                                 type="text"
                                 id="remarks-{appointment.id}"
                                 class="remarks-input w-full border border-gray-300 rounded p-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                                 bind:value={appointment.remarks}
                                 placeholder="Add remarks before completing/missing"
                                 aria-label="Enter remarks for {appointment.patientName || appointment.patientId} on {appointment.date} at {appointment.time}"
                             />
                          </div>
                       {:else}
                          {#if appointment.remarks}
                              <p class="text-sm text-gray-600 mt-2">Remarks: <span class="italic">{appointment.remarks}</span></p>
                          {/if}
                       {/if}
                   </section>

                   <div class="appointment-buttons flex flex-wrap gap-2 justify-end mt-3 text-sm">
                     {#if appointment.status === 'Completed' || appointment.status === 'Completed: Need Follow-up'}
                       <button class="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1 rounded shadow" on:click={() => showAppointmentModal(appointment)}>
                         Add Follow-up
                       </button>
                     {:else if ['Accepted', 'Scheduled', 'Rescheduled'].includes(appointment.status)}
                       <button
                         on:click={() => openPrescriptionModal(appointment.id)}
                         class="bg-green-100 hover:bg-green-200 text-green-700 px-3 py-1 rounded"
                         title="Add Prescription"
                       > Add Prescription </button>
                       <button
                         class="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded"
                         on:click={() => handleCompletedAppointment(appointment.id, 'Completed', appointment.remarks || '')}
                         title="Mark as Completed"
                       > Completed </button>
                       <button
                         class="bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1 rounded"
                         on:click={() => handleCompletedAppointment(appointment.id, 'Missed', appointment.remarks || '')}
                         title="Mark as Missed"
                       > Missed </button>
                     {/if}
                   </div>
                 </article>
               {/each}
             </div>
           {:else}
             <div class="no-appointments text-center py-10 text-gray-500">
               <p>No scheduled appointments for the selected period.</p>
             </div>
           {/if}
        </div>
      </div>

      <div class="w-full lg:w-1/3 order-1 lg:order-2 space-y-6 mt-6">

        <Card class="w-full p-4 shadow-lg bg-white rounded-lg">
           <div class="card-content1 space-y-3">
              <div> <p class="text-gray-500 text-sm">Total Scheduled (This Month)</p> <p class="text-2xl font-bold text-gray-900">{totalAppointments}</p> </div>
              <div> <p class="text-gray-500 text-sm">Pending Requests (All Types)</p> <p class="text-2xl font-bold text-gray-900">{pendingAppointmentsList.length}</p> </div>
              <div> <p class="text-gray-500 text-sm">Completed (This Month)</p> <p class="text-2xl font-bold text-gray-900">{completedAppointments}</p> </div>
           </div>
        </Card>

        <div class="appointment-container1 bg-white p-4 rounded-lg shadow-md space-y-4" style="max-height: 70vh; overflow-y: auto;">
           <div class="appointment-header text-center space-y-3">
              <p class="appointment-title text-lg font-semibold">
                  {#if currentSection === 0}Pending Appointments
                  {:else if currentSection === 1}Pending Reschedule
                  {:else if currentSection === 2}Pending Cancellation
                  {/if}
              </p>
              <div class="icon-buttons flex justify-center space-x-6 pt-2">
                 <button class="icon-button p-1 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-400 {currentSection === 0 ? 'bg-blue-100 ring-2 ring-blue-500' : ''}" on:click={() => (currentSection = 0)} aria-label="Pending Appointments"> <img src="./images/pending-appointment.png" alt="Pending Appointments" class="icon w-8 h-8" /> </button>
                 <button class="icon-button p-1 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-400 {currentSection === 1 ? 'bg-blue-100 ring-2 ring-blue-500' : ''}" on:click={() => (currentSection = 1)} aria-label="Pending Reschedule Requests"> <img src="./images/pending-reschedule.png" alt="Pending Reschedule Requests" class="icon w-8 h-8" /> </button>
                 <button class="icon-button p-1 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-400 {currentSection === 2 ? 'bg-blue-100 ring-2 ring-blue-500' : ''}" on:click={() => (currentSection = 2)} aria-label="Pending Cancellation Requests"> <img src="./images/pending-cancellation.png" alt="Pending Cancellation Requests" class="icon w-8 h-8" /> </button>
              </div>
           </div>
           <hr class="my-4">

            {#if currentSection === 0} <!-- Pending Appointments -->
               {@const pendingReqs = pendingAppointmentsList.filter(a => a.status === 'pending' && !a.cancellationStatus)}
               <div class="pending-appointments space-y-3">
                   {#if pendingReqs.length > 0}
                       {#each pendingReqs as appointment (appointment.id)}
                           <div class="appointment-card border border-gray-200 rounded-md p-3 shadow-sm text-sm">
                               <!-- MODIFIED for direct patientName -->
                               {#if appointment.patientName && appointment.patientName !== 'Unknown Patient'}
                                  <p class="font-semibold text-gray-800">
                                    {appointment.patientName}
                                    {#if appointment.patientAge && appointment.patientAge > 0}
                                        <span class="text-sm font-normal text-gray-600">({appointment.patientAge} years old)</span>
                                    {/if}
                                  </p>
                               {:else}
                                  <p class="font-semibold text-gray-800 italic">Patient ID: {appointment.patientId} (Profile details missing)</p>
                               {/if}
                               <p class="text-gray-600">{new Date(appointment.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at {appointment.time}</p>
                               <p class="text-gray-600 mt-1">Service: {appointment.service}</p>
                               {#if appointment.status === 'Accepted' && appointment.paymentStatus === 'paid'}
                                 <span class="inline-block text-xs font-medium px-2.5 py-0.5 rounded bg-green-100 text-green-800 ml-1">
                                   Paid
                                 </span>
                               {/if}
                               {#if appointment.subServices && Array.isArray(appointment.subServices) && appointment.subServices.length > 0 && appointment.subServices.join(', ').trim() !== ''}
                                   <p class="text-xs text-gray-500">Subs: {appointment.subServices.join(', ')}</p>
                               {/if}
                               <div class="appointment-buttons flex gap-2 justify-end mt-2">
                                   <button class="bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs px-3 py-1 rounded" on:click={() => updatePendingAppointmentStatus(appointment.id, 'Accepted')}>Accept</button>
                                   <button class="bg-red-100 hover:bg-red-200 text-red-700 text-xs px-3 py-1 rounded" on:click={() => openReasonModal(appointment.id)}>Decline</button>
                               </div>
                           </div>
                       {/each}
                   {:else}
                       <p class="text-center text-sm text-gray-500 py-4">No pending appointment requests.</p>
                   {/if}
               </div>
           {/if}

             {#if currentSection === 1} <!-- Pending Reschedule -->
               {@const rescheduleReqs = pendingAppointmentsList.filter(a => a.status === 'Reschedule Requested')}
               <div class="reschedule-requests space-y-3">
                   {#if rescheduleReqs.length > 0}
                       {#each rescheduleReqs as appointment (appointment.id)}
                           <div class="appointment-card border border-gray-200 rounded-md p-3 shadow-sm text-sm">
                              <!-- MODIFIED for direct patientName -->
                              {#if appointment.patientName && appointment.patientName !== 'Unknown Patient'}
                                  <p class="font-semibold text-gray-800">
                                    {appointment.patientName}
                                    {#if appointment.patientAge && appointment.patientAge > 0}
                                        <span class="text-sm font-normal text-gray-600">({appointment.patientAge} years old)</span>
                                    {/if}
                                  </p>
                               {:else}
                                  <p class="font-semibold text-gray-800 italic">Patient ID: {appointment.patientId} (Profile details missing)</p>
                               {/if}
                               <p class="text-gray-600 italic">Requests reschedule to:</p>
                               <p class="text-gray-600 font-medium">{new Date(appointment.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at {appointment.time}</p>
                               <p class="text-gray-600 mt-1">Service: {appointment.service}</p>
                               {#if appointment.status === 'Accepted' && appointment.paymentStatus === 'paid'}
                                 <span class="inline-block text-xs font-medium px-2.5 py-0.5 rounded bg-green-100 text-green-800 ml-1">
                                   Paid
                                 </span>
                               {/if}
                               {#if appointment.subServices && Array.isArray(appointment.subServices) && appointment.subServices.length > 0 && appointment.subServices.join(', ').trim() !== ''}
                                 <p class="text-xs text-gray-500">Subs: {appointment.subServices.join(', ')}</p>
                               {/if}
                               <div class="appointment-buttons flex gap-2 justify-end mt-2">
                                   <button class="bg-green-100 hover:bg-green-200 text-green-700 text-xs px-3 py-1 rounded" on:click={() => acceptReschedule(appointment.id)}>Accept</button>
                                   <button class="bg-red-100 hover:bg-red-200 text-red-700 text-xs px-3 py-1 rounded" on:click={() => rejectReschedule(appointment.id)}>Decline</button>
                               </div>
                           </div>
                       {/each}
                   {:else}
                       <p class="text-center text-sm text-gray-500 py-4">No pending reschedule requests.</p>
                   {/if}
               </div>
           {/if}

            {#if currentSection === 2} <!-- Pending Cancellation -->
               {@const cancelReqs = pendingAppointmentsList.filter(a => a.cancellationStatus === 'requested')}
               <div class="pending-cancellations space-y-3">
                   {#if cancelReqs.length > 0}
                       {#each cancelReqs as appointment (appointment.id)}
                           <div class="appointment-card border border-gray-200 rounded-md p-3 shadow-sm text-sm">
                               <!-- MODIFIED for direct patientName -->
                               {#if appointment.patientName && appointment.patientName !== 'Unknown Patient'}
                                  <p class="font-semibold text-gray-800">
                                    {appointment.patientName}
                                    {#if appointment.patientAge && appointment.patientAge > 0}
                                        <span class="text-sm font-normal text-gray-600">({appointment.patientAge} years old)</span>
                                    {/if}
                                  </p>
                               {:else}
                                  <p class="font-semibold text-gray-800 italic">Patient ID: {appointment.patientId} (Profile details missing)</p>
                               {/if}
                               <p class="text-gray-600">{new Date(appointment.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at {appointment.time}</p>
                               <p class="text-gray-600 mt-1">Service: {appointment.service}</p>
                               {#if appointment.status === 'Accepted' && appointment.paymentStatus === 'paid'}
                                 <span class="inline-block text-xs font-medium px-2.5 py-0.5 rounded bg-green-100 text-green-800 ml-1">
                                   Paid
                                 </span>
                               {/if}
                               {#if appointment.subServices && Array.isArray(appointment.subServices) && appointment.subServices.length > 0 && appointment.subServices.join(', ').trim() !== ''}
                                <p class="text-xs text-gray-500">Subs: {appointment.subServices.join(', ')}</p>
                               {/if}
                               <p class="text-gray-600 mt-1">Reason: <span class="italic">{appointment.cancelReason || 'No reason provided'}</span></p>
                               <div class="appointment-buttons flex gap-2 justify-end mt-2">
                                   <button class="bg-green-100 hover:bg-green-200 text-green-700 text-xs px-3 py-1 rounded" on:click={() => confirmCancellationStatusChange(appointment.id, 'Approved')}>Approve</button>
                                   <button class="bg-red-100 hover:bg-red-200 text-red-700 text-xs px-3 py-1 rounded" on:click={() => confirmCancellationStatusChange(appointment.id, 'Declined')}>Decline</button>
                               </div>
                           </div>
                       {/each}
                   {:else}
                       <p class="text-center text-sm text-gray-500 py-4">No pending cancellation requests.</p>
                   {/if}
               </div>
           {/if}
        </div>
      </div>
    </div>
  {/if}


  <!-- MODALS -->

  {#if showReasonModal}
    <div class="fixed inset-0 flex items-center justify-center bg-black bg-opacity-60 z-50 p-4">
      <div class="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
        <h2 class="text-lg font-semibold mb-4">Reason for Rejection</h2>
        <textarea
          class="w-full border rounded p-2 mb-4 focus:ring-blue-500 focus:border-blue-500"
          rows="4"
          bind:value={rejectionReason}
          placeholder="Enter the reason..."
        ></textarea>
        <div class="flex justify-end space-x-3">
          <button type="button" class="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded" on:click={() => (showReasonModal = false)}>Cancel</button>
          <button type="button" class="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded" on:click={confirmRejection}>Submit</button>
        </div>
      </div>
    </div>
  {/if}

  {#if showModal}  
    <div class="fixed inset-0 flex items-center justify-center bg-black bg-opacity-60 z-50 p-4" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close Modal"
        tabindex="-1"  
        class="fixed inset-0 w-full h-full bg-transparent cursor-default"
        on:click={hideAppointmentModal}
      ></button>
       <div class="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg mx-auto relative" role="document" on:click|stopPropagation>
        {#if selectedAppointment}
         <h3 class="text-xl font-semibold mb-5 text-center">
            Add Follow-up for
            <!-- MODIFIED for direct patientName -->
            {#if selectedAppointment.patientName && selectedAppointment.patientName !== 'Unknown Patient'}
                {selectedAppointment.patientName}
            {:else}
                Patient ID: {selectedAppointment.patientId}
            {/if}
         </h3>
         <form on:submit|preventDefault={addNewAppointment} class="space-y-4">
           <div>
             <label for="followUpDate" class="block text-sm font-medium text-gray-700">Date:</label>
             <input
               type="date"
               id="followUpDate"
               bind:value={date}
               required
               on:change={loadAvailableSlots}
               min={new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().split('T')[0]}  
               class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
             />
           </div>
           <div>
             <label for="newTimeFollowUp" class="block text-sm font-medium text-gray-700">Available Time:</label>
             <select
                id="newTimeFollowUp"
                bind:value={newTime}
                required
                class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                disabled={!date || (availableSlots.length === 0 && !loading)} 
             >
               {#if !date}
                 <option value="" disabled selected>-- Select Date First --</option>
               {:else if availableSlots.length === 0}
                 <option value="" disabled selected>-- No Slots Available --</option>
               {:else}
                 <option value="" disabled selected>-- Select a Time Slot --</option>
                 {#each availableSlots as slot (slot)}
                   <option value={slot}>{slot}</option>
                 {/each}
               {/if}
             </select>
              {#if date && availableSlots.length === 0 && !loading} <!-- Show message if no slots and not actively loading -->
                 <p class="text-xs text-red-600 mt-1">No time slots available for {new Date(date).toLocaleDateString()}. It might be fully booked or a non-working day.</p>
              {/if}
           </div>
           <div>
             <label for="followUpService" class="block text-sm font-medium text-gray-700">Service:</label>
             <input type="text" id="followUpService" bind:value={appointmentService} required class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"/>
           </div>
           <div>
             <label for="followUpSubServices" class="block text-sm font-medium text-gray-700">Sub-services (optional, comma-separated):</label>
             <input type="text" id="followUpSubServices" bind:value={subServices} placeholder="e.g., Cleaning, Checkup" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"/>
           </div>
           <div>
             <label for="followUpRemarks" class="block text-sm font-medium text-gray-700">Remarks (optional):</label>
             <input type="text" id="followUpRemarks" bind:value={remarks} placeholder="Add any notes" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"/>
           </div>
           <div class="flex justify-end space-x-3 pt-4">
             <button type="button" class="cancel-btn bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded-md" on:click={hideAppointmentModal}>Cancel</button>
             <button type="submit" class="submit-btn bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md disabled:opacity-50" disabled={!date || !newTime || !appointmentService}>Schedule Follow-up</button>
           </div>
         </form>
        {:else}
            <p class="text-center text-red-500">Error: No appointment context found for follow-up.</p>
            <div class="flex justify-end pt-4">
                <button type="button" class="cancel-btn bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded-md" on:click={hideAppointmentModal}>Close</button>
            </div>
        {/if}
       </div>
    </div>
  {/if}


  {#if isPrescriptionModalOpen}
  <div class="fixed inset-0 flex items-center justify-center bg-black bg-opacity-30 z-50 p-4">
    <div class="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg mx-auto relative max-h-[90vh] overflow-y-auto hide-scrollbar" role="dialog" aria-modal="true" aria-labelledby="prescription-title" on:click|stopPropagation>
      <button type="button" class="absolute top-3 right-3 text-gray-500 hover:text-gray-800 text-2xl font-bold" on:click={closePrescriptionModal} aria-label="Close Modal">×</button>
      {#if selectedAppointment}
        <h2 id="prescription-title" class="text-xl font-bold mb-5">
          Add Prescription for {selectedAppointment.patientName || `Patient ID: ${selectedAppointment.patientId}`}
        </h2>
        <form on:submit|preventDefault={submitPrescription} class="space-y-5">
          <!-- Section: Visit Details -->
          <div>
            <label for="dateVisited" class="block text-sm font-semibold text-gray-700 mb-1">Date Visited <span class="text-red-500">*</span></label>
            <input id="dateVisited" type="date" bind:value={dateVisited} required class="w-full border border-gray-300 rounded p-2 focus:ring-green-500 focus:border-green-500" aria-required="true" />
          </div>

          <!-- Section: Medicine -->
          <div class="mb-2">
            <label class="block text-sm font-semibold text-gray-700 mb-1">Medicine <span class="text-red-500">*</span></label>
            <div class="flex gap-2">
              <select id="availableMedicine" bind:value={selectedMedicine} class="flex-1 border border-gray-300 rounded p-2 focus:ring-green-500 focus:border-green-500" aria-label="Select Medicine from Stock" on:change={() => { if(selectedMedicine) medication = ''; }}>
    <option value={null}>-- Select Medicine --</option>
    {#each availableMedicines as med (med.id)}
        <option value={med}>{med.name} (Stock: {med.quantity})</option>
    {/each}
</select>
              <span class="text-gray-400 self-center">or</span>
              <input id="manualMedication" type="text" bind:value={medication} placeholder="e.g., Paracetamol 500mg" class="flex-1 border border-gray-300 rounded p-2 focus:ring-green-500 focus:border-green-500" aria-label="Enter Medicine Manually" on:input={() => { if(medication.trim()) selectedMedicine = null; }} disabled={!!selectedMedicine} />
              {#if medication}
                <button type="button" class="ml-1 text-xs text-gray-500 hover:text-red-500" on:click={() => medication = ''} aria-label="Clear manual medicine">✕</button>
              {/if}
            </div>
            <p class="text-xs text-gray-500 mt-1">Choose from stock or enter manually. Only one allowed.</p>
            {#if selectedMedicine && selectedMedicine.quantity <= 5}
    <p class="text-xs text-red-500 mt-1">Warning: Low stock for this medicine!</p>
{/if}
            {#if !selectedMedicine && !medication.trim() && formTriedSubmit}
              <p class="text-xs text-red-500 mt-1">Medicine is required.</p>
            {/if}
          </div>

          <!-- Section: Dosage -->
          <div>
            <label for="qtyRefills" class="block text-sm font-semibold text-gray-700 mb-1">Dosage / Quantity <span class="text-red-500">*</span></label>
            <input id="qtyRefills" type="text" bind:value={qtyRefills} required placeholder="e.g., 1 tablet 3x a day / 30 tablets" class="w-full border border-gray-300 rounded p-2 focus:ring-green-500 focus:border-green-500" aria-required="true" />
            {#if !qtyRefills.trim() && formTriedSubmit}
              <p class="text-xs text-red-500 mt-1">Dosage/Quantity is required.</p>
            {/if}
          </div>

          <!-- Section: Instructions -->
          <div>
            <label for="instructions" class="block text-sm font-semibold text-gray-700 mb-1">Instructions</label>
            <textarea id="instructions" bind:value={instructions} rows="3" placeholder="e.g., Take with food" class="w-full border border-gray-300 rounded p-2 focus:ring-green-500 focus:border-green-500"></textarea>
          </div>

          <!-- Section: Prescriber -->
          <div>
            <label for="prescriber" class="block text-sm font-semibold text-gray-700 mb-1">Prescriber <span class="text-red-500">*</span></label>
            <select id="prescriber" bind:value={prescriber} required class="w-full border border-gray-300 rounded p-2 focus:ring-green-500 focus:border-green-500" aria-required="true">
              <option value="" disabled>-- Select Prescriber --</option>
              <option value="Alfred Domingo">Alfred Domingo</option>
              <option value="Fernalyn Domingo">Fernalyn Domingo</option>
            </select>
            {#if !prescriber && formTriedSubmit}
              <p class="text-xs text-red-500 mt-1">Prescriber is required.</p>
            {/if}
          </div>

          <!-- Section: Summary -->
          {#if (selectedMedicine || medication.trim()) && qtyRefills.trim() && prescriber}
            <div class="bg-gray-50 border border-gray-200 rounded p-3 mt-4">
              <h4 class="text-sm font-semibold mb-2 text-gray-700">Prescription Summary</h4>
              <ul class="text-sm text-gray-700 list-disc ml-5">
<li><b>Medicine:</b> {selectedMedicine ? selectedMedicine.name : medication}</li>                <li><b>Dosage/Qty:</b> {qtyRefills}</li>
                {#if instructions.trim()}<li><b>Instructions:</b> {instructions}</li>{/if}
                <li><b>Prescriber:</b> {prescriber}</li>
                <li><b>Date Visited:</b> {dateVisited}</li>
              </ul>
            </div>
          {/if}

          <div class="flex justify-end pt-4">
            <button type="button" class="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded-md mr-3" on:click={closePrescriptionModal}>Cancel</button>
            <button type="submit" class="bg-green-500 hover:bg-green-600 text-white py-2 px-4 rounded focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50" disabled={!prescriber || (!selectedMedicine && !medication.trim()) || !qtyRefills.trim()} on:click={() => formTriedSubmit = true}>
              Submit Prescription
            </button>
          </div>
        </form>
      {:else}
        <p class="text-center text-red-500">Error: No appointment context found for prescription.</p>
        <div class="flex justify-end pt-4">
          <button type="button" class="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded-md mr-3" on:click={closePrescriptionModal}>Close</button>
        </div>
      {/if}
    </div>
  </div>
{/if}


</div>

<style>
   .icon-buttons img.icon { cursor: pointer; transition: transform 0.2s ease; }
   .icon-buttons img.icon:hover { transform: scale(1.1); }
   .appointment-container1::-webkit-scrollbar { width: 6px; }
   .appointment-container1::-webkit-scrollbar-thumb { background-color: #cbd5e1;  border-radius: 3px; }
   .appointment-container1::-webkit-scrollbar-track { background-color: #f1f5f9;  }
   .appointment-container1 { scrollbar-width: thin; scrollbar-color: #cbd5e1 #f1f5f9; }

    select:disabled {
        cursor: not-allowed;
        background-color: #f3f4f6; 
        color: #9ca3af;
    }
   
    .fixed.inset-0 {
        z-index: 50; 
    }

    .hide-scrollbar {
      scrollbar-width: none; /* Firefox */
    }
    .hide-scrollbar::-webkit-scrollbar {
      display: none; /* Chrome, Safari, Opera */
    }
</style>