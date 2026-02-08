// pages/api/send-landlord-statement.js
import { sendLandlordMonthlyStatementEmail } from '../../lib/email'

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const {
            landlordEmail,
            landlordName,
            month,
            year,
            monthName,
            totalIncome,
            propertySummary
        } = req.body

        if (!landlordEmail) {
            return res.status(400).json({ error: 'Missing landlord email' })
        }

        // Calculate period dates
        const periodStart = new Date(year, month, 1)
        const periodEnd = new Date(year, month + 1, 0)

        const result = await sendLandlordMonthlyStatementEmail({
            to: landlordEmail,
            landlordName: landlordName || 'Landlord',
            period: {
                monthName: monthName,
                year: year,
                start: periodStart,
                end: periodEnd
            },
            totalIncome: totalIncome || 0,
            transactions: [], // Can be expanded to include transaction details
            propertySummary: propertySummary || []
        })

        if (result.success) {
            return res.status(200).json({ success: true })
        } else {
            throw new Error(result.error || 'Failed to send email')
        }
    } catch (error) {
        console.error('Send landlord statement error:', error)
        return res.status(500).json({ error: error.message || 'Internal server error' })
    }
}
