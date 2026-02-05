import {
    sendViewingApprovalEmail,
    sendMoveOutEmail,
    sendAssignmentEmail,
    sendMaintenanceEmail,
    sendBookingEmail,
    sendEndContractEmail,
    sendNewPaymentBillEmail,
    sendNewBookingNotificationEmail,
    sendNotificationEmail,
    sendMonthlyStatementEmail
} from '../../lib/email'

import {
    sendSMS,
    sendOTP,
    sendBookingConfirmation,
    sendBillNotification,
    sendBookingReminder,
    sendUnreadMessageNotification,
    sendNewApplicationNotification,
    sendNewBookingNotification,
    sendPaymentReminder,
    sendMaintenanceUpdate,
    sendApplicationStatus
} from '../../lib/sms'

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { email, phone, type } = req.body;

    if (!email && !phone) {
        return res.status(400).json({ error: 'Email or Phone is required' });
    }

    const results = [];

    // Helper to run safely
    const runSafe = async (name, fn) => {
        try {
            const result = await fn();
            results.push({ name, success: true, result });
        } catch (e) {
            console.error(`Error sending ${name}:`, e);
            results.push({ name, success: false, error: e.message || String(e) });
        }
    }

    const commonData = {
        to: email,
        tenantName: 'Test Tenant',
        landlordName: 'Test Landlord',
        propertyTitle: 'Sunset Villa',
        propertyAddress: '123 Sunset Blvd',
        viewingDate: new Date(),
        timeSlot: '10:00 AM',
        landlordPhone: '+63 900 000 0000',
        amount: 15000,
        dueDate: new Date(),
        status: 'pending',
        recipientName: 'Test User'
    }

    // --- EMAILS ---
    if (email && (type === 'email' || type === 'all')) {
        await runSafe('Email: Viewing Approval', () => sendViewingApprovalEmail({ ...commonData }));
        await runSafe('Email: Move Out', () => sendMoveOutEmail({ ...commonData, reason: 'Relocating for work' }));
        await runSafe('Email: Assignment', () => sendAssignmentEmail({ ...commonData, phone: commonData.landlordPhone, address: commonData.propertyAddress }));
        await runSafe('Email: Maintenance (New)', () => sendMaintenanceEmail({ ...commonData, title: 'Leaky Faucet', isUpdate: false }));
        await runSafe('Email: Maintenance (Update)', () => sendMaintenanceEmail({ ...commonData, title: 'Leaky Faucet', isUpdate: true, status: 'in_progress' }));
        await runSafe('Email: Booking (New)', () => sendBookingEmail({ ...commonData, date: new Date(), isNew: true }));
        await runSafe('Email: Booking (Update)', () => sendBookingEmail({ ...commonData, date: new Date(), isNew: false, status: 'confirmed' }));
        await runSafe('Email: End Contract', () => sendEndContractEmail({ ...commonData, endDate: new Date(), customMessage: 'Thank you for your stay!' }));

        // --- BILLS (Added Electricity, Wifi, Other) ---
        await runSafe('Email: New Bill (Rent)', () => sendNewPaymentBillEmail({ ...commonData, billType: 'rent', description: 'Monthly rent' }));
        await runSafe('Email: New Bill (Water)', () => sendNewPaymentBillEmail({ ...commonData, billType: 'water', amount: 500, description: 'Water bill' }));
        await runSafe('Email: New Bill (Electricity)', () => sendNewPaymentBillEmail({ ...commonData, billType: 'electricity', amount: 3500, description: 'Electricity bill' }));
        await runSafe('Email: New Bill (WiFi)', () => sendNewPaymentBillEmail({ ...commonData, billType: 'wifi', amount: 1500, description: 'Internet bill' }));
        await runSafe('Email: New Bill (Other)', () => sendNewPaymentBillEmail({ ...commonData, billType: 'other', amount: 1000, description: 'Association Dues' }));

        await runSafe('Email: New Booking Notification', () => sendNewBookingNotificationEmail({ ...commonData, tenantPhone: '+63 900 000 1234', bookingDate: new Date() }));
        await runSafe('Email: Monthly Statement', () => sendMonthlyStatementEmail({
            to: email,
            tenantName: 'Test Tenant',
            period: {
                monthName: 'January',
                year: '2026',
                start: new Date('2026-01-01'),
                end: new Date('2026-01-31')
            },
            pdfBuffer: Buffer.from('Dummy Hub PDF Content')
        }));
        await runSafe('Email: Generic Notification', () => sendNotificationEmail({ to: email, subject: 'Test Notification', message: '<h1>This is a test notification</h1>' }));
    }

    // --- SMS ---
    if (phone && (type === 'sms' || type === 'all')) {
        const dummyBooking = { propertyName: 'Sunset Villa', date: '2026-02-06', time: '10:00 AM', id: 'BK-123', tenantName: 'Test Tenant', propertyTitle: 'Sunset Villa' };

        // --- BILLS (SMS) ---
        const rentBill = { propertyName: 'Sunset Villa', amount: '15000', dueDate: '2026-02-10' };

        // Since the SMS helper `sendBillNotification` takes a bill object but the message is generic ("You received a bill..."), 
        // it doesn't currently distinguish bill type in the text unless we modify `lib/sms.js`. 
        // However, I will trigger multiple SMS for bills to verify delivery.

        const dummyApp = { applicantName: 'Test Tenant', propertyName: 'Sunset Villa', status: 'pending' };
        const dummyMaintenance = { title: 'Broken AC', status: 'In Progress', note: 'Technician arriving at 2pm' };

        await runSafe('SMS: Direct', () => sendSMS(phone, 'This is a direct test SMS from EaseRent.'));
        await runSafe('SMS: OTP', () => sendOTP(phone, '123456'));
        await runSafe('SMS: Booking Confirmation', () => sendBookingConfirmation(phone, dummyBooking));

        await runSafe('SMS: Bill Notification', () => sendBillNotification(phone, rentBill));

        await runSafe('SMS: Booking Reminder', () => sendBookingReminder(phone, dummyBooking));
        await runSafe('SMS: Unread Message', () => sendUnreadMessageNotification(phone, 3, 'Test Landlord'));
        await runSafe('SMS: New Application', () => sendNewApplicationNotification(phone, dummyApp));
        await runSafe('SMS: New Booking Request', () => sendNewBookingNotification(phone, dummyBooking));
        await runSafe('SMS: Payment Reminder', () => sendPaymentReminder(phone, rentBill));
        await runSafe('SMS: Maintenance Update', () => sendMaintenanceUpdate(phone, dummyMaintenance));
        await runSafe('SMS: Application Status (Approved)', () => sendApplicationStatus(phone, { ...dummyApp, status: 'approved' }));
        await runSafe('SMS: Application Status (Rejected)', () => sendApplicationStatus(phone, { ...dummyApp, status: 'rejected' }));
    }

    res.status(200).json({ success: true, results });
}
