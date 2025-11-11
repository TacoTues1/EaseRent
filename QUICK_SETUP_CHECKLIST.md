# 🚀 Quick Setup Checklist

## ⚡ Fast Track Setup (5 Minutes)

### Step 1: Run Database Migrations ✓
Open Supabase Dashboard → SQL Editor

#### Migration 1: Soft Delete
```
File: db/UPDATE_CONVERSATIONS_SOFT_DELETE.sql
```
- [ ] Copy entire file content
- [ ] Paste in Supabase SQL Editor
- [ ] Click "Run"
- [ ] Wait for success message

#### Migration 2: Booking System
```
File: db/UPDATE_BOOKINGS_SYSTEM.sql
```
- [ ] Copy entire file content
- [ ] Paste in Supabase SQL Editor
- [ ] Click "Run"
- [ ] Wait for success message

### Step 2: Verify Tables Created ✓
In Supabase → Table Editor, check:

- [ ] `conversations` table has new columns:
  - `hidden_by_landlord`
  - `hidden_by_tenant`

- [ ] `available_time_slots` table exists with columns:
  - `id`
  - `property_id`
  - `landlord_id`
  - `start_time`
  - `end_time`
  - `is_booked`

- [ ] `bookings` table has new columns:
  - `booking_date`
  - `notes`
  - `application_id`

### Step 3: Test the Features ✓

#### Test 1: Schedule Page (Landlord)
- [ ] Login as a landlord account
- [ ] Look for "Schedule" link in navbar
- [ ] Click it → Should load Schedule page
- [ ] Click "Add Time Slot"
- [ ] Select a property, add dates
- [ ] Submit → Should appear in list

#### Test 2: Booking Flow (Tenant + Landlord)
**As Tenant:**
- [ ] Login as tenant
- [ ] Go to Applications page
- [ ] Find an application
- [ ] Click "Schedule Viewing"
- [ ] See available time slots in dropdown
- [ ] Select a slot, add notes, submit
- [ ] See "Pending Approval" status

**As Landlord:**
- [ ] Login as landlord
- [ ] Go to Applications page
- [ ] See yellow banner: "You have 1 pending viewing request"
- [ ] Click "View Requests"
- [ ] See tenant's booking details
- [ ] Click "Approve"
- [ ] Banner disappears

**As Tenant Again:**
- [ ] Refresh Applications page
- [ ] See booking status changed to "Approved"

#### Test 3: Soft Delete (Messages)
- [ ] Login as landlord with existing conversation
- [ ] Delete a conversation
- [ ] Login as the tenant from that conversation
- [ ] Verify tenant still sees the conversation
- [ ] Tenant sends a message
- [ ] Landlord doesn't receive it

---

## ✅ Success Indicators

You'll know it's working when:

1. **No Console Errors**
   - Open browser DevTools (F12)
   - Check Console tab
   - Should see no red errors

2. **Schedule Page Loads**
   - Landlords can access `/schedule`
   - Can create time slots
   - Slots appear in list

3. **Bookings Work**
   - Tenants see available slots
   - Can submit bookings
   - Landlords receive requests
   - Can approve/reject

4. **Soft Delete Works**
   - Deleting conversation only hides from you
   - Other person still sees it

---

## 🐛 Troubleshooting

### Issue: "Cannot read property of undefined"
**Fix:** Make sure both SQL migrations ran successfully

### Issue: Schedule page shows empty
**Fix:** 
1. Make sure you're logged in as landlord
2. Create a property first if you don't have any

### Issue: Tenants don't see time slots
**Fix:** Landlord needs to create time slots first on Schedule page

### Issue: Bookings not showing
**Fix:** Check that `available_time_slots` table exists in Supabase

### Issue: Soft delete not working
**Fix:** Verify `hidden_by_landlord` and `hidden_by_tenant` columns exist in `conversations` table

---

## 📋 Files Modified/Created

### Modified Files:
- ✅ `pages/applications.js` - Booking approval system
- ✅ `pages/messages.js` - Soft delete
- ✅ `components/Navbar.js` - Schedule link

### New Files:
- ✅ `pages/schedule.js` - Time slot management
- ✅ `db/UPDATE_CONVERSATIONS_SOFT_DELETE.sql` - Migration 1
- ✅ `db/UPDATE_BOOKINGS_SYSTEM.sql` - Migration 2
- ✅ `COMPLETE_BOOKING_SYSTEM_GUIDE.md` - Full documentation
- ✅ `BOOKING_FLOW_DIAGRAM.md` - Visual flow
- ✅ `QUICK_SETUP_CHECKLIST.md` - This file

---

## 🎯 Next Steps After Setup

1. **Create Sample Data**
   - Add a few properties (as landlord)
   - Create 3-4 time slots for each property
   - Apply to properties (as tenant)
   - Test the full booking flow

2. **Customize (Optional)**
   - Adjust colors in Tailwind classes
   - Modify notification messages
   - Add your branding

3. **Deploy**
   - Test thoroughly in development
   - Push to production when ready
   - Monitor for any issues

---

## ✨ You're All Set!

The system is ready to use. Follow the checklist above and you'll be up and running in minutes!

**Need more details?** Check:
- `COMPLETE_BOOKING_SYSTEM_GUIDE.md` - Comprehensive guide
- `BOOKING_FLOW_DIAGRAM.md` - Visual diagrams
