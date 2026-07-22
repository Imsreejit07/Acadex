# 🎓 Acadex — University Academic & Attendance Co-Pilot

An advanced, high-performance university academic tracker, schedule manager, and automated attendance co-pilot. Built with a sleek, monochromatic visual design system (Linear / Vercel aesthetic) supporting adaptive dark and light modes, **Acadex** eliminates manual spreadsheets and complex calculations by dynamically parsing university timetables, tracking lectures, managing semester events, and computing exact attendance metrics with mathematical zero-error precision.

---

## 🌟 Key Features

### 🔐 1. Seamless Cloud Sync & Authentication
- **Supabase Cloud Auth**: Multi-device sync with email/password authentication and Supabase Postgres database backend.
- **Mobile-First Email Verification**: Seamless PKCE verification flow (`/auth/callback`) designed for mobile email clients (Gmail, Apple Mail, Chrome, Safari). Tapping verification links on mobile automatically verifies the account, restores the session, and lands directly in the Dashboard.
- **Offline-First Hybrid Architecture**: Fast, reactive client-side local caching paired with asynchronous cloud database sync (`loadStateFromSupabase()`).

### 📐 2. Zero-Error Attendance Math Engine
Strict adherence to academic thresholds ensuring you never drop below **75% attendance**:

- **Minimum Attended Requirement**:
  $$C_{\text{attended}} \ge \lceil 0.75 \times T \rceil$$
- **Bunk Budget (Maximum Safe Absences)**:
  $$A_{\text{max}} = \lfloor 0.25 \times T \rfloor$$
- **Double-Check Verification Inequality**:
  $$C_{\text{attended}} + A_{\text{max}} = T$$
  $$\text{Actual Min \% Attendance} = \left( \frac{C_{\text{attended}}}{T} \right) \times 100 \ge 75\%$$

### 🤖 3. Intelligent PDF & Timetable OCR Parser
- **Automated Timetable Upload**: Parse scanned university schedule PDFs using a 7-stage deterministic extraction pipeline.
- **Dynamic Course Code Detection**: Regex-based digit matching (`/\b([A-Z¢©®]*\d+[A-Z\d¢©®]*)\b/i`) preventing horizontal OCR text merging.
- **Multi-AI Fallback Engine**: Supports local Ollama models, Marker PDF service, and Gemini API key rotation/failover for low-confidence OCR cells.

### 📅 4. Complete Academic Management Suite
- **Dashboard**: High-level attendance overview, subject health cards, and today's schedule.
- **Semester Manager**: Organize active, upcoming, and archived semesters.
- **Academic Events & Holidays**: Track exam dates, duty leaves, official holidays, extra makeup classes, and rescheduled lectures.
- **Attendance Calculator**: Interactive simulator projecting attendance percentages based on upcoming consecutive attended/bunked lectures.
- **Lecture History**: Comprehensive log of past class attendances with one-click adjustments.
- **Analytics**: Visual charts breakdown of attendance distribution by subject.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Frontend Framework** | [Next.js 16](https://nextjs.org/) (React, App Router, TypeScript) |
| **Desktop Runtime** | [Tauri 2.x](https://v2.tauri.app/) (Rust backend, WebView frontend) |
| **Database & Auth** | [Supabase](https://supabase.com/) (PostgreSQL, Row Level Security, Auth Services) |
| **Styling & Design** | Vanilla CSS Tokens + Tailwind CSS (Monochromatic Dark/Light UI) |
| **Icons** | [Lucide React](https://lucide.dev/) |
| **PDF Extraction** | `pdfjs-dist` & Native Rust `pdf-extract` |
| **AI Models** | Google Gemini API (Rotation/Failover), Ollama (Local), Marker PDF Sidecar |

---

## 📂 Project Architecture

```text
d:/attendance_tool/
├── src/
│   ├── app/                    # Next.js App Router Pages
│   │   ├── (auth)/             # Authentication Routes
│   │   │   ├── login/          # Sign In Page
│   │   │   └── signup/         # Sign Up Page (Mobile Redirect Enabled)
│   │   ├── (dashboard)/        # Main Application Views
│   │   │   ├── dashboard/      # Attendance Overview & Today's Schedule
│   │   │   ├── analytics/      # Performance & Distribution Charts
│   │   │   ├── calculator/     # Interactive Bunk & Class Simulator
│   │   │   ├── events/         # Academic Events & Duty Leaves
│   │   │   ├── history/        # Lecture Logs & Override History
│   │   │   ├── onboarding/     # Initial Setup Stepper
│   │   │   ├── semester/       # Semester Manager
│   │   │   ├── settings/       # User Preferences & BYOK API Keys
│   │   │   └── subjects/       # Subject & Lab Configurator
│   │   ├── auth/callback/      # Supabase PKCE Verification Handler
│   │   ├── page.tsx            # Root Session & Cloud State Guard
│   │   └── layout.tsx          # Global Shell & Font Providers
│   ├── features/               # Feature Domain Logic
│   │   ├── attendance/         # Attendance Calculations & Reactive Store
│   │   └── lecture-engine/     # AI PDF Parsing & Timetable Generator
│   └── shared/                 # Core Utilities & Services
│       ├── lib/
│       │   ├── supabase.ts     # Supabase Client Configuration
│       │   ├── supabase-service.ts # Cloud Database State Hydration & Sync
│       │   └── url-resolver.ts # Dynamic Production URL Resolution
│       └── components/         # Shared UI Components
├── supabase/
│   └── migrations/             # Database Schema SQL Files
├── src-tauri/                  # Rust Tauri Desktop Wrapper
├── AUTH_SETUP.md               # Supabase Authentication & Site URL Guide
├── package.json                # Dependencies & Build Scripts
└── next.config.ts              # Next.js Build Configuration
```

---

## ⚡ Quick Start & Installation

### Prerequisites
- **Node.js** `v18.x` or later
- **pnpm** package manager (`npm install -g pnpm`)
- **Rust Toolchain** (optional, for Tauri desktop builds): `rustc 1.77+`

### 1. Clone & Install
```bash
git clone https://github.com/Imsreejit07/Acadex.git
cd Acadex
pnpm install
```

### 2. Configure Environment Variables
Create `.env.local` in the project root:

```env
# Supabase Authentication & Database
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Site URL for Production Redirects
NEXT_PUBLIC_SITE_URL=https://acadex.vercel.app

# AI Provider API Keys (Optional)
GEMINI_API_KEYS=your_key_1,your_key_2
```

### 3. Run Development Server
```bash
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📱 Mobile Email Verification Setup

To ensure verification links in sign-up emails work seamlessly on mobile phones (Gmail, Apple Mail, Chrome, Safari) without pointing to `localhost`:

1. In **Supabase Dashboard** $\rightarrow$ **Authentication** $\rightarrow$ **URL Configuration**:
   - **Site URL**: `https://acadex.vercel.app`
   - **Redirect URLs**:
     - `https://acadex.vercel.app/**`
     - `https://*.vercel.app/**`
     - `http://localhost:3000/**`
2. Set `NEXT_PUBLIC_SITE_URL=https://acadex.vercel.app` in your Vercel Environment Variables.
3. Detailed configuration steps can be found in [AUTH_SETUP.md](file:///d:/attendance_tool/AUTH_SETUP.md).

---

## 🚀 Building & Deployment

### Production Web Build
```bash
pnpm build
pnpm start
```

### Desktop Application Build (Tauri)
```bash
pnpm tauri build
```
The executable installer will be generated in `src-tauri/target/release/bundle/`.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.