<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Urlist Agent Guidelines

## Project Overview

**Urlist** is a link-list sharing app built with Next.js 16, React 19, and Azure Cosmos DB. Users create curated URL collections, assign custom slugs, and share via public links. 

### Tech Stack
- **Framework:** Next.js 16 (App Router) + React 19
- **Database:** Azure Cosmos DB (3 containers: lists, links, analytics)
- **Auth:** GitHub OAuth with JWT in httpOnly cookies (7-day expiry)
- **Styling:** Tailwind CSS 4 + PostCSS
- **Testing:** Vitest (not Jest)
- **Drag & Drop:** @dnd-kit
- **Validation:** Zod schemas

## Architecture & Data Flow

### Core Flow: Compose → Publish → View

1. **Compose**: User adds URLs on `app/app/compose/[listId]/page.tsx`
2. **Publish**: `POST /api/lists` → rate-limit check → slug validation → atomic reserve-slug → create list/links/userList records
3. **View**: Public URL `/{slug}` → `app/[...slug]/page.tsx` → `GET /api/lists/[listId]` with slug resolution
4. **Analytics**: Visitor IP+UA fingerprinted (SHA256) for non-owner views

### Database Layout

**Cosmos DB containers:**
- `lists`: List metadata (id, slug, description, ownerId, updatedAt)
- `links`: Link records with OG metadata (id, listId, url, ogTitle, position, etc.)
- `analytics`: Visitor events (listId, linkId, eventType, clientHash)
- `slugs`: Slug → listId mapping (for collision prevention, slug reservation uses 409 conflict detection)

---

## File Structure Guide

```
app/                      # Next.js App Router
├── api/                  # REST API routes (all returning { data } or { error })
│   ├── auth/             # GitHub OAuth login/logout/callback/me
│   ├── lists/            # CRUD for link lists
│   ├── og/               # Open Graph scraper
│   └── analytics/        # Event tracking
├── app/                  # Authenticated app pages (require auth context)
│   ├── compose/          # Create/edit lists
│   ├── my-links/         # User's lists
│   └── analytics/        # List analytics
└── [...slug]/            # Public list viewer (catch-all)

components/               # Reusable React components (all client-side)
hooks/                    # Custom React hooks (useAuth, useDraft, etc.)
lib/                      # Server utilities (no imports from components/)
├── auth.ts               # JWT creation, token verification
├── cosmos.ts             # Cosmos DB singleton
├── rtdb.ts               # Data access layer (CRUD operations)
├── analytics.ts          # Event tracking and reporting
├── rate-limiter.ts       # Per-IP rate limiting (in-memory)
├── url.ts                # URL validation and normalization
├── slug.ts               # Slug generation and validation
├── og-scraper.ts         # Open Graph metadata fetching (SSRF-protected)
├── env.ts                # Environment validation
└── schemas/
    └── shared.ts         # Zod schemas + sanitization

tests/                    # Vitest test files (mirror lib/ structure)
infra/                    # Azure Bicep deployment templates
```