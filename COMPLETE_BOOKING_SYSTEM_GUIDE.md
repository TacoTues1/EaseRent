# Complete Booking System Implementation Guide

## ✅ What Has Been Completed

### 1. **Soft Delete for Conversations**
- Modified `pages/messages.js` to implement user-specific conversation hiding
- When a user deletes a conversation, it only disappears from their view
- The other person still sees the conversation normally

### 2. **Booking Approval System**
- Modified `pages/applications.js` with complete approval workflow
- Tenants can only book from landlord's available time slots
- Bookings start with "pending_approval" status
- Landlords see notification banner with pending request count
- Landlords can approve or reject each booking request

### 3. **Schedule Management Page**
- Created new `pages/schedule.js` for landlords only
- Landlords can create available time slots for property viewings
- Shows all time slots with property details
- Prevents booking of already-booked slots
- Clean, user-friendly interface

### 4. **Navigation Updates**
- Added "Schedule" link to navbar for landlords (desktop & mobile)
- Integrated seamlessly with existing navigation

---

## 🚀 Setup Instructions

### Step 1: Run Database Migrations

You need to execute these SQL files in your Supabase SQL Editor in this exact order:

#### A. First Migration: Soft Delete for Conversations
1. Open Supabase Dashboard → SQL Editor
2. Open file: `db/UPDATE_CONVERSATIONS_SOFT_DELETE.sql`
3. Copy the entire content and paste in SQL Editor
4. Click "Run" to execute

**What this does:**
- Adds `hidden_by_landlord` column to conversations table
- Adds `hidden_by_tenant` column to conversations table
- Updates RLS policies for proper access control

#### B. Second Migration: Booking System
1. In Supabase SQL Editor (new query)
2. Open file: `db/UPDATE_BOOKINGS_SYSTEM.sql`
3. Copy the entire content and paste in SQL Editor
4. Click "Run" to execute

**What this does:**
- Creates `available_time_slots` table
- Adds new columns to bookings table: `booking_date`, `notes`, `application_id`
- Updates booking status enum to include: `pending_approval`, `approved`, `scheduled`, `completed`, `cancelled`, `rejected`
- Sets up RLS policies for time slots

---

## 📋 How It Works

### For Landlords:

1. **Set Available Time Slots**
   - Go to "Schedule" page (new link in navbar)
   - Click "Add Time Slot"
   - Select a property
   - Choose start and end date/time
   - System prevents past dates and validates end > start
   - Time slots appear in a list, sorted by date

2. **Receive Booking Requests**
   - When tenants book a viewing, landlord sees a notification banner on Applications page
   - Banner shows: "You have X pending viewing requests"
   - Click "View Requests" to see all pending bookings

3. **Approve or Reject Bookings**
   - In the Pending Bookings modal, see:
     - Property details
     - Tenant name
     - Requested date/time
     - Tenant's notes (if any)
   - Click "Approve" → Time slot marked as booked, tenant notified
   - Click "Reject" → Time slot freed up for others, tenant notified

4. **Manage Time Slots**
   - View all upcoming time slots on Schedule page
   - Delete unbooked slots if plans change
   - Booked slots cannot be deleted (show "Booked" badge)

### For Tenants:

1. **Apply for Property**
   - Browse properties and click "Apply"
   - Fill out application form

2. **Schedule Viewing**
   - After applying, click "Schedule Viewing" on application card
   - See only landlord's available time slots (no manual date picking)
   - Select a time slot from dropdown
   - Add optional notes for landlord
   - Submit booking request

3. **Wait for Approval**
   - Booking status shows "Pending Approval"
   - Receive notification when landlord approves/rejects
   - If approved: Status changes to "Approved", can prepare for viewing
   - If rejected: Can select a different time slot

---

## 🎨 User Interface Features

### Applications Page (Landlords)
- **Pending Bookings Banner** (top of page when requests exist)
  - Shows count of pending requests
  - "View Requests" button
  - Yellow background for visibility

