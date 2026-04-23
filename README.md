# WebChat

A real-time web chat application built with **Next.js 16**, **Convex** (realtime backend + database + file storage), **Clerk** (authentication), and **Tailwind CSS v4**. Supports direct and group conversations, text / image / file / voice messages, reactions, read receipts, typing indicators, search, and online presence.

---

## Tech stack

- **Framework:** Next.js 16 (App Router, React 19, React Compiler)
- **Backend & DB:** [Convex](https://convex.dev) — queries, mutations, HTTP actions, file storage, search indexes
- **Auth:** [Clerk](https://clerk.com) — email, OAuth, webhook-driven user sync to Convex
- **Styling:** Tailwind CSS v4 + PostCSS
- **UI utilities:** `clsx`, `tailwind-merge`, `lucide-react`, `sonner`, `date-fns`, `react-dropzone`
- **Language:** TypeScript

## Project structure

```
web-chat/
├── app/                    # Next.js App Router
│   ├── (auth)/             # sign-in / sign-up routes
│   ├── (main)/chat/        # main chat UI (protected)
│   ├── layout.tsx          # root layout (Clerk + Convex providers)
│   └── page.tsx            # landing
├── components/
│   ├── chat/               # sidebar, chat view, message bubble, dialogs, etc.
│   └── providers/          # Convex client provider
├── convex/
│   ├── schema.ts           # users, conversations, messages, reactions, receipts
│   ├── users.ts            # upsert/delete user mutations (called by webhook)
│   ├── conversations.ts    # conversation queries/mutations
│   ├── messages.ts         # message queries/mutations (incl. search)
│   ├── files.ts            # file upload via Convex storage
│   ├── http.ts             # Clerk webhook endpoint (/clerk-webhook)
│   └── auth.config.ts      # Clerk → Convex JWT config
├── hooks/                  # custom React hooks (e.g. online-status)
├── lib/utils.ts            # cn() helper
├── public/                 # static assets
├── .env.example            # template — copy to .env and fill in
└── package.json
```

---

## Prerequisites

- **Node.js** 20 LTS or newer
- **npm** (comes with Node) — or pnpm/yarn if you prefer, but scripts below use npm
- A free **[Convex](https://convex.dev)** account
- A free **[Clerk](https://clerk.com)** account
- Git

---

## Setup — step by step

### 1. Clone the repository

```bash
git clone https://github.com/sankha4567/WebChat.git
cd WebChat
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create a Clerk application

1. Go to [dashboard.clerk.com](https://dashboard.clerk.com) → **Create application**.
2. Enable the sign-in methods you want (email + Google recommended).
3. From the application's **API Keys** page, copy:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (starts with `pk_test_...`)
   - `CLERK_SECRET_KEY` (starts with `sk_test_...`)

### 4. Create a Clerk "convex" JWT template

Convex uses a Clerk-issued JWT to authenticate users.

1. In Clerk → **JWT Templates** → **New template** → choose **Convex** (or **Blank** and name it `convex`).
2. The template name **must be `convex`** — it is referenced in `convex/auth.config.ts`.
3. Save. Copy the **Issuer** URL (looks like `https://<your-app>.clerk.accounts.dev`) — that goes into `CLERK_JWT_ISSUER_DOMAIN`.

### 5. Create the `.env` file

```bash
cp .env.example .env
```

Fill in the Clerk values you gathered above. Leave `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL` blank for now — the next step fills them in.

### 6. Initialize Convex

```bash
npx convex dev
```

On first run it will:
- Prompt you to log in to Convex
- Ask you to create or select a project (pick a name like `webchat`)
- Write `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL` to `.env` automatically
- Push the schema in `convex/` to the Convex cloud
- Keep running to watch for changes — **leave this terminal open while developing**

### 7. Wire Clerk → Convex (JWT issuer)

In the Convex **Dashboard** (or via CLI) set the environment variable so the backend can verify Clerk-issued JWTs:

```bash
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-app>.clerk.accounts.dev
```

### 8. Wire Clerk → Convex (webhook for user sync)

When a user signs up in Clerk, a webhook fires `/clerk-webhook` on your Convex deployment, which upserts the user into the `users` table.

1. Your webhook URL is your Convex URL with the `.site` TLD (not `.cloud`) plus the path `/clerk-webhook`:
   ```
   https://<your-deployment>.convex.site/clerk-webhook
   ```
2. In Clerk → **Webhooks** → **Add endpoint** → paste that URL.
3. Subscribe to the events: `user.created`, `user.updated`, `user.deleted`.
4. Copy the webhook's **Signing Secret** (starts with `whsec_...`).
5. Set it on Convex so the handler can verify incoming payloads:
   ```bash
   npx convex env set CLERK_WEBHOOK_SECRET whsec_xxxxxxxxxxxx
   ```
   Also paste it into your local `.env` as `CLERK_WEBHOOK_SECRET` for reference.

### 9. Run the Next.js dev server

Open a **second terminal** (keep `npx convex dev` running in the first):

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000). Sign up — Clerk will redirect to `/chat` and the webhook will sync your user into Convex.

---

## NPM scripts

| Command         | What it does                                    |
|-----------------|-------------------------------------------------|
| `npm run dev`   | Start Next.js dev server on port 3000           |
| `npm run build` | Production build                                |
| `npm run start` | Run the production build                        |
| `npm run lint`  | Run ESLint                                      |
| `npx convex dev`   | Watch & deploy Convex functions to dev cloud |
| `npx convex deploy`| Deploy Convex to production                  |

---

## Environment variables reference

| Variable                                  | Where it comes from                                             | Required |
|-------------------------------------------|-----------------------------------------------------------------|----------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`       | Clerk Dashboard → API Keys                                      | yes      |
| `CLERK_SECRET_KEY`                        | Clerk Dashboard → API Keys                                      | yes      |
| `CLERK_JWT_ISSUER_DOMAIN`                 | Clerk JWT template (`convex`) → Issuer                          | yes      |
| `CLERK_WEBHOOK_SECRET`                    | Clerk Webhook endpoint → Signing Secret                         | yes      |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL`           | Route — default `/sign-in`                                      | yes      |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL`           | Route — default `/sign-up`                                      | yes      |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL`     | Post-login redirect — default `/chat`                           | yes      |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL`     | Post-signup redirect — default `/chat`                          | yes      |
| `CONVEX_DEPLOYMENT`                       | Written by `npx convex dev`                                     | yes      |
| `NEXT_PUBLIC_CONVEX_URL`                  | Written by `npx convex dev`                                     | yes      |

Convex-side env vars (set via `npx convex env set ...`, not in `.env`):
- `CLERK_JWT_ISSUER_DOMAIN`
- `CLERK_WEBHOOK_SECRET`

---

## Deploying to production

1. **Convex:** `npx convex deploy` — creates a prod deployment. Set the same env vars (`CLERK_JWT_ISSUER_DOMAIN`, `CLERK_WEBHOOK_SECRET`) on the prod deployment.
2. **Clerk:** switch to production keys and add a production webhook endpoint pointing at the prod Convex `.site` URL.
3. **Vercel (recommended for Next.js):**
   - Import the GitHub repo.
   - Add all env vars from `.env.example` (using prod values).
   - Use `CONVEX_DEPLOY_KEY` from the Convex dashboard if you want Convex to deploy in the Vercel build (see [Convex + Vercel docs](https://docs.convex.dev/production/hosting/vercel)).
   - Deploy.

---

## Troubleshooting

- **"Unauthenticated" errors in Convex queries** → the Clerk JWT template isn't named `convex`, or `CLERK_JWT_ISSUER_DOMAIN` is unset on the Convex deployment.
- **New Clerk users don't appear in the app** → the webhook endpoint is missing, the URL uses `.cloud` instead of `.site`, or `CLERK_WEBHOOK_SECRET` is wrong on Convex. Check Clerk's webhook logs for delivery failures.
- **`NEXT_PUBLIC_CONVEX_URL is not defined`** → run `npx convex dev` once so it writes the var to `.env`.
- **Port 3000 in use** → `npm run dev -- -p 3001`.

---

## License

Private project — all rights reserved unless a license file is added.
