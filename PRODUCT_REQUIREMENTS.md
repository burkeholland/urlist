# Urlist Product Requirements Document

## 1. Product Overview

Urlist is a web application for creating, publishing, sharing, and analyzing curated collections of links. A user can start with a single URL, build a list with rich link previews, choose a custom public URL, reorder and pin links, publish the collection, and share it as either a normal web page or QR code.

The product must support both no-sign-up publishing and authenticated list management. Anonymous users can create and publish shareable lists. Signed-in users can additionally view, edit, delete, and analyze their own lists.

## 2. Goals

- Let users quickly create a polished public link collection from one or more URLs.
- Let users customize the share URL and short description for a list.
- Generate rich previews for links whenever possible.
- Make published lists easy to consume, share, and scan on desktop and mobile.
- Let signed-in users manage their existing lists.
- Provide analytics for list views, visitors, referrers, locations, click-through rate, and per-link clicks.
- Keep invalid, unsafe, or abusive inputs from creating broken or unsafe experiences.

## 3. Primary User Types

### Anonymous visitor

- Can browse public lists.
- Can create and publish a list without signing in.
- Can sign in with GitHub.
- Cannot access personal list management or analytics.

### Signed-in user

- Can do everything an anonymous visitor can do.
- Can access personal navigation for My lists and Analytics.
- Can edit and delete owned lists.
- Can view aggregate analytics across owned lists.
- Can view per-list analytics for owned lists.

### Public list viewer

- Can open a public list by slug.
- Can click list links.
- Can switch between list view and QR view.
- Does not need an account.

## 4. Global Experience Requirements

- The application must use the title "urlist — shareable link collections" and describe itself as a way to create curated link collections with rich previews, custom URLs, and drag-to-reorder.
- The application must support light, dark, and system theme modes.
- Theme selection must persist across visits.
- System theme mode must follow the user's operating system preference.
- The primary navigation must always show the Urlist brand, Compose, and theme controls.
- Signed-out users must see a Sign in action.
- Signed-in users must see their avatar/username and a menu containing account-related actions.
- Signed-in users must see navigation links for My lists and Analytics.
- Menus and modals must close when the user clicks outside them.
- Loading, empty, error, and disabled states must be visible and understandable.
- The interface must be responsive for mobile and desktop layouts.
- Form validation messages must be shown inline near the relevant field.
- Non-field errors, such as publish, save, delete, analytics, or authentication failures, must be shown in the relevant page or modal context.
- Validation errors should clear when the user edits the affected input.
- Repeated validation failures should provide visible feedback without relying only on text.
- Authentication loading must not leave the interface stuck indefinitely; if the session cannot be determined, the user should be treated as signed out.

## 5. Authentication Requirements

### 5.1 GitHub sign-in

- Users must be able to sign in using GitHub.
- Sign-in must request only basic GitHub profile access needed to identify the user.
- Sign-in must protect users from forged or stale authentication callbacks.
- Authentication callback state must expire after a short time.
- Successful sign-in must return the user to the compose experience.
- The signed-in user profile must include:
  - Stable user ID
  - GitHub username
  - Display name, falling back to username when unavailable
  - GitHub avatar
- Sessions must remain active for 7 days.
- Users must be able to sign out.
- Signing out must immediately remove access to authenticated areas.

### 5.2 Authentication modal and errors

- Signed-out users can open a sign-in modal.
- The modal must include a GitHub sign-in action.
- The modal must close via backdrop click or Cancel/close behavior.
- If authentication is unavailable or fails, the user must be returned to a safe public page with an understandable error state.
- Authentication failure states must distinguish missing callback data, invalid callback state, token exchange failure, and profile retrieval failure.

### 5.3 Protected areas

- My lists, edit list, global analytics, and per-list analytics require sign-in.
- Signed-out users attempting to access protected areas must be redirected away from those areas to a safe public page.
- A signed-in user must not be able to edit, delete, or view analytics for a list they do not own.

## 6. Landing Page Requirements

- The home page must communicate the core value: "Group, save and share links with the world."
- It must explain that users can create curated link collections with rich previews, custom URLs, and drag-to-reorder.
- It must state that no sign-up is needed to start.
- It must show a representative preview of a published list, including:
  - A sample slug
  - Link count and published timing copy
  - Multiple sample link rows with title and domain
