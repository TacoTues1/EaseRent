// One-time script to fix existing late-fee notifications
// that incorrectly say "auto-deducted from security deposit"
// when the tenant had no security deposit.
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Fetch all security_deposit_deduction notifications
    const { data: notifications, error: fetchErr } = await supabaseAdmin
      .from('notifications')
      .select('id, recipient, message, type')
      .eq('type', 'security_deposit_deduction');

    if (fetchErr) {
      console.error('Error fetching notifications:', fetchErr);
      return res.status(500).json({ error: fetchErr.message });
    }

    if (!notifications || notifications.length === 0) {
      return res.status(200).json({ message: 'No notifications to fix.', fixed: 0 });
    }

    console.log(`[Fix Notifications] Found ${notifications.length} security_deposit_deduction notifications.`);

    let fixedCount = 0;

    for (const notif of notifications) {
      // Check if recipient actually has a security deposit
      // Fetch the occupancy for this tenant to check deposit
      const { data: occupancies } = await supabaseAdmin
        .from('tenant_occupancies')
        .select('id, security_deposit, security_deposit_used')
        .eq('tenant_id', notif.recipient)
        .eq('status', 'active')
        .limit(1);

      const occ = occupancies?.[0];
      const securityDeposit = parseFloat(occ?.security_deposit || 0);
      const securityDepositUsed = parseFloat(occ?.security_deposit_used || 0);
      const availableDeposit = securityDeposit - securityDepositUsed;

      // If tenant has no deposit (or deposit is 0), fix the wording
      if (securityDeposit === 0) {
        // Extract the amount and property name from the existing message
        const amountMatch = notif.message.match(/₱([\d,]+)/);
        const propertyMatch = notif.message.match(/"([^"]+)"/);

        if (amountMatch && propertyMatch) {
          const amount = amountMatch[1];
          const propertyTitle = propertyMatch[1];

          // Check if it's a landlord notification (mentions "tenant's") or tenant notification
          const isLandlordNotif = notif.message.includes("tenant's security deposit");
          
          let newMessage;
          if (isLandlordNotif) {
            newMessage = `₱${amount} has been auto-added as a late payment penalty for "${propertyTitle}".`;
          } else {
            newMessage = `₱${amount} has been auto-added as a late payment penalty for "${propertyTitle}".`;
          }

          const { error: updateErr } = await supabaseAdmin
            .from('notifications')
            .update({ 
              message: newMessage,
              type: 'late_fee_no_deposit'
            })
            .eq('id', notif.id);

          if (!updateErr) {
            fixedCount++;
            console.log(`[Fix Notifications] ✅ Fixed notification ${notif.id}: "${newMessage}"`);
          } else {
            console.error(`[Fix Notifications] ❌ Failed to fix notification ${notif.id}:`, updateErr);
          }
        }
      } else {
        console.log(`[Fix Notifications] ⏭️ Skipped notification ${notif.id} — tenant has deposit of ₱${securityDeposit}`);
      }
    }

    return res.status(200).json({ 
      message: `Fixed ${fixedCount} out of ${notifications.length} notifications.`,
      total: notifications.length,
      fixed: fixedCount
    });

  } catch (err) {
    console.error('[Fix Notifications] Exception:', err);
    return res.status(500).json({ error: err.message });
  }
}
