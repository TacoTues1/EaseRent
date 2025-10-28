# EaseRent Quick Reference Guide

## 🚀 Quick Start Commands

```powershell
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint
```

---

## 📁 Project Structure Quick Guide

```
Key Files & Directories:
├── pages/              # Next.js pages (auto-routing)
│   ├── index.js        # Landing page (/)
│   ├── dashboard.js    # User dashboard (/dashboard)
│   ├── auth/           # Authentication pages
│   ├── properties/     # Property management
│   ├── maintenance.js  # Maintenance requests
│   ├── payments.js     # Payment tracking
│   └── notifications.js # Notification center
├── components/         # Reusable React components
│   ├── Navbar.js       # Navigation bar
│   └── UI.js           # UI component library
├── lib/                # Utility functions
│   ├── supabaseClient.js  # Supabase connection
│   └── notifications.js   # Notification helpers
├── db/                 # Database files
│   └── schema.sql      # Database schema
├── styles/             # CSS styles
│   └── globals.css     # Global Tailwind styles
└── .env.local          # Environment variables (DO NOT COMMIT)
```

---

## 🔐 Environment Variables

Create `.env.local` in project root:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

---

## 🗄️ Database Setup

### Run Schema in Supabase
1. Open Supabase dashboard → SQL Editor
2. Copy contents of `db/schema.sql`
3. Execute SQL
4. Verify tables created in Table Editor

### Tables Created
- `profiles` - User info with roles
- `properties` - Property listings
- `applications` - Rental applications
- `bookings` - Viewing appointments
- `maintenance_requests` - Maintenance tracking
- `payments` - Payment records
- `notifications` - In-app notifications

---

## 🎨 Available UI Components

Import from `components/UI.js`:
```javascript
import { Button, Card, Badge, Input, Textarea, Select, Spinner, Alert } from '../components/UI'

// Button variants: primary, secondary, danger, success
<Button variant="primary" size="md">Click Me</Button>

// Alert types: info, success, warning, danger
<Alert variant="success">Success message!</Alert>
```

---

## 📱 Page Routes

| Route | Description | Auth Required |
|-------|-------------|---------------|
| `/` | Landing page | No |
| `/auth` | Sign up / Sign in | No |
| `/dashboard` | User dashboard | Yes |
| `/properties` | Browse properties | No |
| `/properties/[id]` | Property detail | No |
| `/properties/new` | Add property | Yes (Landlord) |
| `/maintenance` | Maintenance requests | Yes |
| `/payments` | Payment tracking | Yes |
| `/notifications` | Notification center | Yes |

---

## 👥 User Roles

### Tenant
- Browse properties
- Submit applications
- Request maintenance
- View payment history

### Landlord
- All tenant features, plus:
- Add/edit properties
- Record payments
- View income reports
- Manage applications

---

## 🔔 Notification System

### Send a Notification
```javascript
import { createNotification, NotificationTemplates } from '../lib/notifications'

// Using templates
const template = NotificationTemplates.newApplication('Property Title', 'John Doe')
await createNotification({
  recipient: landlordUserId,
  actor: tenantUserId,
  type: template.type,
  message: template.message
})

// Custom notification
await createNotification({
  recipient: userId,
  actor: currentUserId,
  type: 'custom',
  message: 'Your custom message',
  data: { key: 'value' }
})
```

### Available Templates
- `newApplication(propertyTitle, tenantName)`
- `applicationStatusUpdate(propertyTitle, status)`
- `newMaintenanceRequest(propertyTitle, tenantName)`
- `maintenanceStatusUpdate(title, status)`
- `paymentRecorded(amount, propertyTitle)`
- `bookingConfirmed(propertyTitle, date)`
- `rentDueReminder(propertyTitle, dueDate)`

---

## 🔍 Common Supabase Queries

### Fetch Properties
```javascript
const { data } = await supabase
  .from('properties')
  .select('*')
  .eq('available', true)
  .order('created_at', { ascending: false })
```

### Insert with Relations
```javascript
const { data } = await supabase
  .from('applications')
  .insert({ property_id, tenant, message, status: 'pending' })
  .select('*, properties(title)')
```

### Real-Time Subscription
```javascript
const channel = supabase
  .channel('notifications')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'notifications',
    filter: `recipient=eq.${userId}`
  }, (payload) => {
    console.log('New notification:', payload.new)
  })
  .subscribe()
```

---

## 🛠️ Troubleshooting

### Dev Server Won't Start
```powershell
# Clear cache and reinstall
Remove-Item -Recurse -Force node_modules, .next
npm install
npm run dev
```

### Build Errors
```powershell
# Check for missing env vars
echo $env:NEXT_PUBLIC_SUPABASE_URL
echo $env:NEXT_PUBLIC_SUPABASE_ANON_KEY

# Restart with fresh build
Remove-Item -Recurse -Force .next
npm run build
```

### Database Connection Issues
- Verify `.env.local` exists and has correct values
- Check Supabase project is active
- Restart dev server after changing env vars

### Auth Not Working
- Check Supabase Auth settings
- Enable/disable email confirmation as needed
- Verify redirect URLs in Supabase dashboard

---

## 📊 Key Features Checklist

- [x] User authentication (sign up/in/out)
- [x] Role-based access (tenant/landlord)
- [x] Property CRUD operations
- [x] Property search and filtering
- [x] Rental applications
- [x] Maintenance request system
- [x] Payment tracking
- [x] Real-time notifications
- [x] Income analytics (landlords)
- [x] Responsive design
- [x] Protected routes

---

## 🚢 Deployment Quick Steps

### Vercel
```powershell
# Install Vercel CLI (optional)
npm i -g vercel

# Deploy
vercel

# Or use Vercel dashboard + GitHub integration
```

### Manual Steps
1. Push to GitHub
2. Import in Vercel/Netlify
3. Add environment variables
4. Deploy!

See `DEPLOYMENT.md` for detailed guide.

---

## 📚 Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [TailwindCSS Documentation](https://tailwindcss.com/docs)
- [React Documentation](https://react.dev)

---

## 🐛 Getting Help

1. Check error logs in terminal
2. Review Supabase dashboard logs
3. Check browser console for client errors
4. Verify database schema matches `db/schema.sql`
5. Ensure all environment variables are set

---

**Pro Tip**: Keep your `.env.local` file backed up securely (but NEVER commit it to git!)
