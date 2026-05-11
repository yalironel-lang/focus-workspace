# Focus Workspace

A production-ready web application for students and busy users to manage PDFs, links, notes, and tasks. Everything is organized into a structured system: **Sections → Groups → Items**.

## Features

- **Email Magic Link Authentication** - Secure, passwordless login via Supabase Auth
- **Persistent Data** - All data stored in Supabase PostgreSQL database
- **File Uploads** - PDF uploads to private Supabase Storage with signed URLs
- **Smart Continue Button** - Always takes you to the next logical thing to do
- **Progress Tracking** - Visual progress bars for each section
- **Smart Guidance** - Helpful messages when groups are empty
- **Cross-Device** - Works on any device after login
- **Real-time Sync** - Data persists across sessions and devices

## Tech Stack

- **Frontend**: React 19 + Vite + TypeScript
- **Backend**: Supabase (Auth + Database + Storage)
- **Styling**: TailwindCSS
- **State**: Simple React state (no Redux)

## Data Model

```
sections
├── id (uuid)
├── user_id
├── title
└── created_at

groups
├── id (uuid)
├── section_id
├── title (Slides, Exercises, Exams, Notes)
└── order_index

items
├── id (uuid)
├── group_id
├── type (task | file | link | note)
├── title
├── content (text or URL)
├── file_path (nullable)
├── completed (boolean)
├── order_index
└── created_at
```

## Quick Start

### 1. Clone and Install

```bash
git clone <repo>
cd focus-workspace
npm install
```

### 2. Supabase Setup

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Go to **Project Settings → API** and copy:
   - `Project URL`
   - `anon/public` key

3. Create a `.env` file:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Database Setup

Go to **SQL Editor → New query** and run the migration in `supabase/migrations/001_initial.sql`:

```sql
-- Create tables
CREATE TABLE sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('task', 'file', 'link', 'note')),
  title TEXT NOT NULL,
  content TEXT,
  file_path TEXT,
  completed BOOLEAN NOT NULL DEFAULT false,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;

-- Sections policies
CREATE POLICY "Users can view own sections" ON sections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sections" ON sections FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sections" ON sections FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sections" ON sections FOR DELETE USING (auth.uid() = user_id);

-- Groups policies (through sections)
CREATE POLICY "Users can view groups in own sections" ON groups FOR SELECT USING (
  EXISTS (SELECT 1 FROM sections WHERE sections.id = groups.section_id AND sections.user_id = auth.uid())
);
CREATE POLICY "Users can insert groups in own sections" ON groups FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM sections WHERE sections.id = groups.section_id AND sections.user_id = auth.uid())
);
CREATE POLICY "Users can update groups in own sections" ON groups FOR UPDATE USING (
  EXISTS (SELECT 1 FROM sections WHERE sections.id = groups.section_id AND sections.user_id = auth.uid())
);
CREATE POLICY "Users can delete groups in own sections" ON groups FOR DELETE USING (
  EXISTS (SELECT 1 FROM sections WHERE sections.id = groups.section_id AND sections.user_id = auth.uid())
);

-- Items policies (through groups → sections)
CREATE POLICY "Users can view items in own sections" ON items FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM groups
    JOIN sections ON sections.id = groups.section_id
    WHERE groups.id = items.group_id AND sections.user_id = auth.uid()
  )
);
CREATE POLICY "Users can insert items in own sections" ON items FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM groups
    JOIN sections ON sections.id = groups.section_id
    WHERE groups.id = items.group_id AND sections.user_id = auth.uid()
  )
);
CREATE POLICY "Users can update items in own sections" ON items FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM groups
    JOIN sections ON sections.id = groups.section_id
    WHERE groups.id = items.group_id AND sections.user_id = auth.uid()
  )
);
CREATE POLICY "Users can delete items in own sections" ON items FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM groups
    JOIN sections ON sections.id = groups.section_id
    WHERE groups.id = items.group_id AND sections.user_id = auth.uid()
  )
);
```

### 4. Storage Setup

1. Go to **Storage → New bucket**
2. Name: `pdfs`
3. Uncheck "Public bucket" (keep it private)
4. Click **Create bucket**

Add storage policies in SQL Editor:

```sql
-- Create bucket (if not exists via UI)
INSERT INTO storage.buckets (id, name, public) VALUES ('pdfs', 'pdfs', false);

-- Upload policy
CREATE POLICY "Users can upload own PDFs" ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

-- View policy
CREATE POLICY "Users can view own PDFs" ON storage.objects FOR SELECT
USING (bucket_id = 'pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Delete policy
CREATE POLICY "Users can delete own PDFs" ON storage.objects FOR DELETE
USING (bucket_id = 'pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);
```

