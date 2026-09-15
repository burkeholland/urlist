# The Urlist

A link-list sharing app. Create curated collections of URLs, give them a custom slug, and share them with anyone.

## Features

- **Create & organize link lists** — add URLs, drag-and-drop to reorder, and auto-fetch Open Graph metadata (titles, descriptions, images)
- **Pin a link** — pin one link to the top of a list to highlight it; pinned links are visually marked in the public view
- **Monitor link health** — owners can manually recheck links, see healthy/redirected/possibly broken/broken states, dismiss false positives, and refresh preview metadata without silently changing destination URLs or owner-edited text
- **Custom slugs** — publish your list at a memorable URL like `/my-awesome-links`
- **Public link sharing** — published URL cards include one-click copy buttons for individual links
- **GitHub authentication** — sign in with GitHub to save and manage your lists
- **Dark mode** — automatic theme detection with manual toggle

## Tech Stack

- **Framework:** [Next.js 16](https://nextjs.org) (App Router)
- **Database:** [Azure Cosmos DB](https://learn.microsoft.com/azure/cosmos-db/)
- **Auth:** GitHub OAuth with JWT sessions ([jose](https://github.com/panva/jose))
- **Styling:** [Tailwind CSS 4](https://tailwindcss.com)
- **Drag & Drop:** [@dnd-kit](https://dndkit.com)
- **Validation:** [Zod](https://zod.dev)
- **Testing:** [Vitest](https://vitest.dev)

## Getting Started

### Prerequisites

- Node.js 20+
- An [Azure Cosmos DB](https://learn.microsoft.com/azure/cosmos-db/nosql/quickstart-portal) account
- A [GitHub OAuth App](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app) (callback URL: `http://localhost:3000/api/auth/callback`)

### Setup

```bash
# Install dependencies
npm install

# Copy and fill in environment variables
cp .env.example .env.local
# Edit .env.local with your Cosmos DB, auth, and GitHub credentials

# Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm test` | Run tests |
| `npm run test:watch` | Run tests in watch mode |

Pull requests automatically run the test suite through GitHub Actions.

### Link health checks

Link checks use the same SSRF-safe fetch path as preview metadata refreshes and validate every redirect hop before making the next request. Results are stored on each link as health status, reason, last checked time, HTTP status, final URL, retry count, next-check time, and metadata refresh status.

This repository does not currently include durable scheduler infrastructure. Until one is added, owners can run checks explicitly from **My lists** or a scheduler can call the bounded authenticated `POST /api/link-health` job for an owner session. The job caps each run to 50 links, skips links that are not due unless requested, deduplicates identical destination URLs, and never rewrites a saved link URL automatically.

## Project Structure

```
app/                  # Next.js App Router pages & API routes
├── api/              # REST API (auth, lists, og, slugs, analytics)
├── app/              # Authenticated app pages (compose, my-links)
└── [...slug]/        # Public list viewer (catch-all route)
components/           # React components
hooks/                # Custom React hooks
lib/                  # Server utilities (auth, db, rate limiting, etc.)
tests/                # Vitest test suites
infra/                # Azure Bicep deployment templates
```

## Deployment

Azure infrastructure templates are in `infra/`. A Dockerfile is included for containerized deployments.

## License

MIT
