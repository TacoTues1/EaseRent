-- ============================================================
-- Family Members Feature: Tables & Columns
-- ============================================================

-- 1. Add family member columns to tenant_occupancies
ALTER TABLE tenant_occupancies ADD COLUMN IF NOT EXISTS is_family_member BOOLEAN DEFAULT FALSE;
ALTER TABLE tenant_occupancies ADD COLUMN IF NOT EXISTS parent_occupancy_id UUID REFERENCES tenant_occupancies(id) ON DELETE SET NULL;

-- 2. Create family_members table
CREATE TABLE IF NOT EXISTS family_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_occupancy_id UUID NOT NULL REFERENCES tenant_occupancies(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  member_occupancy_id UUID REFERENCES tenant_occupancies(id) ON DELETE SET NULL,
  added_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(parent_occupancy_id, member_id)
);

-- 3. Enable RLS
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
CREATE POLICY "Users can view family members of their occupancy" ON family_members
  FOR SELECT USING (
    added_by = auth.uid() OR member_id = auth.uid()
  );

CREATE POLICY "Primary tenant can insert family members" ON family_members
  FOR INSERT WITH CHECK (
    added_by = auth.uid()
  );

CREATE POLICY "Primary tenant can delete family members" ON family_members
  FOR DELETE USING (
    added_by = auth.uid()
  );

-- 5. Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_family_members_parent_occupancy ON family_members(parent_occupancy_id);
CREATE INDEX IF NOT EXISTS idx_family_members_member_id ON family_members(member_id);
CREATE INDEX IF NOT EXISTS idx_tenant_occupancies_parent ON tenant_occupancies(parent_occupancy_id) WHERE parent_occupancy_id IS NOT NULL;
