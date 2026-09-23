# Architecture

## 1. System components

```mermaid
flowchart LR
    subgraph Client["Browser"]
        Web["Next.js Chat UI\n(web/)"]
    end

    subgraph API["Fastify API (server/)"]
        Chat["POST /api/chat\n(SSE)"]
        SessionRoute["GET/DELETE /api/session/:id"]
        Health["GET /api/health"]
        Classifier["agent/classifier.ts"]
        Orchestrator["agent/orchestrator.ts\n(tool-calling loop)"]
        Tools["agent/tools/*\n(9 tools)"]
        ZohoClient["zoho/client.ts\n(HTTP + retry)"]
        ZohoAuth["zoho/auth.ts\n(token manager)"]
        Store["session/store.ts"]
    end

    Groq["Groq API\n(llama-3.3-70b-versatile /\nllama-3.1-8b-instant)"]
    Zoho["Zoho CRM API\n(Leads, Deals, Contacts, Cases)"]
    Redis[("Redis\n(optional)")]
    Memory[("In-memory store\n(fallback)")]

    Web -- "fetch + SSE" --> Chat
    Web --> SessionRoute
    Web --> Health

    Chat --> Classifier
    Chat --> Orchestrator
    Classifier -- "small model,\nJSON mode" --> Groq
    Orchestrator -- "streamed tool calls" --> Groq
    Orchestrator --> Tools
    Tools --> ZohoClient
    ZohoClient --> ZohoAuth
    ZohoAuth -- "OAuth token refresh" --> Zoho
    ZohoClient -- "REST calls" --> Zoho

    Chat --> Store
    SessionRoute --> Store
    Health --> ZohoAuth
    Health --> Store
    Store -.-> Redis
    Store -.-> Memory
```

`LLMProvider` (`server/src/llm/provider.ts`) is a small interface; `GroqProvider`
is the only implementation today, but a `GeminiProvider` could be dropped in
without touching the classifier or orchestrator.

## 2. Per-turn sequence

```mermaid
sequenceDiagram
    actor User
    participant Web as Web UI
    participant API as POST /api/chat
    participant Cls as Classifier (8B model)
    participant Orc as Orchestrator
    participant LLM as Groq (70B model)
    participant Tool as Tool registry
    participant Zoho as Zoho CRM

    User->>Web: types a message
    Web->>API: POST { sessionId, message }
    API->>API: load session (Redis/memory)
    API->>Cls: classify(last 6 msgs, session state)
    Cls->>LLM: JSON-mode completion (temp 0, 1.5s timeout)
    LLM-->>Cls: { stage, confidence, entities }
    Cls-->>API: result (or previous stage on timeout/parse failure)
    API-->>Web: SSE event: stage
    API->>Orc: runTurn(session, message)

    loop up to 5 tool iterations
        Orc->>LLM: stream chat completion (system prompt + history + tools)
        LLM-->>Orc: token deltas + tool_call deltas
        Orc-->>Web: SSE event: token (as text streams)
        alt model requested tool call(s)
            Orc->>Tool: validate args (zod) + execute (parallel)
            Tool->>Zoho: search/create/update
            Zoho-->>Tool: record data
            Tool-->>Orc: { ok, data | error_code, hint }
            Orc-->>Web: SSE event: tool_start / tool_end
            Orc->>Orc: append tool result, loop again
        else plain text reply
            Orc-->>Web: SSE event: done
        end
    end

    API->>API: persist session (messages + state)
    Web->>Web: GET /api/session/:id to refresh side panel
```

## 3. Zoho OAuth token refresh flow

```mermaid
sequenceDiagram
    participant Caller as Tool / ZohoClient
    participant Auth as ZohoTokenManager
    participant Zoho as Zoho Accounts API

    Caller->>Auth: getAccessToken()
    alt cached token valid (> 5 min from expiry)
        Auth-->>Caller: cached access token
    else expired / missing / forceRefresh
        alt refresh already in flight
            Auth-->>Auth: await the same in-flight promise
        else
            Auth->>Zoho: POST /oauth/v2/token (grant_type=refresh_token)
            Zoho-->>Auth: { access_token, expires_in }
            Auth->>Auth: cache token + expiry
        end
        Auth-->>Caller: fresh access token
    end

    Caller->>Zoho: API request (Authorization: Zoho-oauthtoken ...)
    alt Zoho returns 401
        Caller->>Auth: getAccessToken({ forceRefresh: true })
        Auth->>Zoho: POST /oauth/v2/token
        Zoho-->>Auth: new access token
        Caller->>Zoho: retry the request once
    end
```

Key properties: proactive refresh 5 minutes before expiry, single-flight
de-duplication of concurrent refreshes (Zoho rate-limits refresh calls), and
exactly one forced retry on a 401 — never an unbounded loop.