- **Pending Bookings Modal**
  - Full-screen overlay
  - List of all pending bookings
  - Each booking shows:
    - Property name and location
    - Tenant information
    - Requested date/time
    - Notes from tenant
    - Approve/Reject buttons
  - Responsive design (stacks on mobile)

### Applications Page (Tenants)
- **Booking Modal** (when scheduling viewing)
  - Dropdown showing available time slots
  - Format: "Nov 15, 2025 at 2:00 PM - 4:00 PM"
  - Notes field for special requests
  - Submit button
  - Shows "No available times" if landlord hasn't set slots

### Schedule Page (Landlords Only)
- **Header**
  - Page title and description
  - "Add Time Slot" button

- **Time Slots List**
  - Property name and location
  - Start and end date/time with icons
  - "Booked" badge for reserved slots
  - Delete button for available slots
  - Empty state with call-to-action

- **Add Time Slot Modal**
  - Property dropdown
  - Start date/time picker (prevents past dates)
  - End date/time picker (validates > start)
  - Helpful tip box
  - Submit/Cancel buttons

---

## 🔧 Technical Details

### Database Schema Changes

**conversations table:**
```sql
- hidden_by_landlord BOOLEAN (default: false)
- hidden_by_tenant BOOLEAN (default: false)
```

**available_time_slots table (NEW):**
```sql
- id UUID PRIMARY KEY
- property_id UUID → properties(id)
- landlord_id UUID → profiles(id)
- start_time TIMESTAMPTZ
- end_time TIMESTAMPTZ
- is_booked BOOLEAN (default: false)
- created_at TIMESTAMPTZ
```

**bookings table (updated):**
```sql
- booking_date TIMESTAMPTZ (new)
- notes TEXT (new)
- application_id UUID (new)
- status: pending_approval | approved | scheduled | completed | cancelled | rejected
```

### Key Functions

**In applications.js:**
- `loadPendingBookings()` - Fetches booking requests for landlord
- `loadAvailableTimeSlots(propertyId)` - Gets available times for property
- `approveBooking(bookingId)` - Landlord approves request
- `rejectBooking(bookingId)` - Landlord rejects and frees slot
- `submitBooking()` - Tenant creates booking request

**In schedule.js:**
- `loadProperties()` - Fetches landlord's properties
- `loadTimeSlots()` - Gets all future time slots
- `addTimeSlot()` - Creates new available time
- `deleteTimeSlot(slotId)` - Removes unbooked slot

---

## 🧪 Testing Checklist

### Test Soft Delete (Messages)
- [ ] Login as landlord, start conversation with tenant
- [ ] Landlord deletes conversation
- [ ] Verify: Landlord doesn't see it, tenant still sees it
- [ ] Tenant sends message
- [ ] Verify: Landlord doesn't receive it (conversation hidden)

### Test Time Slot Creation
- [ ] Login as landlord
- [ ] Go to Schedule page
- [ ] Try to add slot with past date → Should show error
- [ ] Try to add slot with end < start → Should show error
- [ ] Add valid time slot → Should appear in list
- [ ] Verify time slot sorted by date

### Test Booking Flow (Full Cycle)
1. **Landlord Setup:**
   - [ ] Login as landlord
   - [ ] Create property (if not exists)
   - [ ] Go to Schedule, add 2-3 time slots

2. **Tenant Books:**
   - [ ] Login as tenant
   - [ ] Apply for landlord's property
   - [ ] Click "Schedule Viewing"
   - [ ] Verify: See only landlord's available slots
   - [ ] Select slot, add notes, submit
   - [ ] Verify: Booking shows "Pending Approval"

3. **Landlord Receives:**
   - [ ] Login as landlord (or refresh)
   - [ ] Verify: Banner shows "1 pending viewing request"
   - [ ] Click "View Requests"
   - [ ] Verify: See tenant's booking with notes

