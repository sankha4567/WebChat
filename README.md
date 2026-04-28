# WebChat

A real-time, WhatsApp-style web chat application built with **Next.js 16**, **Convex** (realtime backend + DB + file storage), **Clerk** (auth), and **Tailwind CSS v4**. Direct and group conversations, text / image / file / voice messages, 3-state read receipts, voice-heard indicators, reactions with sidebar notifications, multi-admin groups, soft-removal, search, online presence, and more.

---

## Features

### Conversations
- **Direct (1-on-1) chats** with race-safe creation — concurrent calls always converge on a single conversation row (deterministic `directPairKey` + unique index)
- **Group chats** with **multi-admin** support: any admin can promote others, demote (last-admin guarded), remove members, edit name / image
- **Soft-removal**: removed members still see history up to the moment they were removed (including the "X removed you" notice). Composer is replaced with a read-only banner.
- Re-add a previously-removed user → their existing membership is reactivated
- Conversation list deduplication (handles legacy duplicate direct chats by counterparty)

### Messaging
- **Text** with edit / delete-for-me / delete-for-everyone (sender or group admin); rejects edits on already-deleted messages
- **Images** with thumbnail rendering and click-to-open
- **Files** with file icon, name, size, download
- **Voice messages** with:
  - Real-waveform UI (deterministic from URL hash) — played bars stay visible on any bubble color
  - Pause / resume in the recorder via `MediaRecorder.pause()` / `resume()`
  - 1× / 1.5× / 2× playback speed pill
  - Webm duration probe so the playhead scrubs correctly even when MediaRecorder omits duration metadata
  - **Three-state mic + dot indicator**: gray (unheard) → blue (recipient has played, persisted via `voicePlays` table)
- **Reply to any message** — preview shows image thumbnail, file icon, or mic, not just `[image]`. Server validates the reply target belongs to the same conversation.
- **Reactions** (emoji, exact-match indexed) with toggle. New reactions create a hidden "reaction" message that surfaces in the sidebar as `"X reacted ❤️ to: 'preview'"` (WhatsApp-style)
- **Mentions / system messages**: `"You added John"` for the actor, `"Sankha added you"` for the target, `"Sankha added John"` for everyone else. Frozen target-name snapshot so history stays correct after renames.

### Read & heard receipts
- Three-state read ticks computed from each member's `lastReadTime`:
  - 1 gray tick → **sent** (no recipient online)
  - 2 gray ticks → **delivered** (at least one recipient online but not yet read)
  - 2 blue ticks → **read by all recipients**
- Auto-mark-as-read when a new message arrives **and** the user is at the bottom **and** the tab is visible — eliminates the brief sidebar "unread flash" on the active chat
- Voice-played receipts tracked separately from reads (mic flips blue independently of ticks)

### Real-time UX
- **Online presence** with 30s heartbeat (kills stale "online" status if the tab is closed silently)
- **Typing indicator** ("typing...") with 2-second auto-clear
- **Scroll-to-bottom badge** with unread arrival count when the user has scrolled up
- Auto-scroll **only when the user is already at the bottom** (or just sent a message) — never yanks them away from history
- WhatsApp-style absolute timestamps: today → `5:27 PM`, yesterday → `Yesterday`, last week → weekday, older → `MM/DD/YY`

### Profile & user management
- **Clerk-managed identity** (email, password, OAuth) plus app-level `status` field
- **Profile dialog** edits first/last name (via Clerk `user.update`), status (Convex), and avatar (Clerk `setProfileImage`)
- "Profile" custom action wired into the Clerk `UserButton` dropdown
- Click the chat header to open **Group info** (members + admin actions) for groups, or **Contact info** (presence, status, email) for DMs

### Groups
- Members list with admin Crown badges (every admin tagged), online dot, status preview
- "You're the admin" pill so the viewer immediately knows their role
- Sorted: **You → Admins → alphabetical**
- Admin kebab on each row: Make admin / Remove as admin / Remove from group (last-admin demote disabled)
- "Add members" entry from the **chat-header kebab menu** AND inside the Group info dialog
- Triple-dot menu also offers **Group/Contact info** and **Clear chat**

### Search
- **Search messages** uses Convex's `searchIndex` with `filterFields: ["conversationId"]` so results are correctly scoped per-conversation (fixed earlier wrong-page bug)
- **Search users** for new chats / group invites with debounce-friendly behavior

