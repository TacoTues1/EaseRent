# Property Status Update Guide

## Changes Made

### 1. Database Schema
- **New Column**: `status` (TEXT) with three possible values:
  - `'available'` - Property is available for rent
  - `'occupied'` - Property is currently occupied
  - `'not available'` - Property is not available

### 2. Files Updated

#### `pages/dashboard.js`
- **togglePropertyVisibility()** - Now cycles through three statuses
- **Status Button** - Shows color-coded status:
  - Green: Available
  - Yellow: Occupied
  - Red: Not Available
- **Apply Button** - Only shown for 'available' properties

#### `pages/properties/[id].js`
- **Status Badge** - Updated to show all three statuses with appropriate colors
- **Application Form** - Only visible when status is 'available'

#### `db/ADD_PROPERTY_STATUS.sql`
- Migration script to add the new status column
- Migrates existing `available` boolean data to new status field

## How to Apply

### Step 1: Run the SQL Migration
1. Go to your Supabase dashboard
2. Navigate to SQL Editor
3. Copy and paste the content from `db/ADD_PROPERTY_STATUS.sql`
4. Click "Run"

### Step 2: Test the Feature
1. Log in as a landlord
2. Go to your dashboard
3. Click the status button on any property
4. It will cycle: Available → Occupied → Not Available → Available

### Step 3: Verify Tenant View
1. Log in as a tenant
2. Only properties with "Available" status will show the "Apply" button

## Status Cycling Logic

Landlords can click the status button to cycle through:
```
Available (Green) → Occupied (Yellow) → Not Available (Red) → Available (Green) → ...
```

## Color Coding

- **Green** = Available (Tenants can apply)
- **Yellow** = Occupied (Someone is living there)
- **Red** = Not Available (Property is off the market)

## Notes

- The old `available` boolean column is kept for now (for backward compatibility)
- You can drop it later after confirming everything works
- The toast notification will show: "Property status changed to [status]"
