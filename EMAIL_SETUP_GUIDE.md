# Email Setup Guide - EaseRent

## Automated Email Notifications for Viewing Approvals

This guide explains how to set up automated email notifications using Resend when landlords approve viewing requests.

---

## 🚀 Quick Setup

### Step 1: Sign up for Resend

1. Go to [https://resend.com](https://resend.com)
2. Create a free account (3,000 emails/month free)
3. Verify your email address

### Step 2: Get Your API Key

1. Log in to your Resend dashboard
2. Go to **API Keys** section
3. Click **Create API Key**
4. Give it a name (e.g., "EaseRent Production")
5. Copy the API key (starts with `re_`)

### Step 3: Add API Key to Environment Variables

Add this to your `.env.local` file:

```bash
RESEND_API_KEY=re_5kUYVzef_PjS2hWdynWcnUzuHvwNKfMCg
```

⚠️ **Important:** Replace `re_your_api_key_here` with your actual API key from Resend.

### Step 4: Restart Your Development Server

```bash
# Stop the current server (Ctrl+C)
# Then restart:
npm run dev
```

---

## 📧 How It Works

### Automatic Email Flow

1. **Tenant books a viewing** → Viewing request created
2. **Landlord approves the request** → System triggers email
3. **Email is sent to tenant** with:
   - ✅ Approval confirmation
   - 📍 Property details (title, address)
   - 📅 Viewing date and time slot
   - 👤 Landlord contact information
   - 💡 Helpful viewing tips

### Email Features

- **Professional HTML template** with EaseRent branding
- **Mobile responsive** design
- **Comprehensive information** including:
  - Property details card
  - Viewing schedule card
  - Landlord contact card
  - Important notices
  - Viewing tips

---

## 🔧 Technical Details

### Files Created

1. **`lib/email.js`** - Email utility functions
   - `sendViewingApprovalEmail()` - Sends approval emails with full details
   - `sendNotificationEmail()` - Generic email sender

2. **`pages/api/send-email.js`** - API endpoint
   - Handles email sending requests
   - Fetches booking and user data from database
   - Returns success/error status

3. **Updated `pages/bookings.js`**
   - Calls email API when landlord approves a booking
   - Shows success message to landlord

### Email Template Variables

The email template uses these variables:
- `tenantName` - Full name of the tenant
- `propertyTitle` - Name of the property
- `propertyAddress` - Full address with city
- `viewingDate` - Date object for the viewing
- `timeSlot` - "Morning (8:00 AM - 11:00 AM)" or "Afternoon (1:00 PM - 5:30 PM)"
- `landlordName` - Name of the landlord
- `landlordPhone` - Landlord's phone number

---

## 🎨 Customizing the Email

### Change Sender Email (After Domain Verification)

In `lib/email.js`, update the `from` field:

```javascript
from: 'EaseRent <noreply@yourdomain.com>', // Your verified domain
```

**Note:** The default `onboarding@resend.dev` works for testing but has limitations. To use your own domain:

1. Go to Resend Dashboard → **Domains**
2. Click **Add Domain**
3. Add your domain (e.g., `yourdomain.com`)
4. Follow DNS verification steps
5. Once verified, use `noreply@yourdomain.com` or any email

### Customize Email Template

Edit the HTML in `lib/email.js` → `sendViewingApprovalEmail()` function:
- Change colors, fonts, layout
- Add your logo
- Modify content sections
- Add additional information

---

## 📊 Monitoring Emails

### View Sent Emails

1. Log in to [Resend Dashboard](https://resend.com/emails)
2. Go to **Emails** section
3. See all sent emails with:
   - Delivery status
   - Open rates (if tracking enabled)
   - Timestamps
   - Error details (if failed)

### Email Logs

Check your server console for logs:
- `Email sent successfully:` - Success
- `Error sending email:` - Failure details

---

## ⚠️ Troubleshooting

### Email Not Sending

**Check these:**

1. ✅ RESEND_API_KEY is set in `.env.local`
2. ✅ Server was restarted after adding the key
3. ✅ Tenant profile has a valid email address
4. ✅ API key is active in Resend dashboard

### "Tenant email not found" Error

Make sure tenants have email addresses in their profiles:
- Check `profiles` table in Supabase
- Email column should not be null
- User must sign up with email (not phone-only)

### Rate Limits

Free tier limits:
- **3,000 emails/month**
- **100 emails/day**

If you hit limits, upgrade your Resend plan.

---

## 🔐 Security Best Practices

1. **Never commit `.env.local`** to Git
2. **Use environment variables** for API keys
3. **Validate all inputs** before sending emails
4. **Rate limit** your API endpoint to prevent abuse
5. **Log email sending attempts** for monitoring

---

## 🚀 Production Deployment

### Vercel

Add environment variable in Vercel dashboard:
1. Go to your project → **Settings** → **Environment Variables**
2. Add `RESEND_API_KEY` with your API key
3. Redeploy your app

### Other Platforms

Add `RESEND_API_KEY` to your platform's environment variables:
- Netlify: Site settings → Environment
- Railway: Variables tab
- Heroku: Config Vars

---

## 💰 Pricing

**Free Tier:**
- 3,000 emails/month
- 100 emails/day
- Email API access
- Email logs

**Pro Plan ($20/month):**
- 50,000 emails/month
- No daily limits
- Custom domains
- Priority support

[View full pricing](https://resend.com/pricing)

---

## 📞 Support

- **Resend Docs:** [https://resend.com/docs](https://resend.com/docs)
- **EaseRent Issues:** Check your server console logs
- **API Status:** [https://resend.com/status](https://resend.com/status)

---

## ✅ Testing Checklist

Before going live, test:

- [ ] Email sends when booking is approved
- [ ] Correct tenant email is used
- [ ] All property details appear correctly
- [ ] Viewing date/time displays properly
- [ ] Landlord contact info is accurate
- [ ] Email looks good on mobile devices
- [ ] Links work correctly (if any)
- [ ] Unsubscribe link (if required)

---

**Setup complete!** 🎉 Your automated email system is ready to send viewing approval notifications to tenants.
