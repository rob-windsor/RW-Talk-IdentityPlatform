# Entra ID Token Demo — MSAL

A Node.js/Express app that demonstrates the **OAuth 2.0 Authorization Code flow** with Microsoft Entra ID using the [`@azure/msal-node`](https://github.com/AzureAD/microsoft-authentication-library-for-javascript/tree/dev/lib/msal-node) library. MSAL handles authorization URL generation, the code exchange, in-memory token caching, and silent token refresh — contrasting with the raw-fetch version where all of that is done manually.

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
| `GET /login` | Calls `pca.getAuthCodeUrl()` to build the authorization URL and redirects the user |
| `GET /callback` | Calls `pca.acquireTokenByCode()` to exchange the code; stores the MSAL `account` reference in the session |
| `GET /me` | Calls `pca.acquireTokenSilent()` to get a (possibly cached) token, then calls Microsoft Graph `GET /v1.0/me` |
| `GET /logout` | Destroys the server-side session |

---

## Authorization Flow

```
Browser                  This App (MSAL)         Entra ID              Microsoft Graph
  │                         │                      │                        │
  │  GET /login             │                      │                        │
  │────────────────────────>│                      │                        │
  │                         │  pca.getAuthCodeUrl()│                        │
  │                         │  (scopes, redirectUri│                        │
  │                         │   + auto state/nonce)│                        │
  │  302 → /oauth2/v2.0/authorize                  │                        │
  │<────────────────────────│                      │                        │
  │                         │                      │                        │
  │  User authenticates and consents               │                        │
  │────────────────────────────────────────────────>                        │
  │                         │                      │                        │
  │  302 → /callback?code=…&state=…               │                        │
  │<────────────────────────────────────────────────                        │
  │                         │                      │                        │
  │  GET /callback?code=…   │                      │                        │
  │────────────────────────>│                      │                        │
  │                         │  pca.acquireTokenByCode()                     │
  │                         │  (code, scopes,      │                        │
  │                         │   redirectUri)        │                        │
  │                         │  ── token endpoint POST ──────────────────────>
  │                         │  { access_token, refresh_token, account, … }  │
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

1. **`/login`** — The app calls `pca.getAuthCodeUrl()` with the requested scopes and redirect URI. MSAL automatically adds `state` and `nonce` parameters, then returns the full authorization URL. The browser is redirected there.
2. **User authentication** — Entra ID presents the Microsoft login page. The user signs in and, if required, consents to the requested scopes.
3. **Redirect to `/callback`** — Entra ID redirects back to `REDIRECT_URI` with a short-lived `code` and the `state` value MSAL generated.
4. **Token exchange** — The app calls `pca.acquireTokenByCode()`. MSAL validates the `state`, POSTs to the Entra ID token endpoint, and receives an access token and a refresh token. Both are stored in MSAL's **in-memory token cache** on the `ConfidentialClientApplication` instance.
5. **Session storage** — Only the MSAL `AccountInfo` object (a lightweight reference — no raw token) is stored in the `express-session`. The actual tokens remain in the MSAL cache.
6. **API call (`/me`)** — The app calls `pca.acquireTokenSilent()` with the stored account reference. MSAL checks its cache first; if the access token is still valid it is returned immediately. If it has expired, MSAL automatically uses the refresh token to obtain a new one from Entra ID before returning. The resulting token is used to call Microsoft Graph.
7. **Expired refresh token** — If `acquireTokenSilent()` throws `InteractionRequiredAuthError` (refresh token also expired or revoked), the user is redirected back through `/login`.
8. **Logout** — The server-side session is destroyed. The MSAL in-memory cache entry is not explicitly removed (the cache lives on the shared `pca` instance and clears on server restart). No Entra ID logout endpoint is called.

### How MSAL differs from the raw-fetch version

| Concern | Raw fetch | MSAL (`@azure/msal-node`) |
|---|---|---|
| Authorization URL | Built manually with `URLSearchParams` | `pca.getAuthCodeUrl()` |
| `state` / CSRF protection | Omitted | Generated and validated automatically |
| `nonce` (ID token replay) | Not implemented | Generated and validated automatically |
| Code exchange | Manual `fetch` POST | `pca.acquireTokenByCode()` |
| Token storage | Session (`accessToken`, `tokenExpiry`, `scopes`) | MSAL in-memory cache; session holds `account` only |
| Token refresh | Not implemented | `acquireTokenSilent()` refreshes automatically |
| Expired refresh token | N/A | `InteractionRequiredAuthError` triggers re-login |

### Production considerations

- **Token cache persistence** — MSAL's in-memory cache is lost on server restart. For production, plug in a distributed cache (Redis, Azure Cosmos DB) using the [MSAL Node distributed cache plugin](https://github.com/AzureAD/microsoft-authentication-library-for-javascript/blob/dev/lib/msal-node/docs/caching.md).
- **Session store** — Uses `express-session`'s default in-memory store. Use a Redis or database-backed store in production.
- **Single `pca` instance** — The `ConfidentialClientApplication` is created once at startup and shared across all requests. This is the correct pattern; do not create a new instance per request.
