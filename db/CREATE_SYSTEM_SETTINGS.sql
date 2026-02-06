-- Create system_settings table for storing app-wide settings
-- This table stores key-value pairs for global configuration

CREATE TABLE IF NOT EXISTS public.system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT NOT NULL UNIQUE,
    value JSONB NOT NULL DEFAULT 'true'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read settings
CREATE POLICY "Anyone can read system settings"
    ON public.system_settings
    FOR SELECT
    USING (true);

-- Only admins can update settings (using profiles role check)
CREATE POLICY "Admins can update system settings"
    ON public.system_settings
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Only admins can insert settings
CREATE POLICY "Admins can insert system settings"
    ON public.system_settings
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Insert default reminders enabled setting
INSERT INTO public.system_settings (key, value)
VALUES ('reminders_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Create an index for faster key lookups
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON public.system_settings(key);
