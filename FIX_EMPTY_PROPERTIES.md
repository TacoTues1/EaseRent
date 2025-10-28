# 🚨 URGENT FIX: Properties Not Loading

## Problem
Homepage shows: "No properties available at the moment"
Console shows: `Featured properties loaded: []` (empty array)

## Root Cause
**Row Level Security (RLS)** is blocking anonymous users from reading properties!

---

## ✅ QUICK FIX (30 seconds)

### Go to Supabase and run this SQL:

1. **Open**: https://supabase.com/dashboard
2. **Select project**: `zyyrarvawwqpnolukuav`
3. **Go to**: SQL Editor
4. **Copy and paste this**:

```sql
-- Allow everyone to view properties (including non-logged-in users)
DROP POLICY IF EXISTS "Anyone can view available properties" ON properties;
DROP POLICY IF EXISTS "Landlords can view own properties" ON properties;

CREATE POLICY "Public can view all properties"
ON properties FOR SELECT
TO public
USING (true);
```

5. **Click "Run"**
6. **Refresh your homepage**

✅ Properties should now appear!

---

## Why This Happened

The RLS policies we created earlier only allowed **authenticated** users to view properties.

**Old policy**:
```sql
TO authenticated  -- ❌ Blocks anonymous users
```

**New policy**:
```sql
TO public  -- ✅ Allows everyone (logged in or not)
```

---

## Alternative (If you want to hide unavailable properties)

```sql
CREATE POLICY "Public can view available properties"
ON properties FOR SELECT
TO public
USING (available = true);
```

This shows only `available = true` properties to public.

---

## Verify It Worked

After running the SQL:

1. **Refresh**: http://localhost:3000
2. **Check console** (F12): Should see `Featured properties loaded: Array(2)`
3. **Homepage**: Should see your 2 properties

---

## Quick Test SQL

To check what policies exist:
```sql
SELECT * FROM pg_policies WHERE tablename = 'properties';
```

To check your properties:
```sql
SELECT id, title, available FROM properties;
```

---

**Run the SQL above and refresh!** Your properties will appear immediately. 🚀
