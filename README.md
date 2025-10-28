# EaseRent – Smart Rental Management Platform

A full-stack rental management platform built with **Next.js**, **TailwindCSS**, and **Supabase** that simplifies interactions between landlords and tenants.

## 🚀 Features

### For Landlords
- **Property Management**: Add, edit, and manage rental properties
- **Payment Tracking**: Record payments and view income reports
- **Maintenance Oversight**: Track and respond to tenant maintenance requests
- **Dashboard Analytics**: View total income, payment counts, and averages

### For Tenants
- **Property Search**: Browse available properties with city-based filtering
- **Apply Online**: Submit rental applications directly through the platform
- **Maintenance Requests**: Submit and track maintenance issues with priority levels
- **Payment History**: View all payment records and transaction history

### Core Capabilities
- **Secure Authentication**: Email/password sign-up and sign-in with role-based access (landlord/tenant)
- **Real-time Data**: Powered by Supabase for instant updates
- **Responsive Design**: Mobile-friendly interface built with TailwindCSS
- **Protected Routes**: Role-based access control throughout the application

## 📋 Prerequisites

- Node.js 16+ and npm
- A Supabase account and project ([supabase.com](https://supabase.com))
- Git (optional, for version control)

## 🛠️ Installation & Setup

### 1. Install Dependencies

```powershell
cd "C:\Users\Alfonz\OneDrive\Desktop\Codes\fortest2"
npm install
```

### 2. Configure Supabase

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-key
```

Replace with your actual Supabase credentials from your project settings.

### 3. Set Up Database Schema

1. Open your Supabase project dashboard
2. Navigate to the SQL Editor
3. Copy and paste the contents of `db/schema.sql`
4. Execute the SQL to create all necessary tables

**Tables created:**
- `profiles` – User profiles with roles (tenant/landlord)
- `properties` – Rental property listings
- `applications` – Tenant rental applications
- `bookings` – Property viewing appointments
- `maintenance_requests` – Maintenance and complaint tracking
- `payments` – Payment records and history
- `notifications` – In-app notification system

### 4. Run the Development Server

```powershell
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🏗️ Project Structure

```
fortest2/
├── db/
│   └── schema.sql          # Supabase database schema
├── lib/
│   └── supabaseClient.js   # Supabase client configuration
├── pages/
│   ├── _app.js             # App wrapper with global config
│   ├── index.js            # Landing page
│   ├── dashboard.js        # User dashboard (role-aware)
│   ├── auth/
│   │   └── index.js        # Sign up / Sign in page
│   ├── properties/
│   │   ├── index.js        # Property listing & search
│   │   ├── [id].js         # Property detail & application
│   │   └── new.js          # Add/edit property (landlords)
│   ├── maintenance.js      # Maintenance request management
│   └── payments.js         # Payment tracking & reports
├── styles/
│   └── globals.css         # Global styles with Tailwind
├── .env.local              # Environment variables (not in git)
├── package.json
├── next.config.js
├── tailwind.config.js
├── postcss.config.js
└── README.md
```

## 📖 Usage Guide

### First-Time Setup

1. **Sign Up**: Visit `/auth` and create an account
   - Choose your role: Tenant or Landlord
   - Provide your full name and email
   - Check your email for confirmation (if email confirmation is enabled in Supabase)

2. **Sign In**: Use your credentials to access the dashboard

### For Landlords

1. **Add Properties**:
   - Go to Dashboard → "Add Property"
   - Fill in property details (title, address, price, beds/baths, etc.)
   - Submit to list the property

2. **Track Payments**:
   - Navigate to "Payments"
   - Click "Record Payment" to log new payments
   - View income summary and analytics

3. **Monitor Maintenance**:
   - Check "Maintenance Requests" to see tenant issues
   - Update status as you resolve them

### For Tenants

1. **Browse Properties**:
   - Click "Browse Properties" from the dashboard
   - Use the search bar to filter by city
   - Click on any property to view details

2. **Apply for Properties**:
   - On the property detail page, submit an application
   - Include a message to the landlord

3. **Submit Maintenance Requests**:
   - Go to "Maintenance Requests"
   - Click "New Request"
   - Select property, describe the issue, and set priority

4. **View Payment History**:
   - Navigate to "Payments" to see your payment records

## 🚢 Deployment

### Deploy to Vercel (Recommended)

1. Push your code to a GitHub repository
2. Import the project in [Vercel](https://vercel.com)
3. Add environment variables in Vercel project settings:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy!

### Deploy to Netlify

1. Connect your GitHub repository to Netlify
2. Set build command: `npm run build`
3. Set publish directory: `.next`
4. Add environment variables in Netlify site settings
5. Deploy

## 🧪 Building for Production

```powershell
npm run build
npm start
```

## 🔐 Security Notes

- Never commit `.env.local` to version control
- Use Supabase Row Level Security (RLS) policies for production
- The current implementation uses basic client-side checks; add server-side validation for production
- Enable email confirmation in Supabase Auth settings for additional security

## 🐛 Troubleshooting

**Build fails with Tailwind errors:**
- Ensure `@tailwindcss/postcss` is installed
- Check that `postcss.config.js` references `@tailwindcss/postcss`

**Supabase connection issues:**
- Verify your `.env.local` file has correct credentials
- Check that your Supabase project is active
- Ensure tables are created from `db/schema.sql`

**Auth not working:**
- Check Supabase Auth settings (email confirmations, providers)
- Verify environment variables are loaded (restart dev server)

## 📝 Next Steps & Enhancements

- [ ] Add real-time notifications using Supabase Realtime
- [ ] Implement image uploads for properties (Supabase Storage)
- [ ] Add booking/appointment scheduling system
- [ ] Create admin panel for super-admin oversight
- [ ] Integrate payment gateway (Stripe, PayPal)
- [ ] Add automated email reminders for rent due dates
- [ ] Implement property search filters (price range, bedrooms, etc.)
- [ ] Add unit tests and E2E tests
- [ ] Enhance accessibility (ARIA labels, keyboard navigation)
- [ ] Add data export features (CSV, PDF reports)

## 📄 License

This project is open source and available for educational and commercial use.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## 📧 Support

For questions or support, please open an issue in the repository.

---

**Built with ❤️ using Next.js, TailwindCSS, and Supabase**