- It must provide a prominent "Add your first link" URL input.
- The "Add your first link" URL input should be focused when the home page opens.
- When a user submits a valid URL from the home page, the app must take them to compose with that URL already added.
- Invalid URL submissions must keep the user on the home page and show an inline validation error.

## 7. Compose New List Requirements

### 7.1 Starting a list

- Users can open the compose page directly.
- Users can arrive at compose with an initial URL from the home page.
- If an initial URL is provided, the compose page must add it once and then remove the URL from the address so refreshes do not duplicate it.
- Compose must show a loading skeleton while locally saved draft data is being restored.

### 7.2 Draft persistence

- Compose state must auto-save locally after brief inactivity.
- Drafts must survive refreshes and later visits.
- Drafts must include:
  - Slug
  - Description
  - Links
  - Link order
  - Link pin state
  - Edited link titles and descriptions
  - Removed links
- Transient link-preview loading state must not be persisted.
- Drafts older than 30 days must be discarded.
- Drafts for editing a specific list must be separate from drafts for new lists and other lists.
- Publishing or successfully saving must clear the relevant draft.

### 7.3 Slug entry

- Users can optionally choose a custom slug for the public URL.
- The slug field must visually prefix the user input with `urlist.app/`.
- Slug input must be forced to lowercase.
- Empty slug is allowed while composing; if the user publishes with no slug, a unique slug must be generated automatically.
- Slug availability must be checked after the user pauses typing.
- Slug status must visibly support:
  - Idle
  - Checking
  - Available
  - Invalid
  - Taken
- Invalid, taken, or unavailable slug states must disable publishing.
- Slug check failures must show an inline error.

### 7.4 Slug validation

- Custom slugs must be 200 characters or fewer.
- Custom slugs may contain lowercase URL-safe characters, hyphens, underscores, and single path separators.
- Nested slugs may contain reserved path words in non-first segments.
- Custom slugs must not start with a slash.
- Custom slugs must not end with a slash.
- Custom slugs must not contain double slashes.
- Custom slugs must not collide with reserved application paths.
- Reserved top-level paths include:
  - `app`
  - `api`
  - `_next`
- Reserved exact paths include:
  - `favicon.ico`
  - `robots.txt`
  - `sitemap.xml`
- Slug collisions must be prevented. If a slug is already in use, publishing must fail with a clear "slug taken" message.

### 7.5 Description

- Users can add a list description.
- Description input must be limited to 280 characters.
- The UI must show a character count in the format current/280.
- Over-length descriptions must not be accepted.

### 7.6 Adding links

- Users can add links by pasting or typing a URL.
- URL input must accept bare domains by normalizing them to secure web URLs.
- Only HTTP and HTTPS URLs are allowed.
- Empty URLs are invalid.
- URLs longer than 2048 characters are invalid.
- Dangerous or unsupported schemes must be rejected, including:
  - `javascript:`
  - `data:`
  - `file:`
  - `mailto:`
  - `ftp:`
  - `blob:`
- Invalid URLs must show inline errors and must not be added.
- After a successful add, the URL field must clear and refocus.
- The add button must be disabled while empty or loading.

### 7.7 Link preview metadata

- When a link is added, the app must attempt to fetch preview metadata.
- While metadata is loading, the link card must show a visible loading indicator.
- Preview metadata may include:
  - Title
  - Description
  - Image
  - Site name
- Preview metadata is best effort. Failure to fetch metadata must not prevent the link from being added.
- Metadata text must be cleaned before display.
- Metadata titles must be capped at 200 characters.
- Metadata descriptions must be capped at 500 characters.
- Metadata site names must be capped at 100 characters.
- Preview images must be valid HTTP or HTTPS URLs.
- Unsafe private or internal network targets must not be fetched for preview metadata.

### 7.8 Link list editing

- Compose must show an empty state when there are no links: users should be prompted to paste a URL to get started.
- Each link card in editable mode must show:
  - Preview image, or a placeholder when unavailable
  - Title or URL fallback
  - Domain
  - Description when available
  - Pin control
  - Remove control
  - Drag/reorder affordance
