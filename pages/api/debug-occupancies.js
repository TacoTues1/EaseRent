// Debug API to check occupancy data
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  try {
    const today = new Date();
    const targetDate = new Date();
    targetDate.setDate(today.getDate() + 3);
    const targetDay = targetDate.getDate();

    const { data: occupancies, error } = await supabaseAdmin
      .from('tenant_occupancies')
      .select(`
        id,
        tenant_id,
        status,
        start_date,
        tenant:profiles!tenant_occupancies_tenant_id_fkey(first_name, last_name, phone),
        property:properties(title, price)
      `)
      .eq('status', 'active');

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const analysis = (occupancies || []).map(occ => {
      const startDay = occ.start_date ? new Date(occ.start_date).getDate() : null;
      return {
        id: occ.id,
        tenant: `${occ.tenant?.first_name || ''} ${occ.tenant?.last_name || ''}`.trim(),
        phone: occ.tenant?.phone,
        property: occ.property?.title,
        start_date: occ.start_date,
        start_day: startDay,
        rent_amount: occ.property?.price,
        matches_target: startDay === targetDay
      };
    });

    res.status(200).json({
      today: today.toDateString(),
      target_date: targetDate.toDateString(),
      target_day: targetDay,
      total_active_occupancies: occupancies?.length || 0,
      occupancies: analysis
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
