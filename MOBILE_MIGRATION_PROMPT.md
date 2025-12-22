# EaseRent Mobile App Migration Prompt (Expo Go + Supabase)

## Project Overview

I need to migrate my existing **EaseRent** web application (Next.js) to a **React Native mobile app** using **Expo Go**. The mobile app will use the **same Supabase database** as the existing web app. Below is everything you need to know about the project.

---

## Tech Stack

### Current Web App (Next.js)
- **Framework:** Next.js (React 19)
- **Database:** Supabase (PostgreSQL with Row Level Security)
- **Authentication:** Supabase Auth (Email/Password with OTP verification)
- **Styling:** Tailwind CSS
- **Notifications:** react-hot-toast
- **AI Chat:** Google Gemini AI (@google/generative-ai)
- **Email:** Brevo (@getbrevo/brevo)

### Target Mobile App (Expo)
- **Framework:** React Native with Expo Go
- **Database:** Same Supabase instance (shared database)
- **Authentication:** @supabase/supabase-js (same as web)
- **Styling:** React Native StyleSheet / NativeWind (Tailwind for RN)
- **Navigation:** React Navigation (@react-navigation/native)
- **Notifications:** expo-notifications for push notifications
- **Real-time:** Supabase Realtime (already configured in DB)

---

## User Roles

The app has **3 user roles**:
1. **Tenant** - Can browse properties, apply for rentals, pay bills, submit maintenance requests, chat with landlords
2. **Landlord** - Can list properties, manage applications, assign tenants, create bills, handle maintenance requests
3. **Admin** - System administrator (future scope)

---

## Database Schema (Supabase)

### Core Tables