- Users must be able to edit link title and description inline.
- Inline editing behavior must include:
  - Click to edit
  - Enter to save
  - Escape to cancel
  - Blur to save
- If no description exists, editable cards must prompt with "Add a description..."
- Users must be able to remove links.
- Users must be able to pin or unpin links.
- Pinned links must be visually distinguished.
- Only one link may be pinned in a list at a time.
- Pinning a link must unpin any previously pinned link.
- Users must be able to reorder links by drag and drop.
- Keyboard-accessible reordering must be supported.
- The list must show the current link count.

### 7.9 Publish behavior

- A list must contain at least one link before it can be published.
- A list must contain no more than 500 links.
- Publishing must be disabled while:
  - There are no links
  - The slug is invalid
  - The slug is taken
  - The slug is still being checked
  - A publish request is already in progress
- During publishing, the button must show a "Publishing..." state and prevent double submission.
- If publishing succeeds:
  - The draft must be cleared.
  - The user must be sent to the public list URL.
  - A published confirmation banner must be shown.
- If publishing fails, the compose page must show a clear error message and preserve the user's work.
- If the user does not choose a custom slug, the app must generate a unique public slug.
- Automatic slug generation must retry when it collides with an existing slug.
- If automatic slug generation cannot produce a unique slug, the user must be told to try again.

## 8. Public List Requirements

### 8.1 Public URL and slug resolution

- Published lists must be available at `/{slug}`.
- Slugs may include nested path segments when valid.
- Unknown or deleted slugs must show a list-specific "List not found" page.
- The list-specific not-found page must include a call to create a list.
- Public list pages must not require sign-in.
- Public list pages must be dynamically up to date.

### 8.2 Public list metadata

- Public list pages must expose page metadata suitable for previews.
- The page title must include the slug and Urlist branding.
- The page description must use the list description when available.
- If no description exists, the page description must summarize the number of links.

### 8.3 Public list layout

- Public list pages must show:
  - Navigation header
  - Slug as the list title
  - Optional description
  - Link count
  - View mode toggle
  - Link list or QR view
- If the user just published the list, a confirmation banner must show the published URL.
- The published banner must auto-dismiss after 30 seconds.

### 8.4 Public link list view

- Public list view must display all links.
- Pinned links must sort ahead of unpinned links.
- Public link cards must show:
  - Preview image, or a placeholder
  - Title
  - Domain
  - Description when available
  - Pinned visual state when applicable
- Clicking a public link must open the destination in a new tab.
- Public link sharing should support copying or sharing individual link destinations from the published list experience.
- Link clicks must be recorded for analytics.

### 8.5 QR view

- Public lists must support a QR view.
- The QR code must encode the absolute public list URL.
- QR view must show:
  - QR code
  - Instructional text telling users to scan with a phone camera
  - The public URL in text
- QR view must show a loading placeholder until the full public URL is available.

## 9. My Lists Requirements

- My lists requires sign-in.
- While authentication or list loading is in progress, the page must show skeleton placeholders.
- The page must show a "My lists" heading.
- The page must display lists in a responsive tile grid.
- The first tile must create a new list.
- Each list tile must show:
  - Slug
  - Description when present
  - View count
  - Click count
  - Link count
  - Public URL action
  - Analytics action
  - Delete action
- Clicking a list tile must open the edit-list experience.
- Pressing Enter on a focused list tile must open the edit-list experience.
- The public URL action must open the public list in a new tab.
- The analytics action must open per-list analytics.
- The delete action must not trigger tile navigation.
- Deleting a list must require confirmation.
- The delete confirmation must show the slug, warn that deletion cannot be undone, and include Delete and Cancel actions.
- The delete confirmation must close via backdrop click or Cancel behavior.
- After successful deletion, the list must be removed from My lists.
- Failed deletion must show an error.

## 10. Edit Existing List Requirements

- Edit list requires sign-in.
- Users may only edit lists they own.
- The edit page must show loading skeletons while authentication, draft restoration, or list loading is in progress.
- The edit page must show:
  - "Edit list" heading
  - Existing slug as read-only context
  - Description editor
  - Add links input
  - Editable sortable link list
  - Save action
  - Link count
