# 🔒 Security Fix: Row Level Security (RLS) Setup

## Problem Fixed
1. ❌ **Tenants could add properties** → ✅ Only landlords can now add properties
2. ❌ **406 errors on profiles table** → ✅ Fixed with proper RLS policies

---

## 🚨 CRITICAL: Run This SQL First

The **406 error** means Supabase is blocking access to your database tables because Row Level Security (RLS) is enabled but no policies exist.

### Step 1: Enable RLS and Create Policies

1. **Open Supabase Dashboard**: https://supabase.com/dashboard
2. **Select Your Project**: `zyyrarvawwqpnolukuav`
3. **Go to SQL Editor**: Click "SQL Editor" in left sidebar
4. **Create New Query**: Click "New Query"
5. **Copy and Paste**: Copy the ENTIRE content from `db/rls_policies.sql`
6. **Execute**: Click "Run" or press `Ctrl+Enter`
7. **Verify Success**: You should see "Success" message

---

## ✅ What Was Fixed

### 1. Landlord-Only Property Creation
- **File**: `pages/properties/new.js`
- **Changes**: 
  - Added role check before allowing access
  - Displays "Access Denied" for non-landlords
  - Auto-redirects tenants to dashboard
  
### 2. Navbar Update
- **File**: `components/Navbar.js`
- **Changes**: 
  - "Add Property" link only visible to landlords
  - Tenants won't see the option at all

### 3. Database Security (RLS Policies)
- **File**: `db/rls_policies.sql`
- **Created policies for**:
  - ✅ **Profiles**: Users can only view/edit their own profile
  - ✅ **Properties**: Only landlords can create/edit, everyone can view available ones
  - ✅ **Applications**: Tenants see their applications, landlords see applications for their properties
  - ✅ **Bookings**: Users see bookings they're involved in
  - ✅ **Maintenance**: Tenants create requests, landlords see requests for their properties
  - ✅ **Payments**: Users see payments they're involved in
  - ✅ **Notifications**: Users see only their own notifications

---

## 🧪 How to Test

### Test 1: Tenant Cannot Add Properties
1. Register as tenant: `tenant@test.com`
2. Login → should NOT see "Add Property" in navbar
3. Try to visit `/properties/new` directly → should see "Access Denied"

### Test 2: Landlord Can Add Properties
1. Create admin account (follow `db/create_admin.sql`)
2. Login as `admin@easerent.com`
3. Should see "Add Property" in navbar
4. Click it → should access the form
5. Can successfully create properties

### Test 3: No More 406 Errors
1. Refresh any page
2. Open browser console (F12)
3. Should NOT see 406 errors
4. Profile data should load correctly

---

## 📋 Quick Checklist

- [ ] Run `db/rls_policies.sql` in Supabase SQL Editor
- [ ] Create admin account (follow `db/create_admin.sql`)
- [ ] Refresh browser at localhost:3000
- [ ] Test tenant registration
- [ ] Test landlord property creation
- [ ] Verify no 406 errors in console

---

## 🔍 Troubleshooting

**Still seeing 406 errors?**
```sql
-- Check if RLS is enabled:
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';

-- Check policies:
SELECT * FROM pg_policies 
WHERE tablename IN ('profiles', 'properties');
```

**Policies not working?**
- Make sure you ran the ENTIRE `rls_policies.sql` file
- Refresh your browser (clear cache: Ctrl+Shift+R)
- Check Supabase logs in Dashboard → Logs

---

## 🎯 Summary

| Issue | Solution | File |
|-------|----------|------|
| Tenants can add properties | Role check in page | `pages/properties/new.js` |
| "Add Property" visible to all | Conditional rendering | `components/Navbar.js` |
| 406 errors on profiles | RLS policies | `db/rls_policies.sql` |

**Next Step**: Run the RLS policies SQL, then refresh your app! 🚀
