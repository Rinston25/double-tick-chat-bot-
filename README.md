# Mahindra AI Chat Agent

A production-quality, multistage AI chat agent for a Mahindra & Mahindra–style
automotive OEM, integrated end-to-end with Zoho CRM. A single conversational
agent handles the whole customer lifecycle — from "what does the Thar cost?"
to "where's my VIN?" — routing between vehicle catalog lookups, CRM
reads/writes, and structured service intake, while streaming its replies and
never inventing data it hasn't actually fetched from Zoho.

## Features, mapped to the four lifecycle stages

| Stage                     | What it does                                                                                                                       | Zoho module                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **NEW_LEAD**              | Answers model/variant/price/feature questions from the local vehicle catalog, pitches a test drive, collects name/phone/email/city | Creates a **Lead**                                    |
| **ONGOING_PIPELINE**      | Looks up an existing prospect's test drive date, quotation, and dealer contact by phone or Deal ID; updates follow-up preference   | Reads/updates a **Deal**                              |
| **BOOKED_VEHICLE**        | Verifies identity (phone or Booking ID) then returns allocation status, VIN, expected delivery, and balance payment link           | Reads a **Deal** in stage _Closed Won_                |
| **POST_PURCHASE_SERVICE** | Collects registration number, odometer, issue/service type, preferred center; registers the owner if needed                        | Creates a **Case** linked to a **Contact**            |

The agent classifies which stage a message belongs to on every turn, so a
customer can ask about Thar pricing and then say "also my XUV700 needs
service" without losing what was already collected.

## Tech stack

| Layer         | Technology                                                                                               |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| Monorepo      | npm workspaces, TypeScript (strict), Node 20+                                                            |
| API server    | Fastify 5, zod validation, pino logging, `@fastify/cors`                                                 |
| Agent / LLM   | `groq-sdk` direct tool-calling — model names configurable via `GROQ_MODEL_AGENT`/`GROQ_MODEL_CLASSIFIER` |
| CRM           | Zoho CRM REST API v7, custom OAuth 2.0 token manager                                                     |
| Session store | Redis (`ioredis`) when `REDIS_URL` is set, else in-memory — same interface                               |
| Frontend      | Next.js 14 App Router, React, Tailwind CSS, `react-markdown`                                             |
| Tests         | Vitest (server)                                                                                          |

## Quick start

**Prerequisites:** Node.js 20+, npm 10+, a Groq API key, a Zoho CRM org (any
edition that allows Self Client OAuth apps), optionally Docker for Redis.

```bash
git clone <this-repo>
cd Double-tick
npm install
cp .env.example .env
```

1. **Zoho setup** — create a Self Client, add the required custom fields, and
   add the two pipeline stages. Full walkthrough:
   [docs/ZOHO_SETUP.md](docs/ZOHO_SETUP.md). Fill in `ZOHO_CLIENT_ID` and
   `ZOHO_CLIENT_SECRET` in `.env` as you go.
2. **Groq** — get an API key from <https://console.groq.com/keys> and set
   `GROQ_API_KEY` in `.env`.
3. **Get a refresh token** (grant code expires within minutes — do this right
   after generating it in the Zoho API console):
   ```bash
   npm run zoho:token -- <grant_code>
   ```
   Paste the printed `ZOHO_REFRESH_TOKEN` into `.env`.
4. **Seed demo data** (idempotent — safe to re-run):
   ```bash
   npm run seed
   ```
5. **Redis (optional)** — without it the server automatically falls back to
   an in-memory session store, which is fine for local dev:
   ```bash
   docker compose up -d
   ```
6. **Run everything:**
   ```bash
   npm run dev
   ```

Expected URLs:

- Web UI: <http://localhost:3000>
- API: <http://localhost:4000> (health check at `/api/health`)

Other useful root scripts: `npm run build`, `npm test`, `npm run lint`,
`npm run typecheck`.

## Design decisions & assumptions

- **Direct SDK over LangChain/LlamaIndex.** Tool calling here is a single
  well-defined loop (stream → accumulate tool_call deltas → execute → feed
  results back). A framework would add an abstraction layer and dependency
  surface for very little leverage at this scale; the `LLMProvider` interface
  (`server/src/llm/provider.ts`) already gives us provider-swappability
  without one.
- **Booking status lives on a Deal stage, not a custom module.** A booking is
  just the terminal state of the same sales Deal that started as a test
  drive/quotation — modeling it as `Stage = "Closed Won"` keeps one record's
  full history (quote → test drive → booking → delivery) instead of
  splitting it across two disconnected records that need manual syncing.
  (The original design used a dedicated "Closed Won - Booking Done" stage,
  but `Stage` is a standard Zoho field whose picklist most plans/editions
  won't let you extend via the UI or the Settings API — see
  [docs/ZOHO_SETUP.md](docs/ZOHO_SETUP.md#about-the-stage-field--no-new-pipeline-stages-needed).
  `server/src/config/zohoFields.ts` is the one place to change this if your
  org can add custom stages.)
- **Classifier + agent split.** A small, cheap model (`GROQ_MODEL_CLASSIFIER`,
  JSON mode, temperature 0) classifies stage/entities every turn in under
  ~1.5s so the system prompt and tool guidance can be tailored per turn,
  without spending the larger model's context or latency budget on
  classification. It never blocks the turn — on timeout or a malformed
  response it just keeps the previous stage.
- **Confirm-before-write, always.** Every tool that creates or updates a CRM
  record is preceded by a plain-language summary and an explicit "yes" in the
  system prompt's hard rules. This is a deliberate trust boundary: an LLM
  should not be the last line of defense against writing wrong data into a
  production CRM.
- **India data center by default.** `ZOHO_ACCOUNTS_URL` /
  `ZOHO_API_DOMAIN` default to `accounts.zoho.in` / `www.zohoapis.in` to match
  a Mahindra-style India-first deployment. Both are plain env vars — see
  [docs/ZOHO_SETUP.md](docs/ZOHO_SETUP.md#0-pick-your-data-center) for the
  `.com`/`.eu`/`.com.au` equivalents.
- **Prices are always indicative.** The vehicle catalog (`server/src/data/vehicles.json`)
  is a static, hand-maintained dataset (with a `disclaimer` and `last_updated`
  field), not a live pricing feed — every quoted price is explicitly framed as
  "indicative ex-showroom; final on-road price from your dealer," both in the
  data and in the system prompt's hard rules.
- **Zoho search indexing lag.** Zoho's search index can take a few seconds to
  reflect a just-created record. Tools that create a record return its ID
  directly and the session keeps that ID for subsequent lookups in the same
  conversation, rather than re-searching immediately after a write.

## Known limitations & next steps

- **Single channel.** Only the web chat UI exists today; a voice channel or a
  WhatsApp Business API channel would reuse the same `runTurn` orchestrator
  and tool registry behind a different transport.
- **No push updates from Zoho.** The app only reads Zoho state when a tool is
  called during a conversation. A Zoho webhook (e.g. on Deal stage change)
  could push allocation/delivery updates proactively instead of waiting for
  the customer to ask.
- **No authentication.** Anyone with the session's UUID can view that
  session's chat history and CRM lookups (bounded by the tool layer's
  phone/booking-ID identity checks, but not by a real login). A production
  deployment would put a real auth layer in front of `/api/chat`.
- **Single-instance in-memory fallback.** Without `REDIS_URL`, sessions live
  in one process's memory — fine for a demo, not for a multi-instance
  deployment.
