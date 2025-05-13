import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { sendAppointmentNotification } from '$lib/emailTemplate.js';

export async function POST({ request }: RequestEvent) {
    try {
        const { patientEmail, patientName, status, appointmentDetails } = await request.json();
        
        await sendAppointmentNotification(
            patientEmail,
            patientName,
            status,
            appointmentDetails
        );
        
        return json({ success: true });
    } catch (error) {
        console.error('Email API error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return json({ success: false, error: errorMessage }, { status: 500 });
    }
}