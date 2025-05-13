import nodemailer from 'nodemailer';

export interface AppointmentDetails {
    date: string;
    time: string;
    service: string;
    reason?: string | null;
}

// Create a single transporter instance to reuse
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'tanyangqty25@gmail.com',
    pass: 'sgnc yklv mieh nvfa',
  },
});

export async function sendAppointmentNotification(
    patientEmail: string,
    patientName: string,
    appointmentStatus: string,
    appointmentDetails: AppointmentDetails
): Promise<void> {
    try {
        let subject = `Appointment ${appointmentStatus}`;
        let messageContent = `
            <p>Dear ${patientName},</p>
            <p>Your appointment has been <strong>${appointmentStatus}</strong>.</p>
            <p><strong>Details:</strong></p>
            <ul>
                <li><strong>Date:</strong> ${appointmentDetails.date}</li>
                <li><strong>Time:</strong> ${appointmentDetails.time}</li>
                <li><strong>Service:</strong> ${appointmentDetails.service}</li>
            </ul>
        `;
        
        // Add reason for declined appointments
        if (appointmentStatus === 'Declined' && appointmentDetails.reason) {
            messageContent += `
                <p><strong>Reason:</strong> ${appointmentDetails.reason}</p>
            `;
        }
        
        // Add closing
        messageContent += `
            <p>Best regards,</p>
            <p>AFDomingo Dental Clinic</p>
        `;

        await transporter.sendMail({
            from: '"AFDomingo Dental Clinic" <tanyangqty25@gmail.com>',
            to: patientEmail,
            subject: subject,
            html: messageContent,
        });

        return;
    } catch (error) {
        console.error('Error sending email:', error);
        if (error instanceof Error) {
            throw new Error(`Failed to send email: ${error.message}`);
        } else {
            throw new Error('Failed to send email: An unknown error occurred.');
        }
    }
}