4. **Landlord Approves:**
   - [ ] Click "Approve" on booking
   - [ ] Verify: Toast notification "Booking approved"
   - [ ] Verify: Pending count decreases
   - [ ] Go to Schedule page
   - [ ] Verify: Time slot shows "Booked" badge
   - [ ] Verify: Cannot delete booked slot

5. **Tenant Receives Approval:**
   - [ ] Login as tenant
   - [ ] Check Applications page
   - [ ] Verify: Booking status changed to "Approved"
   - [ ] Check Notifications
   - [ ] Verify: Received approval notification

### Test Booking Rejection
- [ ] Tenant books another slot
- [ ] Landlord rejects it
- [ ] Verify: Time slot becomes available again (not booked)
- [ ] Verify: Tenant receives rejection notification
- [ ] Verify: Other tenants can now book that slot

### Test Edge Cases
- [ ] Tenant tries to book when no slots available → See "No available times"
- [ ] Multiple tenants try to book same slot → Only first succeeds
- [ ] Landlord has no properties → Schedule page shows warning
- [ ] Mobile responsiveness on all pages

---

## 📱 Mobile Responsiveness

All new features are fully responsive:

- **Schedule Page:**
  - Grid layout adapts to screen size
  - Buttons stack vertically on mobile
  - Modal uses full-width padding on small screens

- **Pending Bookings Modal:**
  - Flexbox changes from row to column
  - Approve/Reject buttons stack on mobile
  - Icons and text remain readable

- **Booking Modal:**
  - Dropdown and inputs full-width on mobile
  - Comfortable touch targets

---

## 🎯 User Experience Highlights

### Visual Feedback
- Toast notifications for all actions
- Loading states on buttons ("Adding...", "Submitting...")
- Badge indicators (Pending, Approved, Booked)
- Empty states with helpful messages

### Validation
- Prevents booking past dates
- Validates end time > start time
- Checks for required fields
- Confirms destructive actions

### Accessibility
- Semantic HTML structure
- Clear icon + text combinations
- Sufficient color contrast
- Keyboard navigation support

---

## 🚨 Important Notes

1. **Migration Order Matters**: Always run `UPDATE_CONVERSATIONS_SOFT_DELETE.sql` before `UPDATE_BOOKINGS_SYSTEM.sql`

2. **RLS Policies**: The migrations set up proper Row Level Security. Don't modify these unless necessary.

3. **Time Zones**: All times stored in UTC (TIMESTAMPTZ). JavaScript's `.toLocaleString()` handles display in user's timezone.

4. **Landlord-Only Access**: Schedule page automatically redirects non-landlords to dashboard.

5. **Real-time Updates**: Consider refreshing Applications page periodically or implementing Supabase real-time subscriptions for instant booking updates.

---

## 🔮 Future Enhancements (Optional)

- **Bulk Time Slot Creation**: Add recurring weekly slots
- **Calendar View**: Visual calendar on Schedule page
- **Booking Reminders**: Automated reminders before viewing time
- **Reschedule Feature**: Allow approved bookings to be rescheduled
- **Booking History**: Archive of past viewings
- **Time Slot Templates**: Save and reuse common availability patterns

---

## ✅ Final Checklist

Before going live, ensure:

- [ ] Both SQL migrations executed successfully in Supabase
- [ ] Test all user flows (landlord and tenant)
- [ ] Verify mobile responsiveness on actual devices
- [ ] Check browser console for any errors
- [ ] Test with multiple users simultaneously
- [ ] Verify notifications are sent correctly
- [ ] Confirm time zones display correctly for your region

---

## 📞 Need Help?

If you encounter any issues:

1. Check browser console for JavaScript errors
2. Check Supabase logs for database errors
3. Verify RLS policies are enabled
4. Ensure user roles are set correctly in profiles table
5. Test with a fresh incognito window to rule out cache issues

---

**System is ready! Run the migrations and start testing!** 🎉
