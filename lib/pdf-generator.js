
import PDFDocument from 'pdfkit';

/**
 * Generates a password-protected PDF Statement of Account
 * 
 * @param {Object} tenant - { first_name, last_name, phone, email }
 * @param {Array} payments - Array of payment objects { created_at, amount, status, description/title }
 * @param {Object} period - { start: Date, end: Date, monthYear: string }
 * @param {string} password - The password to open the PDF
 * @returns {Promise<Buffer>}
 */
export async function generateStatementPDF(tenant, payments, period, password) {
    return new Promise((resolve, reject) => {
        // Create new PDF document with encryption
        const doc = new PDFDocument({
            margin: 50,
            userPassword: password, // User needs this to open
            ownerPassword: process.env.PDF_MASTER_PASSWORD || 'master_admin_secret', // Admin password
            permissions: {
                printing: 'highResolution',
                modifying: false,
                copying: true
            },
            info: {
                Title: `State of Account - ${period.monthYear}`,
                Author: 'EaseRent - Rental Management System',
                Subject: `Statement for ${tenant.first_name} ${tenant.last_name}`
            }
        });

        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
            const pdfData = Buffer.concat(buffers);
            resolve(pdfData);
        });
        doc.on('error', reject);

        // --- HEADER ---
        doc.font('Helvetica-Bold').fontSize(20).text('EaseRent - Rental Management System', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(12).font('Helvetica').text('Official Account Statement', { align: 'center' });
        doc.moveDown(2);

        // --- TENANT DETAILS ---
        doc.fontSize(10).text(`Statement Period: ${period.start.toLocaleDateString()} - ${period.end.toLocaleDateString()}`, { align: 'right' });
        doc.moveDown(0.5);

        doc.text(`Tenant: ${tenant.first_name} ${tenant.last_name}`);
        doc.text(`Mobile: ${tenant.phone || 'N/A'}`);
        doc.text(`Email: ${tenant.email}`);
        doc.moveDown(2);

        // --- TABLE HEADERS ---
        const tableTop = doc.y;
        const dateX = 50;
        const descX = 150;
        const statusX = 350;
        const amountX = 450;

        doc.font('Helvetica-Bold');
        doc.text('Date', dateX, tableTop);
        doc.text('Description', descX, tableTop);
        doc.text('Status', statusX, tableTop);
        doc.text('Amount', amountX, tableTop, { align: 'right' });

        doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();
        doc.font('Helvetica');
        doc.moveDown(1.5);

        // --- TABLE ROWS ---
        let totalAmount = 0;
        let y = doc.y;

        if (payments.length === 0) {
            doc.text('No transactions for this period.', dateX, y);
            y += 20;
        } else {
            payments.forEach(payment => {
                // Check for page break
                if (y > 700) {
                    doc.addPage();
                    y = 50;
                }

                const dateValue = payment.paid_at || payment.due_date || payment.created_at || new Date();
                const dateStr = new Date(dateValue).toLocaleDateString();
                const desc = payment.bills_description || payment.title || 'Rent & Utilities Payment';
                const status = (payment.status || 'recorded').toUpperCase();

                // Sum all components - using correct field names from payment_requests table
                const rent = parseFloat(payment.rent_amount || 0);
                const water = parseFloat(payment.water_bill || 0);
                const electric = parseFloat(payment.electrical_bill || 0);
                const other = parseFloat(payment.other_bills || 0);
                const securityDeposit = parseFloat(payment.security_deposit_amount || 0);
                const advance = parseFloat(payment.advance_amount || 0);

                const totalTxnAmount = rent + water + electric + other + securityDeposit + advance;

                if (['PAID', 'COMPLETED', 'CONFIRMED', 'RECORDED'].includes(status)) {
                    totalAmount += totalTxnAmount;
                }

                doc.text(dateStr, dateX, y);
                doc.text(desc, descX, y, { width: 180, lineBreak: false, ellipsis: true });
                doc.text(status, statusX, y);
                doc.text(`PHP ${totalTxnAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, amountX, y, { align: 'right' });

                y += 20;
            });
        }

        doc.moveTo(50, y).lineTo(550, y).stroke();
        doc.moveDown(1);

        // --- TOTAL ---
        y += 10;
        doc.font('Helvetica-Bold');
        doc.text('TOTAL PAID:', statusX, y);
        doc.text(`PHP ${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, amountX, y, { align: 'right' });

        // --- FOOTER ---
        doc.moveDown(4);
        doc.fontSize(8).font('Helvetica-Oblique').text('This is a system-generated document. No signature required.', { align: 'center' });
        doc.text('For inquiries, contact support at admin@easerent.com.', { align: 'center' });

        doc.end();
    });
}
