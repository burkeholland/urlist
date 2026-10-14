# The Urlist

A link-list sharing app. Create curated collections of URLs, give them a custom slug, and share them with anyone.

## Features

- **Create & organize link lists** — add URLs, drag-and-drop to reorder, and auto-fetch Open Graph metadata (titles, descriptions, images)
- **Pin a link** — pin one link to the top of a list to highlight it; pinned links are visually marked in the public view
- **Custom slugs** — publish your list at a memorable URL like `/my-awesome-links`
- **Public link sharing & embeds** - published lists support accessible copy/share controls, QR mode, and a read-only iframe embed (see [Sharing and embedding](#sharing-and-embedding))
- **GitHub authentication** — sign in with GitHub to save and manage your lists
- **Dark mode** — automatic theme detection with manual toggle

## Sharing and embedding

On a published list page (`/{slug}`):

- **Copy URL / Share** copy the collection URL, or open the native share sheet when the browser supports Web Share. Copy tries the Clipboard API first and falls back to `document.execCommand('copy')` if it is missing or rejects. If both fail, a message asks the visitor to copy manually. If the share sheet fails (other than the visitor dismissing it), the link is copied instead.
- **Copy / Share on each link** copy or share that link's destination URL. These buttons are separate from the title link, so they never navigate or count as a link click.
- **Embed tab** shows a live preview and a copy-paste `<iframe>` snippet (plus a small script that resizes the frame to its content, 320 to 880 px). Any visitor to a public list can generate it, because the embed shows exactly what the public page shows.

### Embed behavior

| Topic | Behavior |
| --- | --- |
| URL | `/{slug}?embed=1&theme=system\|light\|dark`. `theme` defaults to `system`. |
| Read-only | No sign-in, navigation, banner, or copy/share buttons. The page does not call `/api/auth/me` and never reads cookies. Links open in a new tab. |
| Frame policy | Only public list pages with `?embed=1` send `Content-Security-Policy: frame-ancestors *`. Every other response, including `/app`, `/api`, the home page, and public pages without `?embed=1`, sends `frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN`. |
| CSP | Embeds also restrict `default-src`, `connect-src`, `frame-src`, `base-uri` to `'self'`/`'none'` and set `form-action 'none'`, `object-src 'none'`. Scripts and styles allow `'unsafe-inline'` because Next.js inlines hydration data. See `next.config.ts`. |
| Other headers | `Referrer-Policy: strict-origin-when-cross-origin` and a restrictive `Permissions-Policy`. |
| Generated iframe | `sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"`, `loading="lazy"`, `referrerpolicy`, and a `title`. The resize script only trusts messages from the embed's own origin and iframe. |
| Search engines | Embed pages are `noindex, nofollow`. |
| Analytics | Page views and link clicks carry a `surface` of `page` or `embed`, and the analytics dashboard shows the split. The preview iframe in the Embed tab (`preview=1`) records nothing, so opening the tab never double counts. Events saved before this existed count as `page`. |

Copy and Web Share need a secure context (HTTPS or `localhost`); on plain HTTP the legacy copy fallback is used and Share is hidden.

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
