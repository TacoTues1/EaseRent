
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const { enable } = req.body // true or false

    try {
        // First, try to check if the row exists
        const { data: existingRow, error: selectError } = await supabase
            .from('system_settings')
            .select('id')
            .eq('key', 'reminders_enabled')
            .single()

        if (selectError && selectError.code !== 'PGRST116') {
            // PGRST116 = "no rows returned" which is fine for first-time setup
            // Any other error means table might not exist
            console.error("Select error:", selectError)
            throw new Error("system_settings table may not exist. Please run the CREATE_SYSTEM_SETTINGS.sql migration first.")
        }

        let result;
        if (existingRow) {
            // Update existing row
            result = await supabase
                .from('system_settings')
                .update({ value: enable, updated_at: new Date().toISOString() })
                .eq('key', 'reminders_enabled')
        } else {
            // Insert new row
            result = await supabase
                .from('system_settings')
                .insert({ key: 'reminders_enabled', value: enable })
        }

        if (result.error) {
            console.error("Upsert error:", result.error)
            throw result.error
        }

        return res.status(200).json({ success: true, enabled: enable })
    } catch (error) {
        console.error("Toggle error:", error)
        return res.status(500).json({ error: error.message || "Failed to toggle reminders" })
    }
}
