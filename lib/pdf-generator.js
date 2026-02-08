
import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';

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
                Author: 'TessyNTed',
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

        // --- LOGO ---
        try {
            const logoPath = path.join(process.cwd(), 'public', 'home.png');
            if (fs.existsSync(logoPath)) {
                doc.image(logoPath, (doc.page.width - 60) / 2, 30, { width: 60 });
                doc.moveDown(4);
            }
        } catch (logoErr) {
            console.error('Error loading logo:', logoErr);
        }

        // --- HEADER ---
        doc.font('Helvetica-Bold').fontSize(20).text('TessyNTed', { align: 'center' });
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
        doc.text('For inquiries, contact support at tessynted@gmail.com.', { align: 'center' });

        doc.end();
    });
}

/**
 * Generates a password-protected PDF Income Statement for Landlords
 * 
 * @param {Object} landlord - { first_name, last_name, phone, email }
 * @param {Array} propertySummary - Array of { title, income, payments }
 * @param {Object} period - { start: Date, end: Date, monthName: string, year: number }
 * @param {number} totalIncome - Total income for the period
 * @param {string} password - The password to open the PDF
 * @param {Array} payments - Array of individual payment objects (optional)
 * @param {Object} propMap - Property ID to title mapping (optional)
 * @returns {Promise<Buffer>}
 */
export async function generateLandlordStatementPDF(landlord, propertySummary, period, totalIncome, password, payments = [], propMap = {}) {
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
                Title: `Monthly Income Statement - ${period.monthName} ${period.year}`,
                Author: 'TessyNTed',
                Subject: `Income Statement for ${landlord.first_name} ${landlord.last_name}`
            }
        });

        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
            const pdfData = Buffer.concat(buffers);
            resolve(pdfData);
        });
        doc.on('error', reject);

        // --- LOGO ---
        try {
            const logoPath = path.join(process.cwd(), 'public', 'home.png');
            if (fs.existsSync(logoPath)) {
                doc.image(logoPath, (doc.page.width - 60) / 2, 30, { width: 60 });
                doc.moveDown(4);
            }
        } catch (logoErr) {
            console.error('Error loading logo:', logoErr);
        }

        // --- HEADER ---
        doc.font('Helvetica-Bold').fontSize(20).text('TessyNTed', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(12).font('Helvetica').text('Monthly Income Statement', { align: 'center' });
        doc.moveDown(2);

        // --- LANDLORD DETAILS ---
        doc.fontSize(10).text(`Statement Period: ${period.start.toLocaleDateString()} - ${period.end.toLocaleDateString()}`, { align: 'right' });
        doc.moveDown(0.5);

        doc.text(`Landlord: ${landlord.first_name} ${landlord.last_name}`);
        doc.text(`Mobile: ${landlord.phone || 'N/A'}`);
        doc.text(`Email: ${landlord.email}`);
        doc.moveDown(2);

        // --- SUMMARY BOX ---
        const boxTop = doc.y;
        doc.rect(50, boxTop, 500, 60).fill('#f0f9ff');
        doc.fillColor('#000').font('Helvetica-Bold').fontSize(12);
        doc.text('TOTAL INCOME FOR PERIOD', 60, boxTop + 15);
        doc.fontSize(24).fillColor('#059669');
        doc.text(`PHP ${totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 60, boxTop + 32);
        doc.fillColor('#000');
        doc.moveDown(3);

        // --- DETAILED TRANSACTIONS TABLE ---
        const tableTop = doc.y + 20;
        const dateX = 50;
        const billTypeX = 140;
        const propertyX = 270;
        const amountX = 500;

        doc.font('Helvetica-Bold').fontSize(9);
        doc.text('Date', dateX, tableTop);
        doc.text('Bill Type', billTypeX, tableTop);
        doc.text('Property', propertyX, tableTop);
        doc.text('Amount', amountX, tableTop, { align: 'right' });

        doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();
        doc.font('Helvetica').fontSize(8);
        doc.moveDown(1.5);

        // --- TABLE ROWS (Individual Transactions) ---
        let y = doc.y;

        if (!payments || payments.length === 0) {
            doc.text('No income recorded for this period.', dateX, y);
            y += 20;
        } else {
            // Sort payments by date/time (newest first)
            const sortedPayments = [...payments].sort((a, b) => {
                const dateA = new Date(a.paid_at || a.created_at);
                const dateB = new Date(b.paid_at || b.created_at);
                return dateB - dateA;
            });

            sortedPayments.forEach(payment => {
                // Check for page break
                if (y > 700) {
                    doc.addPage();
                    y = 50;
                }

                // Format date and time
                const paymentDate = new Date(payment.paid_at || payment.created_at);
                const dateStr = paymentDate.toLocaleDateString('en-US', {
                    month: 'short',
                    day: '2-digit'
                });
                const timeStr = paymentDate.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                });
                const dateTimeStr = `${dateStr} ${timeStr}`;

                // Determine bill type from payment data
                const getBillType = (p) => {
                    if (p.bills_description) return p.bills_description;

                    const types = [];
                    if (parseFloat(p.rent_amount) > 0) types.push('Rent');
                    if (parseFloat(p.security_deposit_amount) > 0) types.push('Security Dep');
                    if (parseFloat(p.advance_amount) > 0) types.push('Advance');
                    if (parseFloat(p.water_bill) > 0) types.push('Water');
                    if (parseFloat(p.electrical_bill) > 0) types.push('Electric');
                    if (parseFloat(p.wifi_bill) > 0) types.push('WiFi');
                    if (parseFloat(p.other_bills) > 0) types.push('Other');

                    return types.length > 0 ? types.join(', ') : 'Payment';
                };
                const billType = getBillType(payment);

                // Get property name
                const propTitle = propMap[payment.property_id] || 'Unknown Property';

                // Calculate payment total
                const paymentTotal = parseFloat(payment.amount_paid || 0) || (
                    (parseFloat(payment.rent_amount) || 0) +
                    (parseFloat(payment.security_deposit_amount) || 0) +
                    (parseFloat(payment.advance_amount) || 0) +
                    (parseFloat(payment.water_bill) || 0) +
                    (parseFloat(payment.electrical_bill) || 0) +
                    (parseFloat(payment.wifi_bill) || 0) +
                    (parseFloat(payment.other_bills) || 0)
                );

                doc.text(dateTimeStr, dateX, y, { width: 85, lineBreak: false });
                doc.text(billType, billTypeX, y, { width: 120, lineBreak: false, ellipsis: true });
                doc.text(propTitle, propertyX, y, { width: 170, lineBreak: false, ellipsis: true });
                doc.text(`PHP ${paymentTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, amountX, y, { align: 'right' });

                y += 18;
            });
        }

        doc.moveTo(50, y).lineTo(550, y).stroke();
        doc.moveDown(1);

        // --- TOTAL ---
        y += 10;
        doc.font('Helvetica-Bold');
        doc.text('TOTAL:', 350, y);
        doc.text(`PHP ${totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, amountX, y, { align: 'right' });

        // --- FOOTER ---
        doc.moveDown(4);
        doc.fontSize(8).font('Helvetica-Oblique').text('This is a system-generated document. No signature required.', { align: 'center' });
        doc.text('For inquiries, contact support at tessynted@gmail.com.', { align: 'center' });

        doc.end();
    });
}