### 5. Auth Configuration

1. Go to **Authentication → Providers**
2. Enable **Email** provider
3. Disable "Confirm email" (for magic links) or keep enabled if you want email confirmation
4. In **URL Configuration**, set:
   - Site URL: `http://localhost:5173` (for local dev)
   - Redirect URLs: `http://localhost:5173/*`

### 6. Run Locally

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## How to Use

1. **Sign In**: Enter your email and click "Send Magic Link". Check your email and click the link.
2. **Create a Section**: Click "New Section" and give it a name (e.g., "Calculus 101").
3. **Add Items**: In each group (Slides, Exercises, Exams, Notes), click "Add" to create tasks, upload PDFs, add links, or write notes.
4. **Continue Button**: Click "Continue" to jump to the next thing you need to do.
5. **Track Progress**: See your completion percentage on the dashboard and section pages.

## Continue Button Logic

The Continue button finds the next logical item:

1. **First**: Find the first incomplete task (highest priority)
2. **Second**: Find the next file or link to review
3. **Third**: Find notes to read
4. **If nothing**: Shows "All Caught Up" ✅

Priority order for groups: **Exams → Exercises → Slides → Notes**

## Smart Guidance

When groups are empty, you get helpful messages:

- **Exams empty**: "No past exams uploaded — this is the highest priority"
- **Exercises empty**: "Practice is what turns reading into recall"
- **Slides empty**: "Upload lecture slides to get started"
- **Notes empty**: "Add study notes to reinforce learning"

## Project Structure

```
focus-workspace/
├── src/
│   ├── components/
│   │   ├── Layout.tsx          # App shell with nav
│   │   ├── Auth.tsx            # Login form
│   │   ├── SectionCard.tsx     # Dashboard card
│   │   ├── GroupComponent.tsx  # Group container
│   │   ├── ItemComponent.tsx   # Individual item
│   │   ├── AddItemModal.tsx    # Add item dialog
│   │   └── ContinueButton.tsx  # Smart continue logic
│   ├── hooks/
│   │   ├── useAuth.ts          # Auth context
│   │   ├── useSections.ts      # Sections data
│   │   └── useFileUpload.ts    # File operations
│   ├── lib/
│   │   ├── supabase.ts         # Supabase client
│   │   └── database.types.ts   # TypeScript types
│   ├── types/
│   │   └── index.ts            # Shared interfaces
│   ├── pages/
│   │   ├── Dashboard.tsx       # Home page
│   │   └── SectionPage.tsx     # Section detail
│   ├── App.tsx                 # Router setup
│   ├── main.tsx                # Entry point
│   └── index.css               # Tailwind + globals
├── supabase/
│   └── migrations/
│       └── 001_initial.sql     # DB schema
├── .env.example
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

## Deployment

### Build for Production

```bash
npm run build
```

### Deploy to Vercel/Netlify

1. Push to GitHub
2. Connect to Vercel or Netlify
3. Set environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
4. Deploy

### Update Supabase Auth Redirects

In the [Supabase Dashboard](https://supabase.com/dashboard) → **Authentication** → **URL Configuration**:

1. **Redirect URLs** — add every origin users may return to after Google OAuth (Supabase only allows listed URLs; otherwise it falls back to **Site URL**, which often sends local dev to production).

   Include at least:

   - `http://localhost:5173/**`
   - `http://localhost:5175/**`
   - `http://127.0.0.1:5173/**`
   - Full paths if you prefer explicit entries, e.g. `http://localhost:5173/dashboard` and `http://localhost:5175/dashboard`
   - Your production app, e.g. `https://your-project.vercel.app/**` and `https://your-custom-domain.com/**`

2. **Site URL** — set to your primary production URL (used as a fallback).

The app builds `redirectTo` as the current origin + `/dashboard` on localhost (any port), and on non-local hosts uses `window.location.origin` or optional `VITE_AUTH_REDIRECT_ORIGIN` (see `.env.example`).

## Key Design Decisions

1. **No Redux**: Simple React state with hooks is sufficient and reduces complexity
2. **Magic Links**: Passwordless auth is secure and user-friendly
3. **Private Storage**: PDFs are stored privately with signed URLs for security
4. **RLS Policies**: Row Level Security ensures users can only access their own data
5. **Deterministic Ordering**: Items and groups have `order_index` for consistent sorting

## License

MIT