```sql
-- 1. profiles (linked to auth.users)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  first_name TEXT,
  middle_name TEXT,
  last_name TEXT,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'tenant', -- 'tenant' | 'landlord' | 'admin'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. properties
CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landlord UUID REFERENCES profiles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  address TEXT,
  building TEXT,
  street TEXT,
  city TEXT,
  zip TEXT,
  price NUMERIC(12,2) NOT NULL,
  currency TEXT DEFAULT 'PHP',
  bedrooms INT DEFAULT 1,
  bathrooms NUMERIC(3,1) DEFAULT 1,
  area_sqft INT,
  available BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'available', -- available | occupied | maintenance
  images TEXT[], -- Array of image URLs
  amenities TEXT[], -- Array of amenities
  terms_and_conditions TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. applications (rental applications)
CREATE TABLE applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  tenant UUID REFERENCES profiles(id) ON DELETE SET NULL,
  message TEXT,
  status TEXT DEFAULT 'pending', -- pending | accepted | rejected
  submitted_at TIMESTAMPTZ DEFAULT now()
);

-- 4. tenant_occupancies (active tenants in properties)
CREATE TABLE tenant_occupancies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE NOT NULL,
  tenant_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  landlord_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'active', -- active | pending_end | ended
  start_date TIMESTAMPTZ DEFAULT now(),
  end_date TIMESTAMPTZ,
  end_requested_at TIMESTAMPTZ,
  end_request_reason TEXT,
  end_request_status TEXT, -- pending | approved | rejected
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. bookings (property viewing appointments)
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  application_id UUID REFERENCES applications(id),
  tenant UUID REFERENCES profiles(id) ON DELETE SET NULL,
  landlord UUID REFERENCES profiles(id) ON DELETE SET NULL,
  booking_date DATE,
  time_slot_id UUID,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  status TEXT DEFAULT 'pending_approval', -- pending_approval | approved | rejected | completed | cancelled
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. maintenance_requests
CREATE TABLE maintenance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  tenant UUID REFERENCES profiles(id) ON DELETE SET NULL,
  title TEXT,
  description TEXT,
  status TEXT DEFAULT 'pending', -- pending | in_progress | resolved | closed
  priority TEXT DEFAULT 'normal', -- low | normal | high
  landlord_response TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- 7. payment_requests (bills from landlord to tenant)
CREATE TABLE payment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landlord UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  tenant UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  rent_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  water_bill NUMERIC(12,2) DEFAULT 0,
  electrical_bill NUMERIC(12,2) DEFAULT 0,
  other_bills NUMERIC(12,2) DEFAULT 0,
  bills_description TEXT,
  due_date TIMESTAMPTZ,
  status TEXT DEFAULT 'pending', -- pending | pending_confirmation | paid | overdue | cancelled
  paid_at TIMESTAMPTZ,
  payment_method TEXT,
  proof_of_payment TEXT, -- URL to uploaded receipt image
  reference_number TEXT,
  qr_code_url TEXT, -- Landlord's payment QR code
  bill_receipt_url TEXT, -- Bill receipt image
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. payments (payment history)
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  tenant UUID REFERENCES profiles(id) ON DELETE SET NULL,
  landlord UUID REFERENCES profiles(id) ON DELETE SET NULL,
  payment_request_id UUID REFERENCES payment_requests(id),
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT DEFAULT 'PHP',
  method TEXT, -- gcash | bank_transfer | cash
  status TEXT DEFAULT 'recorded',
  paid_at TIMESTAMPTZ DEFAULT now()
);

-- 9. conversations (chat system)
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  landlord_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_by UUID[], -- Soft delete per user
  UNIQUE(landlord_id, tenant_id)
);

-- 10. messages
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  attachments JSONB, -- File attachments [{name, url, type, size}]
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 11. notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient UUID REFERENCES profiles(id) ON DELETE CASCADE,
  actor UUID REFERENCES profiles(id),
  type TEXT, -- application | maintenance | payment | booking | message
  message TEXT,
  data JSONB,
  link TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Storage Buckets
- `property-images` - Property photos
- `message-attachments` - Chat file attachments
- `payment-receipts` - Proof of payment images
- `permits` - Property permits/documents

---

## Application Features & Screens

### Authentication Screens
1. **Sign In** - Email/Password login with "Remember Me"
2. **Sign Up** - Registration with OTP email verification
3. **OTP Verification** - 6-digit code verification
4. **Password Reset** - Email-based password reset

### Shared Screens (All Users)
1. **Home/Properties** - Browse available properties with search & filters
2. **Property Details** - View property info, images gallery, amenities, apply button
3. **Messages** - Real-time chat with conversations list, message threading, file attachments
4. **Notifications** - In-app notifications with read/unread status
5. **Profile/Settings** - Edit profile, change password, logout
6. **AI Chat** - Gemini AI assistant for property-related questions

### Tenant-Specific Screens
1. **Dashboard** - Current occupancy status, quick actions
2. **My Applications** - View submitted applications and their status
3. **Payments** - View bills, pay rent, upload proof of payment
4. **Payment History** - View past payments
5. **Maintenance Requests** - Submit and track maintenance issues

### Landlord-Specific Screens
1. **Dashboard** - Property overview, pending actions summary
2. **My Properties** - List/manage owned properties
3. **Add/Edit Property** - Create or update property listings with image upload
4. **Applications** - Review tenant applications, approve/reject
5. **Bookings/Schedule** - Manage property viewing appointments
6. **Tenant Management** - View current tenants, handle end-of-tenancy requests
7. **Create Bills** - Generate payment requests for tenants
8. **Payments** - View payment statuses, confirm payments
9. **Maintenance Requests** - Handle tenant maintenance issues

---

## Key Features to Implement

### 1. Authentication
```javascript
// Supabase Auth patterns used:
- signUp with email/password
- signInWithPassword
- signOut
- verifyOtp (email verification)
- resetPasswordForEmail
- onAuthStateChange listener
- getSession
```

### 2. Real-time Messaging
```javascript
// Supabase Realtime subscription pattern:
const channel = supabase
  .channel('messages-channel')
  .on('postgres_changes', 
    { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${userId}` },
    (payload) => { /* Handle new message */ }
  )
  .subscribe()
```

### 3. Image Handling
- Multiple image upload for properties (gallery)
- Single image upload for payment proofs
- Image viewing with zoom/carousel
- Use `expo-image-picker` for camera/gallery access

### 4. Push Notifications (Mobile-specific)
- Integrate `expo-notifications`
- Store device push tokens in profiles table
- Trigger push notifications alongside in-app notifications

### 5. File Attachments in Chat
- Support image, PDF, and document attachments
- Upload to Supabase Storage
- Download/preview attachments

---

## Environment Variables Needed

```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
EXPO_PUBLIC_GEMINI_API_KEY=your_gemini_api_key (for AI chat)
```

---

## Recommended Expo Packages

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.x",
    "@react-navigation/native": "^6.x",
    "@react-navigation/native-stack": "^6.x",
    "@react-navigation/bottom-tabs": "^6.x",
    "expo": "~52.x",
    "expo-image-picker": "~15.x",
    "expo-notifications": "~0.28.x",
    "expo-document-picker": "~12.x",
    "expo-file-system": "~17.x",
    "expo-secure-store": "~13.x",
    "expo-linking": "~6.x",
    "react-native-toast-message": "^2.x",
    "@google/generative-ai": "^0.x",
    "nativewind": "^4.x",
    "date-fns": "^3.x",
    "react-native-gesture-handler": "~2.x",
    "react-native-reanimated": "~3.x",
    "react-native-safe-area-context": "4.x",
    "react-native-screens": "~3.x",
    "react-native-svg": "15.x"
  }
}
```

---

## Project Structure Suggestion

```
/app (or /src)
├── /screens
│   ├── /auth
│   │   ├── SignInScreen.tsx
│   │   ├── SignUpScreen.tsx
│   │   └── OTPVerificationScreen.tsx
│   ├── /shared
│   │   ├── HomeScreen.tsx (Property listing)
│   │   ├── PropertyDetailScreen.tsx
│   │   ├── MessagesScreen.tsx
│   │   ├── ChatScreen.tsx
│   │   ├── NotificationsScreen.tsx
│   │   ├── SettingsScreen.tsx
│   │   └── AIChatScreen.tsx
│   ├── /tenant
│   │   ├── TenantDashboard.tsx
│   │   ├── MyApplicationsScreen.tsx
│   │   ├── PaymentsScreen.tsx
│   │   ├── PaymentHistoryScreen.tsx
│   │   └── MaintenanceScreen.tsx
│   └── /landlord
│       ├── LandlordDashboard.tsx
│       ├── MyPropertiesScreen.tsx
│       ├── AddPropertyScreen.tsx
│       ├── EditPropertyScreen.tsx
│       ├── ApplicationsScreen.tsx
│       ├── BookingsScreen.tsx
│       ├── TenantsScreen.tsx
│       ├── CreateBillScreen.tsx
│       └── LandlordPaymentsScreen.tsx
├── /components
│   ├── PropertyCard.tsx
│   ├── ApplicationCard.tsx
│   ├── MessageBubble.tsx
│   ├── NotificationItem.tsx
│   ├── ImageCarousel.tsx
│   ├── LoadingSpinner.tsx
│   └── EmptyState.tsx
├── /navigation
│   ├── AppNavigator.tsx
│   ├── AuthNavigator.tsx
│   ├── TenantTabNavigator.tsx
│   └── LandlordTabNavigator.tsx
├── /lib
│   ├── supabase.ts
│   ├── notifications.ts
│   └── helpers.ts
├── /hooks
│   ├── useAuth.ts
│   ├── useProfile.ts
│   ├── useProperties.ts
│   └── useRealtime.ts
├── /context
│   └── AuthContext.tsx
├── /types
│   └── index.ts
└── /styles
    └── theme.ts
