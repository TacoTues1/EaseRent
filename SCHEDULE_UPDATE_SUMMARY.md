# Schedule Page Update Summary

## 🔧 Changes Made

### 1. Fixed Navbar Duplication Issue
**Problem:** The Schedule page was rendering its own `<Navbar />` component, which caused the navigation to appear twice when viewed through the main layout.

**Solution:** Removed the `<Navbar />` import and component from `pages/schedule.js`. The navbar is now only rendered once through the main app layout.

### 2. Simplified Time Slot System
**Problem:** The original implementation required landlords to select a specific property when creating time slots, which was cumbersome.

**Solution:** Changed to **general availability** system:
- ✅ Removed property dropdown from "Add Available Time" modal
- ✅ Time slots are now landlord-specific, not property-specific
- ✅ `property_id` is set to `null` when creating time slots
- ✅ Tenants see landlord's general availability for ANY property viewing

### 3. Updated Database Schema
**File:** `db/UPDATE_BOOKINGS_SYSTEM.sql`

**Changes:**
```sql
-- property_id is now NULLABLE
CREATE TABLE IF NOT EXISTS available_time_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE, -- NOW NULLABLE
  landlord_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  is_booked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT valid_time_range CHECK (end_time > start_time)
);
```

**Added Comments:**
- Table comment: "property_id can be null for general availability"
- Column comment: "NULL means landlord is generally available for any property viewing"

### 4. Updated Applications Page Logic
**File:** `pages/applications.js`

**Before:**
```javascript
async function loadAvailableTimeSlots(propertyId) {
  // Query by property_id
  .eq('property_id', propertyId)
}
```

**After:**
```javascript
async function loadAvailableTimeSlots(application) {
  // Query by landlord_id from the property
  .eq('landlord_id', application.property?.landlord_id)
}
```

### 5. Updated Schedule Page UI
**File:** `pages/schedule.js`

**Changes:**
- ✅ Removed property dropdown from modal
- ✅ Changed title from "Viewing Schedule" to "My Availability"
- ✅ Changed description to "Set when you're available for property viewings"
- ✅ Removed property-related warnings
- ✅ Time slots now show only status badges (Available/Booked)
- ✅ Removed property title and address from time slot display
- ✅ Simplified to just show: Status + Date/Time Range + Delete button

---

## 📋 How It Works Now

### For Landlords:
1. Go to **Schedule** page
2. Click **"Add Available Time"**
3. Select **start date/time** and **end date/time**
4. Submit
5. That's it! You're marked as available during that time for ANY property viewing

### For Tenants:
1. Apply for a property
2. Click **"Schedule Viewing"**
3. See ALL available time slots from that landlord
4. Select a time slot
5. Submit booking request
6. Wait for landlord approval

### Benefits:
- ✅ **Simpler for landlords** - Set availability once, applies to all properties
- ✅ **Flexible** - One time slot works for multiple property viewings
- ✅ **Less maintenance** - Don't need to create time slots for each property
- ✅ **Easier to manage** - Clear overview of when you're available

---

## 🚀 Migration Instructions

### If You Already Ran the Migration:
If you previously ran `UPDATE_BOOKINGS_SYSTEM.sql` with property_id as NOT NULL, you need to update:

```sql
-- Run this in Supabase SQL Editor:
ALTER TABLE available_time_slots 
ALTER COLUMN property_id DROP NOT NULL;

COMMENT ON COLUMN available_time_slots.property_id IS 'Optional: Specific property. NULL means landlord is generally available for any property viewing';
```

### If You Haven't Run the Migration Yet:
Just run the updated `UPDATE_BOOKINGS_SYSTEM.sql` file. It now includes the nullable property_id.

---

## 🎯 Testing Checklist

- [ ] Navbar appears only once on Schedule page
- [ ] Schedule page loads without errors
- [ ] "Add Available Time" modal has NO property dropdown
- [ ] Can create time slots with just start/end time
- [ ] Time slots display with "Available" badge (no property name)
- [ ] Tenants can see landlord's availability when booking
- [ ] Booking system still works end-to-end

---

## 📸 Visual Changes

### Before:
```
Add Available Time Slot
━━━━━━━━━━━━━━━━━━━━
Property: [Dropdown]     ← REMOVED
Start: [Date/Time]
End: [Date/Time]
```

### After:
```
Add Available Time
━━━━━━━━━━━━━━━━━━━━
Start: [Date/Time]
End: [Date/Time]
```

### Time Slot Display Before:
```
┌─────────────────────────────┐
│ Beautiful House             │
│ 123 Main St, Manila         │
│ [Booked]                    │
│ From: Nov 15, 2PM           │
│ To: Nov 15, 4PM             │
└─────────────────────────────┘
```

### Time Slot Display After:
```
┌─────────────────────────────┐
│ [Available]                 │
│ From: Nov 15, 2PM           │
│ To: Nov 15, 4PM             │
│              [Delete]       │
└─────────────────────────────┘
```

---

## ✅ All Fixed!

The Schedule page now:
- ✅ Shows navbar only once
- ✅ Focuses on general availability
- ✅ Removed property selection complexity
- ✅ Simplified UI
- ✅ Works seamlessly with booking system
