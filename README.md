# Acadex

An advanced, premium-designed university academic tracker and automated attendance co-pilot. Built with a minimal, monochromatic design system that supports light and dark themes adaptively, Acadex eliminates the need for excel sheets and complex manual computations by dynamically parsing tables, managing complex schedules, and simulating attendance outcomes mathematically.

---

## ✨ Features

- **📂 Intelligent Timetable PDF Import**: Upload your raw weekly class schedule PDF. Acadex uses a parser pipeline (OCR + deterministic alignment + Gemini LLM fallback) to extract classes, subjects, timings, and build your schedule instantly.
- **🧠 Tabular Normalization & Alignment**: Course codes, lab vs theory hours, and complex day schedules are dynamically mapped without merging independent courses.
- **🔄 Zero-Error Attendance Formulas**:
  - Automatically ensures you maintain at least **75% attendance** ($C_{\text{attended}} \ge \lceil 0.75 \times T \rceil$).
  - Dynamically calculates your **Bunk Budget** ($A_{\text{max}} = \lfloor 0.25 \times T \rfloor$).
  - Implements verification checks ensuring $C_{\text{attended}} + A_{\text{max}} = T$.
- **🎛️ Semester Adjustments**:
  - Add single-day or subject-specific holidays.
  - Log manual makeup or extra classes.
  - Reschedule classes and update attendance status on the fly.
  - Grant custom attendance credits (e.g. duty leave/medical leave).
- **📊 Interactive Simulator**: Real-time projection of attendance rates based on upcoming consecutive lectures to plan ahead.
- **🌓 Adaptive Theme Engine**: High-fidelity theme switching (Light Mode & Dark Mode) optimized for modern monochromatic visual styling (Linear / Vercel style).

---

## 🛠️ Architecture & Tech Stack

- **Desktop Runtime**: [Tauri 2.x](https://v2.tauri.app/) (Rust backend, WebView frontend)
- **Framework**: [Next.js](https://nextjs.org/) (React, App Router)
- **State Management**: Offline-first, reactive state sync engine using `window.localStorage` and `useSyncExternalStore`.
- **PDF Engine**: pdf-extract (Rust native) + pdfjs-dist (TypeScript fallback) — both offline-capable
- **AI Providers** (optional): Ollama (local), Gemini API, OpenAI API, Claude API — all interchangeable via provider interface
- **Styling**: Vanilla CSS + Tailwind CSS utilities with semantic variable overrides
- **Icons**: [Lucide React](https://lucide.dev/)
- **Lint & Tooling**: pnpm package manager, TypeScript verification, Rust/Cargo

---

## 🚀 Installation

### Prerequisites

- **Node.js** (v18.x or above recommended)
- **pnpm** package manager (`npm install -g pnpm`)
- **Rust toolchain** (for Tauri desktop build): `rustc 1.77+` and `cargo`
  - Install from [rustup.rs](https://rustup.rs/)

### Option 1: Desktop App (Tauri — Recommended)

The Tauri desktop app runs fully offline with native PDF extraction.

```bash
# 1. Clone the repository
git clone https://github.com/Imsreejit07/Acadex.git
cd Acadex

# 2. Install Node.js dependencies
pnpm install

# 3. Run in development mode
pnpm tauri dev
```

For **production build**:

```bash
pnpm tauri build
```

The installer will be placed in `src-tauri/target/release/bundle/`.

### Option 2: Web App (Next.js)

The web version uses pdfjs-dist for PDF processing (also offline-capable):

```bash
# 1. Clone and install
git clone https://github.com/Imsreejit07/Acadex.git
cd Acadex
pnpm install

# 2. Run development server
pnpm run dev

# 3. Open http://localhost:3000
```

For **production web build**:

```bash
pnpm run build
pnpm start
```

---

## ⚙️ Configuration

### Environment Variables (.env.local)

```env
# URL for the application
NEXT_PUBLIC_APP_URL=http://localhost:3000

# ── Local AI (Ollama) ──────────────────────────────────
# Optional: for correcting OCR typos & resolving ambiguities
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2  # or any Ollama model

# ── Cloud AI Providers (optional) ──────────────────────
# These can replace Ollama without changing the pipeline
GEMINI_API_KEY=your_gemini_api_key
OPENAI_API_KEY=your_openai_api_key
CLAUDE_API_KEY=your_claude_api_key
```

> **Note**: The parser works **fully offline** without any AI provider configured. AI providers are only used for low-confidence OCR corrections — never for full timetable parsing.

### Offline-First Timetable Parsing

The new deterministic 7-stage pipeline does NOT require internet:

1. **PDF Processing** — Native Rust extraction (Tauri) or pdfjs-dist (Web)
2. **Table Detection** — Coordinate-based geometry analysis
3. **OCR** — PDF native text extraction with confidence scoring
4. **Lookup Extraction** — Deterministic subject/faculty/slot dictionaries
5. **Validation** — Hard gate: fails on unknown slots or missing data
6. **Session Reconstruction** — Grid-based reconstruction with duration from coordinates
7. **Classification** — Rules-based: PDF labels > user config > deterministic defaults

An LLM (Ollama/Gemini/OpenAI/Claude) is only invoked when OCR confidence drops below threshold — and even then, only for the ambiguous cell, never the full timetable.

---

## 🏗️ Project Structure

```
src/
├── app/              # Next.js app router pages
├── features/         # Feature modules (timetable, attendance, etc.)
├── lib/
│   └── parser/       # ← NEW: Deterministic 7-stage parser pipeline
│       ├── types.ts              # Core types & provider interfaces
│       ├── pipeline.ts           # Stage orchestrator
│       ├── compat.ts             # Frontend compatibility layer
│       ├── providers/
│       │   └── ollama-provider.ts # Ollama LLM provider (offline)
│       └── stages/
│           ├── stage1-*.ts       # PDF Processing
│           ├── stage2-*.ts       # Table Detection
│           ├── stage3-*.ts       # OCR
│           ├── stage4-*.ts       # Lookup Extraction
│           ├── stage5-*.ts       # Validation
│           ├── stage6-*.ts       # Session Reconstruction
│           └── stage7-*.ts       # Session Classification
├── shared/          # Shared types, components, utilities
└── src-tauri/       # Tauri Rust backend
    └── src/
        └── lib.rs   # Native PDF extraction with coordinates
```

---

## 📄 License

This project is licensed under the MIT License.