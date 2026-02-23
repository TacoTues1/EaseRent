import { cleanupStalePendingMessages } from '../../lib/sms';

/**
 * API: Cleanup stale pending SMS messages
 * 
 * GET  /api/cleanup-sms  → Check for stale pending messages
 * 
 * Messages with TTL of 1200s (20 min) are auto-expired by the gateway.
 * This endpoint lets you monitor and verify the cleanup is working.
 */
export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const result = await cleanupStalePendingMessages();
        return res.status(200).json(result);
    } catch (error) {
        console.error('Cleanup SMS API error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to cleanup pending messages'
        });
    }
}