### Reliability & correctness
- **Webhook idempotency** — Clerk retries are de-duped via the `webhookEvents` table (`svix-id` claimed once)
- **Race-safe `addReaction`** via 3-column `by_message_user_emoji` index (no more duplicate toggle rows)
- **Proper Next.js middleware** (`middleware.ts`) — Clerk's `auth.protect()` actually runs (the previous `proxy.ts` filename was a no-op)
- **`CLERK_JWT_ISSUER_DOMAIN` validation** at module load (no more silent `"undefined"` JWT issuer coercion)
- **Cascade-delete** on `deleteMessageForEveryone` — reactions and read receipts go too, no dangling rows
- **No N+1 queries** — `getMessages` uses a per-handler user cache, `getConversations` batches member fetches

### Testing & CI
- **77 Vitest tests** covering pure utilities + the Convex backend (`convex-test` in-memory)
- **GitHub Actions CI** on every push to `main` and every PR: lint → typecheck → test → build, with concurrency cancellation on the same ref

---

## Tech stack

- **Framework:** Next.js 16 (App Router, React 19, React Compiler-ready)
- **Backend & DB:** [Convex](https://convex.dev) — queries, mutations, HTTP actions, file storage, search indexes, in-memory testing
- **Auth:** [Clerk](https://clerk.com) — email + OAuth, webhook-driven user sync
- **Styling:** Tailwind CSS v4 + PostCSS
- **UI:** `clsx`, `tailwind-merge`, `lucide-react`, `sonner`, `date-fns`, `react-dropzone`
- **Testing:** Vitest + `convex-test` (`@edge-runtime/vm`)
- **Language:** TypeScript 5

---

## Project structure

```
web-chat/
├── .github/
│   └── workflows/ci.yml         # Lint / typecheck / test / build on push & PR
├── app/                         # Next App Router
│   ├── (auth)/                  # sign-in / sign-up routes
│   ├── (main)/chat/             # main chat UI (auth-gated)
│   ├── layout.tsx               # root layout (Clerk + Convex providers)
│   └── page.tsx                 # landing
├── components/
│   ├── chat/                    # chat-view, message-bubble, sidebar, voice-recorder
│   │   ├── group-info-dialog.tsx
│   │   ├── user-info-dialog.tsx
│   │   ├── profile-dialog.tsx
│   │   ├── reply-preview-body.tsx
│   │   └── ... (search, new-chat, create-group, file-upload, emoji-picker)
│   └── providers/               # Convex client provider
├── convex/
│   ├── schema.ts                # users / conversations / conversationMembers /
│   │                            # messages / deletedMessages / reactions /
│   │                            # readReceipts / voicePlays / webhookEvents
│   ├── users.ts                 # upsert/delete (webhook), search, profile, presence
│   ├── conversations.ts         # CRUD + multi-admin + soft-removal
│   ├── messages.ts              # send/edit/delete/react/search + voice & system msgs
│   ├── files.ts                 # Convex storage upload URL
│   ├── http.ts                  # Clerk webhook endpoint (/clerk-webhook)
│   ├── webhooks.ts              # claimSvixId (idempotency)
│   ├── utils.ts                 # requireUser, requireMembership, helpers
│   ├── auth.config.ts           # Clerk → Convex JWT config
│   └── *.test.ts                # Vitest integration tests (convex-test)
├── hooks/use-online-status.tsx  # online presence + heartbeat
├── lib/utils.ts                 # cn, formatters, *.test.ts
├── middleware.ts                # Clerk middleware (auth.protect)
├── vitest.config.mts
├── public/                      # static assets
├── .env.example                 # template — copy to .env and fill in
└── package.json
```

---

## Prerequisites

- **Node.js** 20 LTS or newer
- **npm** (scripts assume npm, but pnpm/yarn work)
- A free **[Convex](https://convex.dev)** account
- A free **[Clerk](https://clerk.com)** account
- Git

---

## Setup — step by step

### 1. Clone & install

```bash
git clone https://github.com/sankha4567/WebChat.git
cd WebChat
npm install
```

### 2. Create a Clerk application

1. Go to [dashboard.clerk.com](https://dashboard.clerk.com) → **Create application**.
2. Enable the sign-in methods you want (email + Google recommended).
3. From the application's **API Keys** page, copy:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (starts with `pk_test_...`)
   - `CLERK_SECRET_KEY` (starts with `sk_test_...`)

### 3. Create the Clerk "convex" JWT template

Convex uses a Clerk-issued JWT to authenticate users.

1. In Clerk → **JWT Templates** → **New template** → choose **Convex** (or **Blank** named `convex`).
2. **Template name must be `convex`** — referenced in `convex/auth.config.ts`.
3. Save. Copy the **Issuer** URL (looks like `https://<your-app>.clerk.accounts.dev`) — that's `CLERK_JWT_ISSUER_DOMAIN`.

### 4. Create `.env`

```bash
cp .env.example .env
```

Fill in the Clerk values. Leave `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL` blank — the next step writes them.

### 5. Initialize Convex

```bash
npx convex dev
```

On first run it will:

- Prompt you to log in to Convex
- Ask you to create or select a project (e.g. `webchat`)
- Write `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL` to `.env` automatically
- Push the schema in `convex/` to the cloud
- Keep watching for changes — **leave this terminal open while developing**

### 6. Wire Clerk → Convex (JWT issuer)

Set the env var on your Convex deployment so the backend can verify Clerk JWTs:

```bash
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-app>.clerk.accounts.dev
```

### 7. Wire Clerk → Convex (webhook for user sync)

When a user signs up in Clerk, a webhook fires `/clerk-webhook` on your Convex deployment, which upserts the user into the `users` table.

1. Your webhook URL is your Convex URL with the `.site` TLD (not `.cloud`) plus the path:

   ```
   https://<your-deployment>.convex.site/clerk-webhook
   ```

2. In Clerk → **Webhooks** → **Add endpoint** → paste that URL.
3. Subscribe to: `user.created`, `user.updated`, `user.deleted`.
4. Copy the **Signing Secret** (starts with `whsec_...`).
5. Set it on Convex:

   ```bash
   npx convex env set CLERK_WEBHOOK_SECRET whsec_xxxxxxxxxxxx
   ```

   Also paste it into your local `.env` as `CLERK_WEBHOOK_SECRET` for reference.

### 8. Run the dev server

Open a **second terminal** (keep `npx convex dev` running in the first):

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000). Sign up — Clerk redirects to `/chat`, the webhook syncs your user into Convex, and you can start chatting.

---

## NPM scripts

| Command                | What it does                                              |
| ---------------------- | --------------------------------------------------------- |
| `npm run dev`          | Start Next.js dev server on port 3000                     |
| `npm run build`        | Production build                                          |
| `npm run start`        | Run the production build                                  |
| `npm run lint`         | Run ESLint                                                |
| `npm run typecheck`    | Run `tsc --noEmit`                                        |
| `npm test`             | Run the full Vitest suite (one-shot)                      |
| `npm run test:watch`   | Vitest in watch mode                                      |
| `npm run test:ui`      | Vitest UI (browser dashboard)                             |
| `npm run test:coverage`| Vitest with V8 coverage report                            |
| `npx convex dev`       | Watch & deploy Convex functions to dev cloud              |
| `npx convex deploy`    | Deploy Convex to production                               |

---

## Testing

77 tests across 6 files, runnable in ~3 seconds:

- **Pure utilities** (Node env): `lib/utils.test.ts`, `convex/utils.test.ts`
- **Convex backend** (edge-runtime via `convex-test`): `users`, `conversations`, `messages`, `webhooks` test files

```bash
npm test
```

`vitest.config.mts` uses Vitest 4's `projects` API to split environments — Convex code runs under `edge-runtime` (matching Convex's runtime), pure utilities run under `node`.

What's covered:

- All formatter helpers, with frozen system time for deterministic timestamp assertions
- `directPairKey` commutativity, `userDisplayName` precedence, `getGroupAdminIds` legacy fallback
- User upsert insert/update, current-user identity branches, search self-filtering, online-status no-op regression
- Direct-chat idempotency + self-chat rejection
- `createGroup` populates `adminIds` + system message
- `addGroupMember` handles soft-removed reactivation; throws on active duplicates
- `removeGroupMember` soft-removes (sets `leftAt`), rejects last-admin self-leave, cascades admin demotion
- `promoteToAdmin` idempotency, `demoteFromAdmin` last-admin guard
- `sendMessage` rejects when `leftAt` is set or when `replyToId` is cross-conversation
- `getMessages` caps at `leftAt` for removed users
- `addReaction` toggle creates the hidden reaction message for sidebar previews
- `markVoiceAsPlayed` is a no-op for senders, idempotent for recipients
- `clearConversationForMe` is idempotent
- `deleteMessageForEveryone` admin override + cascade
- `claimSvixId` first-vs-retry semantics

---

## CI / CD

`.github/workflows/ci.yml` triggers on:

- every push to `main`
- every pull request

Steps run on `ubuntu-latest`, Node 20, with npm cache:

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm test`
5. `npm run build` (with safe placeholder env vars; replace via repo secrets if you ever want production-build verification in CI)

In-flight runs on the same ref are cancelled (`concurrency: cancel-in-progress`) so PR pushes don't pile up.

---

## Environment variables reference

| Variable                              | Source                                       | Required |
| ------------------------------------- | -------------------------------------------- | -------- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`   | Clerk Dashboard → API Keys                   | yes      |
| `CLERK_SECRET_KEY`                    | Clerk Dashboard → API Keys                   | yes      |
| `CLERK_JWT_ISSUER_DOMAIN`             | Clerk JWT template (`convex`) → Issuer       | yes      |
| `CLERK_WEBHOOK_SECRET`                | Clerk Webhook endpoint → Signing Secret      | yes      |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL`       | Route — default `/sign-in`                   | yes      |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL`       | Route — default `/sign-up`                   | yes      |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | Post-login redirect — default `/chat`        | yes      |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | Post-signup redirect — default `/chat`       | yes      |
| `CONVEX_DEPLOYMENT`                   | Written by `npx convex dev`                  | yes      |
| `NEXT_PUBLIC_CONVEX_URL`              | Written by `npx convex dev`                  | yes      |

Convex-side env vars (set via `npx convex env set ...`, **not** in `.env`):

- `CLERK_JWT_ISSUER_DOMAIN`
- `CLERK_WEBHOOK_SECRET`

---

## Deploying to production

1. **Convex:** `npx convex deploy` — creates a prod deployment. Set the same env vars (`CLERK_JWT_ISSUER_DOMAIN`, `CLERK_WEBHOOK_SECRET`) on the prod deployment.
2. **Clerk:** switch to production keys; add a production webhook endpoint pointing at the prod Convex `.site` URL.
3. **Vercel** (recommended for Next.js):
   - Import the GitHub repo
   - Add all env vars from `.env.example` (using prod values)
   - Use `CONVEX_DEPLOY_KEY` from the Convex dashboard if you want Convex to deploy in the Vercel build (see [Convex + Vercel docs](https://docs.convex.dev/production/hosting/vercel))
   - Deploy

---

## Architecture notes

A few non-obvious design choices worth knowing about:

- **Direct-chat idempotency**: `getOrCreateDirectConversation` first looks up an existing row by deterministic `directPairKey` (sorted `userIdA:userIdB`). On miss it falls back to membership-pair lookup and **backfills** `directPairKey` on the matched row, so legacy data heals on access.
- **Soft-removal**: `removeGroupMember` patches `conversationMembers.leftAt = now` instead of deleting, so the removed user can still view history up to that timestamp (including the "X removed you" notice). `getMessages` caps at `leftAt` for soft-removed users; `sendMessage` rejects.
- **System messages are structured**: `systemAction` + `systemTargetId` + `systemTargetName` lets the client render `"You added John"` for the actor and `"Sankha added John"` for everyone else, derived per viewer at render time.
- **Voice "heard" tracking** is intentionally separate from read receipts. `voicePlays(messageId, userId)` is inserted on first play by a non-sender; the mic + dot color reflect this independently of the 3-state ticks.
- **Webhook idempotency**: `claimSvixId` inserts the `svix-id` and Convex's serializable transactions handle the race — retries see the row and the handler returns `200 OK (replay)`.

---

## Troubleshooting

- **"Unauthenticated" errors in Convex queries** → the Clerk JWT template isn't named `convex`, or `CLERK_JWT_ISSUER_DOMAIN` is unset on the Convex deployment.
- **New Clerk users don't appear in the app** → the webhook endpoint is missing, the URL uses `.cloud` instead of `.site`, or `CLERK_WEBHOOK_SECRET` is wrong on Convex. Check Clerk's webhook logs for delivery failures.
- **`NEXT_PUBLIC_CONVEX_URL is not defined`** → run `npx convex dev` once so it writes the var to `.env`.
- **Voice messages show `0:00` even when they're longer** → confirm `npx convex dev` is running and has pushed the latest schema; the player auto-probes duration via the webm seek workaround on first metadata-load.
- **Port 3000 in use** → `npm run dev -- -p 3001`.

---

## License

Private project — all rights reserved unless a license file is added.
