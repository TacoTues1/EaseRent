# Payment Request System - Setup Guide

## 🎯 New Feature: Bill Payment System

Instead of just recording payments, landlords can now **send bills** to tenants, and tenants can **view and pay** them directly!

---

## 🚀 Setup Instructions

### Step 1: Run the SQL Migration

**IMPORTANT:** Run this in Supabase SQL Editor first!

1. Go to: https://supabase.com/dashboard/project/zyyrarvawwqpnolukuav/sql/new
2. Copy and paste the contents of `db/CREATE_PAYMENT_REQUESTS.sql`
3. Click "Run"

This creates the `payment_requests` table with all necessary permissions.

---

## 📋 How It Works

### For Landlords:

1. **Send a Bill**
   - Click "Send Bill to Tenant" button
   - Select an approved application (tenant)
   - Fill in:
     - Rent amount (required)
     - Water bill (optional)
     - Electrical bill (optional)
     - Other bills (optional)
     - Bills description (optional notes)
     - Due date (required)
   - Click "Send Payment Request"

2. **Tenant Gets Notified**
   - Tenant receives notification immediately
   - Bill appears in their "Bills to Pay" section

3. **Track Bills**
   - View all sent bills in "Sent Bills" section
   - See status: Pending / Paid / Overdue / Cancelled
   - Can cancel pending bills

### For Tenants:

1. **Receive Bills**
   - Get notification when landlord sends a bill
   - View bills in "Your Bills to Pay" section

2. **View Bill Details**
   - See breakdown: Rent + Water + Electric + Other
   - View due date
   - See if overdue (highlighted in red)

3. **Pay Bills**
   - Click "Pay Now" button
   - Enter payment method
   - Confirm payment
   - Landlord gets notified immediately
   - Bill moves to "Payment History"

---

## 🎨 UI Features

### Bill Status Colors:
- 🟡 **Yellow**: Pending (not paid yet)
- 🔴 **Red**: Overdue (past due date)
- 🟢 **Green**: Paid (payment completed)
- ⚪ **Gray**: Cancelled

### Sections:
1. **Statistics** (Landlord only)
   - Total Income
   - Total Payments
   - Average Payment

2. **Sent Bills / Your Bills to Pay**
   - Active bills that need attention
   - Shows all pending and overdue bills
   - Interactive actions (Pay/Cancel)

3. **Payment History**
   - Completed payments
   - Archived records
   - Full breakdown of all charges

---

## 💡 Example Workflow

### Scenario: Monthly Rent + Utilities

1. **Landlord (John)** wants to bill tenant for November:
   ```
   Rent: ₱10,000
   Water: ₱500
   Electrical: ₱1,200
   Other: ₱300 (Internet)
   Due Date: November 5, 2025
   
   Total: ₱12,000
   ```

2. **Landlord sends bill:**
   - Selects tenant "Jane Doe - Cozy Studio"
   - Fills in all amounts
   - Sets due date
   - Clicks "Send Payment Request"

3. **Tenant (Jane) receives:**
   - ✉️ Notification: "New payment request for Cozy Studio: ₱12,000"
   - Goes to Payments page
   - Sees bill in "Your Bills to Pay"

4. **Bill Display:**
   ```
   Property: Cozy Studio
   Landlord: John Smith
   Amount:
     Rent: ₱10,000.00
     Water: ₱500.00
     Electric: ₱1,200.00
     Other: ₱300.00
     Total: ₱12,000.00
   Due Date: 11/5/2025
   Status: Pending
   [Pay Now]
   ```

5. **Tenant pays:**
   - Clicks "Pay Now"
   - Enters payment method: "GCash"
   - Confirms payment

6. **Landlord gets notified:**
   - ✉️ "Payment received for Cozy Studio"
   - Bill status changes to "Paid"
   - Payment appears in history

---

## 🔧 Technical Details

### Database Schema:

**payment_requests table:**
```sql
- id (uuid)
- landlord (uuid) -> profiles
- tenant (uuid) -> profiles
- property_id (uuid) -> properties
- application_id (uuid) -> applications
- rent_amount (numeric)
- water_bill (numeric)
- electrical_bill (numeric)
- other_bills (numeric)
- bills_description (text)
- due_date (timestamp)
- status (text): pending / paid / overdue / cancelled
- paid_at (timestamp)
- payment_method (text)
- payment_id (uuid) -> payments
```

### Flow:
1. Landlord creates `payment_request` (status: pending)
2. Notification sent to tenant
3. Tenant clicks "Pay Now"
4. Creates record in `payments` table
5. Updates `payment_request` (status: paid)
6. Notification sent to landlord

---

## ⚠️ Important Notes

1. **Must run SQL migration first!** The page won't work without the `payment_requests` table.

2. **Only approved tenants** can receive bills (must have accepted application)

3. **Notifications** require the `link` column in notifications table (added in migration)

4. **Payment method** is entered by tenant when paying (simple prompt for now)

5. **Overdue detection** happens automatically based on due date vs current date

---

## 🧪 Testing Steps

### Test as Landlord:
1. Login as landlord
2. Make sure you have an approved application
3. Click "Send Bill to Tenant"
4. Fill in all fields
5. ✅ Check: Notification sent?
6. ✅ Check: Bill appears in "Sent Bills"?

### Test as Tenant:
1. Login as tenant (same one who received bill)
2. ✅ Check: Notification received?
3. Go to Payments page
4. ✅ Check: Bill appears in "Your Bills to Pay"?
5. Click "Pay Now"
6. Enter payment method
7. Confirm
8. ✅ Check: Status changes to "Paid"?
9. ✅ Check: Appears in "Payment History"?

### Test as Landlord Again:
1. ✅ Check: Notification received about payment?
2. ✅ Check: Bill status shows "Paid"?
3. ✅ Check: Payment appears in history?
4. ✅ Check: Total income updated?

---

## 🎁 Benefits

### For Landlords:
✅ Easy bill creation with breakdown
✅ Automatic tenant notifications
✅ Real-time payment tracking
✅ Can cancel mistaken bills
✅ Full audit trail

### For Tenants:
✅ Clear bill breakdown
✅ Know exactly what they're paying for
✅ See due dates
✅ One-click payment
✅ Payment history for records

### For System:
✅ Organized payment workflow
✅ Reduces payment confusion
✅ Automatic status tracking
✅ Notification system integration
✅ Complete payment records

---

## 🔮 Future Enhancements (Optional)

1. **Recurring Bills**: Auto-generate monthly bills
2. **Partial Payments**: Pay bills in installments
3. **Payment Proof**: Upload receipt images
4. **Payment Methods**: Integration with GCash, PayMaya APIs
5. **Reminders**: Auto-remind tenants before due date
6. **Late Fees**: Automatically add fees for overdue payments
7. **Payment Plans**: Allow tenants to request payment schedules

---

## 📞 Need Help?

- Check browser console for errors
- Verify SQL migration was run successfully
- Make sure you have approved applications
- Test notifications are working
- Check RLS policies are active