- Users must not be able to edit the slug from the edit page.
- The existing list must populate the edit draft when no local edit draft exists.
- If a local edit draft exists, it must preserve the user's unsaved changes instead of overwriting them.
- Users can change description, add links, edit link metadata, pin links, remove links, and reorder links.
- Saving must be disabled when there are no links or while a save is in progress.
- During save, the save button must show "Saving..."
- If the list cannot be found, the page must show "List not found."
- Saving must include conflict detection so stale edits do not overwrite a newer version of the list.
- If conflict detection data is missing, saving must fail with an understandable error.
- If saving succeeds:
  - The edit draft must be cleared.
  - The user must be sent to the public list page.
- If saving fails, the page must show a clear error and preserve unsaved work.
- If the list changed after the user loaded it, saving must fail with a conflict message telling the user to re-fetch and retry.

## 11. Analytics Requirements

### 11.1 Event collection

- Public list page views must be recorded automatically when a public list opens.
- Public link clicks must be recorded when a user clicks a public link.
- Page view events may include:
  - Referrer
  - UTM source
  - UTM medium
  - UTM campaign
  - Country when available
- Link click events may include:
  - Link ID
  - Referrer
- Analytics collection must not interrupt public browsing if recording fails.
- Analytics recording must reject invalid event types.
- Link click events must require a link ID.
- Analytics should identify unique visitors with a deterministic browser/IP fingerprint without exposing raw visitor identity in reports.

### 11.2 Global analytics

- Global analytics requires sign-in.
- It must aggregate across all lists owned by the signed-in user.
- Users must be able to choose 7-day, 30-day, and 90-day ranges.
- The default range must be 30 days.
- The page must show loading skeletons while data is loading.
- The page must show an error state if analytics cannot load.
- Overview cards must show:
  - Total Views
  - Unique Visitors
  - Link Clicks
  - CTR
- The page must show a views-over-time chart.
- If there are no views in the selected period, the chart area must show "No views in this period."
- The page must show a Top Lists table with:
  - List slug
  - Description when present
  - Views
  - Visitors
  - Clicks
- If there is no list activity, Top Lists must show an empty state.
- Top list rows must link to the corresponding per-list analytics page.

### 11.3 Per-list analytics

- Per-list analytics requires sign-in.
- Users may only view analytics for lists they own.
- Users must be able to choose 7-day, 30-day, and 90-day ranges.
- The default range must be 30 days.
- The page must include a breadcrumb back to My lists.
- The page must show loading skeletons while data is loading.
- The page must show an error state if analytics cannot load.
- Overview cards must show:
  - Total Views
  - Unique Visitors
  - Link Clicks
  - CTR
- The page must show a views-over-time chart.
- The page must show Top Referrers with source and view count.
- The page must show Locations with country and view count.
- The page must show Link Clicks with link title or URL and click count.
- Empty analytics sections must show section-specific empty states:
  - No views in this period.
  - No referrer data.
  - No location data.
  - No clicks recorded.

### 11.4 Analytics calculations

- Views and clicks must be counted separately.
- Unique visitors must count distinct visitors per reporting bucket.
- CTR must represent link clicks divided by views.
- Views-over-time must be grouped by day.
- Referrers must be normalized into understandable sources, with direct or unknown traffic grouped appropriately.
- Top lists must rank by views.
- Per-link click totals must be grouped by link.
- Large analytics numbers should be displayed in compact, human-readable form when appropriate.

## 12. Validation, Limits, and Abuse Prevention Requirements

- Publishing must be rate limited.
- Authenticated users may have higher publish limits than anonymous users.
- Slug availability checks must be rate limited.
- Link preview metadata fetching must be rate limited.
- Analytics event recording must be rate limited.
- Rate-limit failures must tell users to try again later and should provide retry timing when available.
- Anonymous and authenticated publish limits must be enforced separately.
- Rate-limited API responses must indicate that the user should retry later.
- Invalid request bodies must return understandable errors.
- Missing authentication must return a sign-in-required error for authenticated operations.
- Ownership violations must return a forbidden error.
- Missing lists must return a not-found error.
- Invalid slug formats must return an invalid-slug-format error.
- Slug conflicts must return a slug-taken error.
- Automatic slug generation failure must return a slug-generation-failed error.
- Publishing without links must return a no-links error.
- Publishing too many links must return a too-many-links error.
- Invalid URLs must return an invalid-URL error.
- Over-length descriptions must return a description-too-long error.
- Edit requests missing conflict detection data must return a missing-updated-at error.
- Stale edit requests must return a conflict error.

