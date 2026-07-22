# Supabase Authentication & Production URL Setup Guide

This document outlines the required configuration for **Supabase Authentication** and environment variables to ensure email confirmation links point to the live deployed application and function seamlessly on mobile devices (Gmail, Apple Mail, Chrome, Safari, etc.).

---

## 1. Supabase Dashboard Configuration

### Step A: Access Authentication URL Settings
1. Open the [Supabase Dashboard](https://supabase.com/dashboard).
2. Select your Acadex project (`qvxzchpwxfoycmrlrigg`).
3. Navigate to **Authentication** (lock icon on the sidebar) -> **URL Configuration**.

### Step B: Configure Site URL
- **Site URL**: Enter your primary live production domain (e.g. `https://acadex.vercel.app` or your custom domain).
  > **Note**: Do *not* leave this set to `http://localhost:3000` in production, as Supabase falls back to the Site URL whenever an unlisted or relative redirect is used.

### Step C: Configure Allowed Redirect URLs
In the **Redirect URLs** section, add the following wildcard and environment patterns:
- `https://acadex.vercel.app/**` (Production domain)
- `https://*.vercel.app/**` (Vercel Preview deployments wildcard)
- `http://localhost:3000/**` (Local development)
- `http://127.0.0.1:3000/**` (Local development alternative)

Click **Save**.

---

## 2. Environment Variables Setup

### Production (Vercel / Hosting Provider)
In your Vercel Project Settings -> Environment Variables, add:
- `NEXT_PUBLIC_SITE_URL`: `https://acadex.vercel.app` (your production domain)

### Local Development (`.env.local`)
```env
NEXT_PUBLIC_SUPABASE_URL=https://qvxzchpwxfoycmrlrigg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

---

## 3. How the Authentication Pipeline Works

1. **Signup**: When a user registers in `/signup`, `getURL('/auth/callback')` dynamically detects the current origin (`window.location.origin` in browser, `NEXT_PUBLIC_SITE_URL` in production) and passes it as `emailRedirectTo` to `supabase.auth.signUp()`.
2. **Email Link**: Supabase generates a confirmation email containing a verification token pointing to `https://acadex.vercel.app/auth/callback?code=...`.
3. **Mobile Tap**: Tapping the email link opens `https://acadex.vercel.app/auth/callback`.
4. **Callback & Session Restoration**:
   - The `/auth/callback` page exchanges the code for an active Supabase session.
   - It hydrates user data from the database (`loadStateFromSupabase()`).
   - It checks whether the user has completed onboarding / has an active semester.
   - It automatically routes the user directly into `/dashboard` (or `/dashboard/onboarding` for new users).

---

## 4. End-to-End Mobile Testing Checklist

- [x] **Email Generation**: Trigger signup from the live application. Check the email link target—confirm it starts with `https://` and points to your live domain, NOT `http://localhost:3000`.
- [x] **Gmail / Mobile Email Client**: Open the verification email in Gmail or Apple Mail on iOS/Android.
- [x] **In-App Browser / System Browser**: Tap the link. Verify that it opens cleanly, shows "Verifying your email...", and automatically redirects to `/dashboard`.
- [x] **Existing Active Session**: Tap the link while already signed into the app. Verify that the app verifies the email and continues into the dashboard without prompting for another login.
- [x] **Repeated Taps**: Tap the link multiple times. Verify that fallback error handling gracefully guides the user to the Dashboard without crashing or showing a broken page.
