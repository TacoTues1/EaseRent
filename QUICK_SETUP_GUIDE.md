# Quick Setup Guide

## 🚀 Immediate Action Required

### Run this SQL in Supabase SQL Editor:

```sql
-- Add bill columns to payments table

-- Add new columns for different bill types
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS water_bill numeric(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS electrical_bill numeric(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS other_bills numeric(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS bills_description text,
ADD COLUMN IF NOT EXISTS application_id uuid REFERENCES applications(id) ON DELETE SET NULL;

-- Create index for application_id
CREATE INDEX IF NOT EXISTS idx_payments_application ON payments(application_id);
```

**Where to run it:**
1. https://supabase.com/dashboard/project/zyyrarvawwqpnolukuav/sql/new
2. Paste the SQL above
3. Click "Run"

---

## ✅ What's New

### 1. Schedule Viewing - One Time Only
**What Tenants See:**

**BEFORE scheduling:**
```
┌─────────────────────────────────────┐
│ [📅 Schedule Viewing]  [🗑️ Delete] │
└─────────────────────────────────────┘
```

**AFTER scheduling:**
```
┌──────────────────────────────────────────────────────┐
│ ✓ Viewing scheduled for 10/29/2025, 2:00:00 PM     │
│ [🗑️ Delete]                                         │
└──────────────────────────────────────────────────────┘
```

### 2. Payment with Bills Breakdown

**Landlord Payment Form:**
```
Select Approved Application: [Cozy Studio - John Doe ▼]

Payment Details:
┌────────────────────┬─────────────────────┐
│ Rent Amount: *     │ Water Bill:         │
│ [₱10,000.00]       │ [₱500.00]           │
├────────────────────┼─────────────────────┤
│ Electrical Bill:   │ Other Bills:        │
│ [₱1,200.00]        │ [₱300.00]           │
└────────────────────┴─────────────────────┘

Bills Description (optional):
[Internet and parking fees]

┌────────────────────────────────────┐
│ Total Amount: ₱12,000.00           │
└────────────────────────────────────┘

Payment Method: [Bank Transfer ▼]

[Record Payment] [Cancel]
```

**Payment Table View:**
```
Property    | Tenant  | Rent       | Bills            | Total        | Method  | Date
------------|---------|------------|------------------|--------------|---------|----------
Cozy Studio | John D. | ₱10,000.00 | Water: ₱500.00   | ₱12,000.00  | Bank    | 10/29/25
            |         |            | Electric: ₱1,200 |             |Transfer |
            |         |            | Other: ₱300.00   |             |         |
            |         |            | Internet, parking|             |         |
```

---

## 🎯 Key Benefits

### Schedule Viewing Lock
- ✅ No duplicate bookings
- ✅ Clear confirmation for tenants
- ✅ Prevents scheduling confusion

### Payment Bills
- ✅ Only approved tenants
- ✅ Complete billing transparency
- ✅ Automatic total calculation
- ✅ Detailed breakdown for records

---

## 📱 How to Test

### Test 1: Schedule Viewing Lock
1. Login as tenant
2. Go to Applications
3. Find "accepted" application
4. Click "Schedule Viewing"
5. Fill date/time, submit
6. **Refresh page**
7. ✅ Button should be replaced with scheduled date
8. ✅ Cannot schedule again

### Test 2: Payment Bills
1. Login as landlord
2. **First: Make sure you have at least one APPROVED application**
3. Go to Payments
4. Click "Record Payment"
5. **Check:** Only approved applications in dropdown
6. Select application
7. Fill amounts:
   - Rent: 10000
   - Water: 500
   - Electrical: 1200
   - Other: 300
8. **Watch total update to 12000**
9. Submit
10. ✅ Table shows breakdown
11. ✅ Total income updated

---

## ⚠️ Important Notes

### For Schedule Viewing:
- Currently NO way to reschedule (future enhancement)
- Landlords can see bookings in bookings table
- One booking per application

### For Payments:
- **MUST run SQL migration first!**
- Only works with approved applications
- All bill fields are optional except rent
- Bills description is for notes (e.g., "Internet, parking")

---

## 🐛 Troubleshooting

### "No approved applications found" message?
- Make sure you have applications with status = 'accepted'
- Check as landlord that properties exist
- Verify tenant submitted application

### Can't see scheduled viewing date?
- Make sure booking was created successfully
- Check browser console for errors
- Refresh the page

### Payment form not showing bills fields?
- Run the SQL migration in Supabase
- Clear browser cache
- Check console for errors

---

## 📊 Database Schema Changes

**payments table - NEW COLUMNS:**
```sql
water_bill         numeric(12,2) DEFAULT 0
electrical_bill    numeric(12,2) DEFAULT 0
other_bills        numeric(12,2) DEFAULT 0
bills_description  text
application_id     uuid REFERENCES applications(id)
```

**applications table - LOADS WITH:**
```javascript
hasBooking: boolean
latestBooking: { id, booking_date, ... } | null
```

---

## 🔄 Migration Status

- ✅ Code changes complete
- ⏳ SQL migration pending (need to run manually)
- ✅ No breaking changes
- ✅ Backwards compatible (old payments still work)

**Run the SQL now to enable full functionality!**