```

---

## Supabase Client Setup for Expo

```typescript
// lib/supabase.ts
import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
```

---

## Currency & Localization

- Default currency: **₱ (PHP - Philippine Peso)**
- Date format: Use `date-fns` for formatting
- All prices stored as NUMERIC(12,2) in database

---

## Key Business Logic

### Application Flow
1. Tenant browses properties → Applies to property
2. Landlord receives application notification → Reviews → Approves/Rejects
3. If approved, landlord schedules viewing (booking)
4. After successful viewing, landlord assigns tenant to property (creates occupancy)
5. Tenant becomes active occupant

### Payment Flow
1. Landlord creates payment request (bill) for tenant
2. Tenant receives notification
3. Tenant views bill → Selects payment method → Uploads proof
4. Bill status changes to "pending_confirmation"
5. Landlord verifies proof → Confirms payment
6. Bill marked as "paid", payment record created

### End Tenancy Flow
1. Tenant requests to end occupancy (submits reason)
2. Landlord receives notification
3. Landlord approves/rejects request
4. If approved, occupancy ends, property becomes available

---

## Important Notes

1. **RLS (Row Level Security)** is enabled on all tables - the same policies work for both web and mobile since they use the same Supabase client
2. **Real-time subscriptions** are already configured in the database for messages and notifications
3. **Storage buckets** have RLS policies - authenticated users can upload/download
4. **The database is shared** - any data created in mobile will appear in web and vice versa
5. **Use the same Supabase project** - don't create a new one

---

## Migration Priority

1. **Phase 1:** Authentication + Profile + Property Browsing
2. **Phase 2:** Applications + Bookings (Core rental flow)
3. **Phase 3:** Messaging system (Real-time chat)
4. **Phase 4:** Payments + Maintenance requests
5. **Phase 5:** Landlord property management
6. **Phase 6:** AI Chat + Push notifications

---

## Questions to Consider

1. Do you want TypeScript for the mobile app?
2. Should we use NativeWind (Tailwind for RN) or standard StyleSheet?
3. Do you need offline support (data caching)?
4. Should the mobile app have feature parity with web or mobile-optimized features?
5. Any specific UI component library preference (React Native Paper, Tamagui, etc.)?

---

This prompt contains everything needed to build the EaseRent mobile app using Expo Go while maintaining compatibility with the existing Supabase backend.
