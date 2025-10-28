# 🔐 Registration/Login Error Fix

## Error You're Seeing:
```
Auth error: AuthApiError: Invalid login credentials
```

---

## 🤔 What This Means:

This error happens during **Sign In** (not registration). It means:

1. ❌ Wrong email or password
2. ❌ Email not confirmed (if confirmation enabled)
3. ❌ Account doesn't exist with that email
4. ✅ Registration might have worked, but sign in failed

---

## ✅ QUICK FIXES:

### Fix 1: Disable Email Confirmation (Recommended for Testing)

1. **Supabase Dashboard** → **Authentication** → **Settings**
2. Find **"Enable email confirmations"**
3. **Uncheck it**
4. Click **Save**
5. Try registering again with a **new email**

### Fix 2: Check What Accounts Exist

Run this SQL in Supabase SQL Editor:

```sql
-- See all registered users
SELECT id, email, email_confirmed_at, created_at 
FROM auth.users 
ORDER BY created_at DESC;

-- See all profiles
SELECT id, full_name, role, created_at 
FROM profiles 
ORDER BY created_at DESC;
```

**Look for**:
- Your email in the list
- If `email_confirmed_at` is NULL → email not confirmed
- If email exists but no profile → profile creation failed

### Fix 3: Delete Old Test Accounts

If you tried registering multiple times, delete old attempts:

```sql
-- Delete user (replace with actual email)
DELETE FROM auth.users WHERE email = 'your-test-email@example.com';

-- Profile will auto-delete due to CASCADE
```

Then try registering fresh.

---

## 🧪 PROPER TEST FLOW:

### Step 1: Register New Account
1. Click **"Register"** (not Login)
2. Fill in:
   - Full Name: Test User
   - Email: **NEW unique email** (e.g., `test123@example.com`)
   - Password: **At least 6 characters** (e.g., `password123`)
3. Click **"Sign Up"**
4. Wait for success message

### Step 2: Check Result

**If email confirmation DISABLED**:
- ✅ Should see: "Sign-up complete! Redirecting..."
- ✅ Redirects to dashboard automatically
- ✅ You're logged in!

**If email confirmation ENABLED**:
- ⚠️ Should see: "Check your email to confirm..."
- ⚠️ Must click link in email
- ⚠️ Then come back and sign in

### Step 3: Sign In (if needed)
1. Click **"Login"** (not Register)
2. Enter **same email and password**
3. Click **"Sign In"**
4. Should redirect to dashboard

---

## 🔍 DEBUGGING STEPS:

### Check 1: Are You on Sign Up or Sign In?

- **"Create Account"** at top = Sign Up mode ✅ (for new users)
- **"Sign In"** at top = Sign In mode ✅ (for existing users)

Bottom link toggles between modes.

### Check 2: Browser Console (F12)

Look for these logs:
```javascript
SignUp response: {...}  // When registering
Sign in successful: {...}  // When logging in
```

If you see `Profile creation error:`, the registration failed.

### Check 3: Network Tab (F12 → Network)

Filter by "auth" and look for:
- `400 Bad Request` = Invalid credentials
- `422 Unprocessable Entity` = Email already registered
- `200 OK` = Success

---

## 💡 COMMON MISTAKES:

### ❌ Mistake 1: Using Sign In for New Account
**Wrong**: Click "Login" → Enter new email → Error
**Right**: Click "Register" → Fill form → Sign Up

### ❌ Mistake 2: Email Already Registered
**Error**: Trying to register same email twice
**Fix**: Use different email OR delete old account

### ❌ Mistake 3: Password Too Short
**Error**: Supabase requires minimum 6 characters
**Fix**: Use longer password (e.g., `password123`)

### ❌ Mistake 4: Forgot Which Email You Used
**Fix**: Check Supabase → Authentication → Users list

---

## 📋 COMPLETE RESET PROCEDURE:

If everything is messed up, start fresh:

### 1. Delete All Test Users
```sql
-- Delete all test users
DELETE FROM auth.users WHERE email LIKE '%test%';
DELETE FROM auth.users WHERE email LIKE '%example%';
```

### 2. Disable Email Confirmation
Supabase → Authentication → Settings → Uncheck "Enable email confirmations"

### 3. Try Fresh Registration
- Go to homepage
- Click "Register"
- Use **brand new email**: `tenant1@test.com`
- Password: `password123`
- Click "Sign Up"

### 4. Should Auto-Login
✅ No email confirmation needed
✅ Profile created automatically
✅ Redirected to dashboard

---

## 🎯 EXPECTED BEHAVIOR:

### Registration Success:
```
1. Fill form → Click "Sign Up"
2. See: "Sign-up complete! Redirecting..."
3. Automatic redirect to /dashboard
4. You're logged in as tenant
```

### Sign In Success:
```
1. Click "Login" tab
2. Enter existing email/password
3. Click "Sign In"
4. Redirect to /dashboard
```

---

## 🆘 STILL NOT WORKING?

1. **Check console** (F12) for specific error
2. **Copy full error message**
3. **Run SQL** to check users/profiles
4. **Try different email** (completely new one)
5. **Disable email confirmation** if not already done

---

## 📊 Quick Diagnostic:

Run this and share results:

```sql
-- How many users exist?
SELECT COUNT(*) as user_count FROM auth.users;

-- How many profiles?
SELECT COUNT(*) as profile_count FROM profiles;

-- Show recent attempts
SELECT email, email_confirmed_at, created_at 
FROM auth.users 
ORDER BY created_at DESC 
LIMIT 5;
```

---

**Most likely issue**: Email confirmation is enabled and you didn't check email, OR you're using Sign In instead of Register.

**Quick fix**: Disable email confirmation and try with a completely new email! 🚀
