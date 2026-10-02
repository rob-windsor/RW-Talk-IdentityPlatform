# Entra ID Token Demo — MSAL

A Node.js/Express app that demonstrates the **OAuth 2.0 Authorization Code flow** with Microsoft Entra ID using the [`@azure/msal-node`](https://github.com/AzureAD/microsoft-authentication-library-for-javascript/tree/dev/lib/msal-node) library. MSAL handles authorization URL generation, the code exchange, in-memory token caching, and silent token renewal. The raw-fetch demo constructs protocol requests manually and does not implement token refresh.

MSAL handles protocol requests, token caching, and silent token renewal; the
application still manages its browser session and authorization transaction
context, including generating and validating state.

---

## Prerequisites

| Requirement | Details |
|---|---|
| Node.js | 18 or later |
| Microsoft Entra ID tenant | Any Azure AD / Entra tenant |
| App registration | See steps below |

### App registration (Azure Portal)

1. Go to **Azure Portal → Entra ID → App registrations → New registration**.
2. Set a name (e.g. `entra-token-demo-msal`).
3. Under **Redirect URI**, choose platform **Web** and enter `http://localhost:3000/callback`.
4. After creation, note the **Application (client) ID** and **Directory (tenant) ID** from the Overview page.
5. Go to **Certificates & secrets → New client secret** and copy the generated value immediately.
6. Go to **API permissions** and confirm `User.Read` (Microsoft Graph) is listed — it is granted by default on new registrations.

> You can reuse the same app registration as the raw-fetch demo if you prefer. Both projects share the same `.env` shape and the same redirect URI.

---

## Setup

```bash
# 1. Install dependencies (includes @azure/msal-node)
npm install

# 2. Create your environment file from the template
cp .env.example .env
```

Open `.env` and fill in your values:

```env
TENANT_ID=your-directory-tenant-id
CLIENT_ID=your-application-client-id
CLIENT_SECRET=your-client-secret-value
REDIRECT_URI=http://localhost:3000/callback
SESSION_SECRET=any-long-random-string
PORT=3000
```

---

## Running

```bash
npm start
```

Then open `http://localhost:3000` in a browser.

---

## Routes

| Route | Description |
|---|---|
| `GET /` | Home page — shows a login link when unauthenticated, or account name/username when signed in |
| `GET /login` | Generates and saves session state, passes it to `pca.getAuthCodeUrl()`, and redirects the user |
| `GET /callback` | Validates and consumes state, calls `pca.acquireTokenByCode()`, and stores the MSAL `account` reference in the session |
| `GET /me` | Calls `pca.acquireTokenSilent()` to get a (possibly cached) token, then calls Microsoft Graph `GET /v1.0/me` |
| `GET /logout` | Destroys the server-side session |

---

## Authorization Flow

```
Browser                  This App (MSAL)         Entra ID              Microsoft Graph
  │                         │                      │                        │
  │  GET /login             │                      │                        │
  │────────────────────────>│                      │                        │
  │                         │  Generate state     │                        │
  │                         │  pca.getAuthCodeUrl()│                        │
  │                         │  (scopes,           │                        │
  │                         │   redirectUri, state)│                        │
  │                         │  Save session state │                        │
  │  302 → /oauth2/v2.0/authorize                  │                        │
  │<────────────────────────│                      │                        │
  │                         │                      │                        │
  │  User authenticates and consents               │                        │
  │────────────────────────────────────────────────>                        │
  │                         │                      │                        │
  │  302 → /callback?code=…&state=…               │                        │
  │<────────────────────────────────────────────────                        │
  │                         │                      │                        │
  │  GET /callback?code=…&state=…                  │                        │
  │────────────────────────>│                      │                        │
  │                         │  Validate state,     │                        │
  │                         │  consume it and save │                        │
  │                         │  pca.acquireTokenByCode()                     │
  │                         │  (code, scopes,      │                        │
  │                         │   redirectUri)        │                        │
  │                         │  ── token endpoint POST ─>│                   │
  │                         │  Token endpoint response │                   │
  │                         │<──────────────────────│                        │
  │                         │                      │                        │
  │                         │  MSAL stores tokens  │                        │
  │                         │  in its in-memory    │                        │
  │                         │  cache               │                        │
  │                         │  session.account =   │                        │
  │                         │  tokenResponse.account                        │
  │  302 → /               │                      │                        │
  │<────────────────────────│                      │                        │
  │                         │                      │                        │
  │  GET /me                │                      │                        │
  │────────────────────────>│                      │                        │
  │                         │  pca.acquireTokenSilent()                     │
  │                         │  (account, scopes)   │                        │
  │                         │  ┌─ Cache hit? Return cached token            │
  │                         │  └─ Expired? POST /token with refresh_token ─>│
  │                         │            fresh access_token <───────────────│
  │                         │  GET /v1.0/me                                 │
  │                         │  Authorization: Bearer <accessToken>          │
  │                         │───────────────────────────────────────────────>
  │                         │  { id, displayName, mail, … }                 │
  │                         │<───────────────────────────────────────────────
  │  Profile JSON           │                      │                        │
  │<────────────────────────│                      │                        │
```

### Step-by-step summary

1. **`/login`** — The app generates unpredictable state with Node's `crypto.randomBytes()`, stores it in the session, and passes it along with scopes and the redirect URI to `pca.getAuthCodeUrl()`. MSAL constructs the URL; it does not sign it. The app saves the session before redirecting the browser.
2. **User authentication** — Entra ID presents the Microsoft login page. The user signs in and, if required, consents to the requested scopes.
3. **Redirect to `/callback`** — Entra ID redirects back to `REDIRECT_URI` with a short-lived `code` and the state supplied by the app. The app requires a single, nonempty state string matching the session value before processing either a code or an authentication error. Invalid state returns HTTP 400 without calling `acquireTokenByCode()`. Matching state is consumed and the session saved before continuing; session-save failures return HTTP 500 without exchanging the code.
4. **Token exchange** — The app calls `pca.acquireTokenByCode()`. MSAL POSTs to the Entra ID token endpoint and caches tokens in the **in-memory token cache** on the `ConfidentialClientApplication` instance. The result exposes the access token and account; refresh tokens are managed internally by MSAL, not returned to application code.
5. **Session storage** — Only the MSAL `AccountInfo` object (a lightweight reference — no raw token) is stored in the `express-session`. The actual tokens remain in the MSAL cache.
6. **API call (`/me`)** — The app calls `pca.acquireTokenSilent()` with the stored account reference. MSAL checks its cache first; if the access token is still valid it is returned immediately. If it has expired, MSAL automatically uses the refresh token to obtain a new one from Entra ID before returning. The resulting token is used to call Microsoft Graph.
7. **Interaction required** — If `acquireTokenSilent()` throws `InteractionRequiredAuthError`, the user is redirected back through `/login`. Silent renewal cannot always complete, for example when additional consent or authentication is required.
8. **Logout** — The server-side session is destroyed. The MSAL in-memory cache entry is not explicitly removed (the cache lives on the shared `pca` instance and clears on server restart). No Entra ID logout endpoint is called.

Each new login replaces the pending state, so only the latest login attempt in a
browser session is valid. Once consumed, the state cannot be reused by a subsequent
callback, including after user cancellation.

Dynamic values in HTML responses, including account fields, error details, and
the serialized Graph profile, are escaped with `escape-html` so they display as
text rather than being interpreted as HTML.

### How MSAL differs from the raw-fetch version

| Concern | Raw fetch | MSAL (`@azure/msal-node`) |
|---|---|---|
| Authorization URL | Built manually with `URLSearchParams` | `pca.getAuthCodeUrl()` |
| `state` / CSRF protection | Generated and validated by the app | Generated and validated by the app |
| `nonce` (ID token replay) | Not implemented | Not implemented |
| PKCE | Intentionally omitted | Intentionally omitted |
| Code exchange | Manual `fetch` POST | `pca.acquireTokenByCode()` |
| Token storage | Session (`accessToken`, `tokenExpiry`, `scopes`) | MSAL in-memory cache; session holds `account` only |
| Token refresh | Not implemented | `acquireTokenSilent()` refreshes automatically |
| Interaction required during silent acquisition | N/A | `InteractionRequiredAuthError` triggers re-login |

### Production considerations

- **PKCE** — Intentionally omitted to keep the introductory walkthrough small. This is a teaching simplification, not production guidance: PKCE is recommended for modern authorization-code implementations, including confidential clients. The client secret is retained; client authentication and PKCE solve different problems.
- **Nonce** — This demo does not supply or validate a nonce. Do not infer automatic nonce protection from the use of MSAL Node.
- **Token cache persistence** — MSAL's in-memory cache is lost on server restart. For production, plug in a distributed cache (Redis, Azure Cosmos DB) using the [MSAL Node distributed cache plugin](https://github.com/AzureAD/microsoft-authentication-library-for-javascript/blob/dev/lib/msal-node/docs/caching.md).
- **Session store** — Uses `express-session`'s default in-memory store. Both browser sessions and the MSAL token cache are lost on server restart in this demo. Use a suitable persistent session store in production; if adding persistence or multiple instances, coordinate session and token-cache lifetimes.
- **Single `pca` instance** — This local demo shares one `ConfidentialClientApplication` so its in-memory cache survives across requests. Production instance and cache design depends on the application's hosting and user-isolation requirements; a shared instance is not a universal requirement.
