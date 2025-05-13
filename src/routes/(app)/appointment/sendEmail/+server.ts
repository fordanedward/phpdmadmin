import { json } from '@sveltejs/kit';
import { sendAppointmentNotification } from '$lib/emailTemplate.js';

export async function POST({ request }) {
    try {
        console.log('Received email request...');
        const { patientEmail, patientName, status, appointmentDetails } = await request.json();
        
        console.log('Request data:', {
            patientEmail,
            patientName,
            status,
            appointmentDetails
        });
        
        // Validate required fields
        if (!patientEmail || !patientName || !status || !appointmentDetails) {
            console.error('Missing required fields:', {
                hasEmail: !!patientEmail,
                hasName: !!patientName,
                hasStatus: !!status,
                hasDetails: !!appointmentDetails
            });
            return new Response(
                JSON.stringify({ 
                    success: false, 
                    message: 'Missing required fields' 
                }), 
                { status: 400 }
            );
        }

        console.log('Attempting to send email notification...');
        // Send the email
        await sendAppointmentNotification(
            patientEmail,
            patientName,
            status,
            appointmentDetails
        );

        console.log('Email sent successfully');
        // Return success response
        return json({ 
            success: true, 
            message: 'Email sent successfully' 
        });

    } catch (error) {
        console.error('Detailed error in sendEmail endpoint:', error);
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace available');
        
        // Return error response with details
        return new Response(
            JSON.stringify({ 
                success: false, 
                message: error instanceof Error ? error.message : 'Failed to send email',
                error: error instanceof Error ? error.stack : String(error)
            }), 
            { status: 500 }
        );
    }
}