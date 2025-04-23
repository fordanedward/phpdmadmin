export type Appointment = {
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
    [key: string]: any;
  };
  
  export interface PatientProfile {
    id: string;
    name: string;
    lastName: string;
    age: number;
  }
  
  export interface Prescription {
    appointmentId: string;
    medicine: string;
    dosage: string;
    instructions: string;
  }
  
  export interface Medicine {
    id: string;
    name: string;
    quantity: number;
  }
  
  export interface PrescriptionMedicine {
    medicine: string;
    dosage: string;
    instructions: string;
  }



export interface PatientProfile {
    id: string;
    name: string;
    // Add other patient profile properties as needed
}