## 13. Error and Empty State Requirements

- Unknown application pages must show a generic "Page not found" state with a Go home action.
- Unknown public list slugs must show "List not found" with copy explaining that the list does not exist or may have been deleted and a Create a list action.
- Unexpected application errors must show "Something went wrong," explain that an unexpected error occurred, and offer a Try again action.
- Compose must preserve user work after publish failures.
- Edit must preserve user work after save failures.
- Analytics failures must show a readable error inside the page instead of a blank page.
- Empty link lists must prompt users to paste a URL.
- Empty analytics sections must show contextual empty messages.

## 14. Accessibility and Interaction Requirements

- Interactive tiles must be keyboard-accessible.
- Drag-and-drop link ordering must support keyboard interaction.
- Drag handles must have accessible labels.
- Toggle controls must expose selected/pressed state.
- Pin controls must expose selected/pressed state.
- Validation messages must be associated with their inputs for assistive technologies.
- QR codes must include descriptive labeling.
- Links that open external destinations must open safely in a new tab.
- Motion-based validation feedback must respect reduced-motion preferences.

## 15. Data and Content Requirements

### 15.1 List

Each list must have:

- Stable list ID
- Public slug
- Optional description
- Owner identity when created by a signed-in user
- Created timestamp
- Updated timestamp
- One or more links

### 15.2 Link

Each link must have:

- Stable link ID
- Destination URL
- Position/order
- Pinned state
- Optional preview title
- Optional preview description
- Optional preview image
- Optional site name
- Created timestamp

### 15.3 Analytics

Analytics must support:

- Page view events
- Link click events
- Visitor uniqueness
- Referrer reporting
- UTM attribution fields
- Country/location grouping when available
- Daily reporting buckets
- Per-list and global aggregation

## 16. Non-Functional Product Requirements

- Public browsing must remain fast and must not depend on analytics success.
- Link preview failures must not block list creation.
- Link preview requests must time out quickly enough that slow external pages do not block editing.
- Publishing must avoid duplicate public slugs.
- Deleting a list must remove it from the user's management view and make the public slug unavailable.
- Deleting a list must also remove its links and ownership association from the management experience.
- The app must expose a simple health status showing that it is running, including an OK status, timestamp, and version.
- The app must run in production with required configuration for authentication, data storage, and session signing.
- Operational failures related to publishing, deletion, analytics, and preview fetching should be observable by maintainers.
- Production deployment must support HTTPS public ingress, required secret configuration, and operational logging.

## 17. Acceptance Criteria

- A user can paste a URL on the home page, continue to compose, add more links, choose a valid custom slug, publish, and land on the public list page.
- A user can publish without signing in.
- A signed-in user can create a list, find it in My lists, open it for editing, change its contents, save it, and view the updated public page.
- A signed-in user can delete an owned list only after confirming the destructive action.
- A public viewer can open a list, view its links, switch to QR view, and click links.
- Public link clicks and page views appear in per-list analytics.
- Global analytics aggregates activity across the signed-in user's lists.
- Invalid URLs, invalid slugs, taken slugs, empty lists, too many links, and over-length descriptions are rejected with clear messages.
- Unknown pages and unknown public slugs show appropriate not-found experiences.
- Theme selection persists and supports light, dark, and system modes.
- Draft work survives refresh and is cleared after successful publish or save.

## 18. Scanned Source Coverage

This PRD was derived from the tracked project files, including:

- Application pages and route handlers under `app/`
- UI components under `components/`
- Client hooks under `hooks/`
- Product/business rules under `lib/`
- Behavior tests under `tests/`
- Project documentation and deployment/configuration files at the repository root and under `infra/`
- Static binary assets were noted as non-functional and not translated into product behavior.
