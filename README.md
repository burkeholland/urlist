# The Urlist

A link-list sharing app. Create curated collections of URLs, give them a custom slug, and share them with anyone.

## Features

- **Create & organize link lists** — add URLs, drag-and-drop to reorder, and auto-fetch Open Graph metadata (titles, descriptions, images)
- **Custom slugs** — publish your list at a memorable URL like `/my-awesome-links`
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
