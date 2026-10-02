# Entra ID Token Demo — MSAL + PKCE

A Node.js/Express app that demonstrates the **OAuth 2.0 Authorization Code flow with PKCE** (Proof Key for Code Exchange) using Microsoft Entra ID and [`@azure/msal-node`](https://github.com/AzureAD/microsoft-authentication-library-for-javascript/tree/dev/lib/msal-node). It works like the Auth Code MSAL demo, adding an S256 code challenge to authorization and the corresponding verifier to code redemption. MSAL handles authorization URL generation, the code exchange, in-memory token caching, and silent token renewal.

MSAL handles protocol requests, token caching, and silent token renewal; the
application still manages its browser session and authorization transaction
context, including generating and validating state and retaining the PKCE verifier.

This remains a confidential web client: it uses both a client secret and PKCE.
Client authentication and PKCE solve different problems; PKCE does not replace the
secret in this demo.

---

## Prerequisites

| Requirement | Details |
|---|---|
| Node.js | 18 or later |
| Microsoft Entra ID tenant | Any Azure AD / Entra tenant |
| App registration | See steps below |

### App registration (Azure Portal)

1. Go to **Azure Portal → Entra ID → App registrations → New registration**.
2. Set a name (e.g. `entra-token-demo-msal-pkce`).
3. Under **Redirect URI**, choose platform **Web** and enter `http://localhost:3000/callback`.
4. After creation, note the **Application (client) ID** and **Directory (tenant) ID** from the Overview page.
5. Go to **Certificates & secrets → New client secret** and copy the generated value immediately.
6. Go to **API permissions** and confirm `User.Read` (Microsoft Graph) is listed — it is granted by default on new registrations.

> You can reuse the same app registration as the other authorization-code demos. They share the same `.env` shape and Web redirect URI. Run only one at a time on port 3000, or configure distinct ports and register matching redirect URIs. PKCE does not require switching the registration to SPA or enabling public client flows.

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
| `GET /login` | Generates state and PKCE values, saves state and verifier in the session, and redirects with the challenge |
| `GET /callback` | Validates state, consumes state and verifier, and exchanges the code with the verifier using `pca.acquireTokenByCode()` |
| `GET /me` | Calls `pca.acquireTokenSilent()` to get a (possibly cached) token, then calls Microsoft Graph `GET /v1.0/me` |
| `GET /logout` | Destroys the server-side session |

---

## Authorization Flow

```
Browser                  This App (MSAL + PKCE)  Entra ID              Microsoft Graph
  │                         │                      │                        │
  │  GET /login             │                      │                        │
  │────────────────────────>│                      │                        │
  │                         │  Generate state,    │                        │
  │                         │  verifier, challenge│                        │
  │                         │  pca.getAuthCodeUrl()│                        │
  │                         │  (scopes,           │                        │
  │                         │   redirectUri, state,                        │
  │                         │   codeChallenge,    │                        │
  │                         │   method=S256)      │                        │
  │                         │  Save session state │                        │
  │                         │  and verifier       │                        │
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
  │                         │  capture verifier,  │                        │
  │                         │  consume both, save │                        │
  │                         │  pca.acquireTokenByCode()                     │
  │                         │  (code, scopes,      │                        │
  │                         │   redirectUri,      │                        │
  │                         │   codeVerifier)     │                        │
  │                         │  ── token endpoint POST ─>│                   │
  │                         │                      │  Verify S256 challenge │
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

1. **`/login`** — The app generates unpredictable state with Node's `crypto.randomBytes()` and a PKCE verifier/challenge pair with `CryptoProvider.generatePkceCodes()`. It stores state and verifier in the session, then passes state, scopes, redirect URI, `codeChallenge`, and `codeChallengeMethod: 'S256'` to `pca.getAuthCodeUrl()`. MSAL constructs the URL; it does not sign it. The app saves the session before redirecting the browser.
2. **User authentication** — Entra ID presents the Microsoft login page. The user signs in and, if required, consents to the requested scopes.
3. **Redirect to `/callback`** — Entra ID redirects back to `REDIRECT_URI` with a short-lived `code` and the state supplied by the app. The app requires a single, nonempty state string matching the session value before processing either a code or an authentication error. Invalid state returns HTTP 400 without calling `acquireTokenByCode()`. After a match, the verifier is captured locally, both state and verifier are removed from the session, and the session is saved before continuing. Save failures return HTTP 500 without exchanging the code. A missing verifier returns HTTP 400 for a successful authorization response; a valid-state cancellation displays the auth error without exchanging a code.
4. **Token exchange** — The app calls `pca.acquireTokenByCode()` with `codeVerifier` in addition to the code, scopes, and redirect URI. MSAL sends the verifier and client authentication to the token endpoint. Entra computes the verifier's S256 challenge and checks it against the challenge sent during authorization before issuing tokens. MSAL caches tokens in the **in-memory token cache** on the `ConfidentialClientApplication` instance. The result exposes the access token and account; refresh tokens are managed internally by MSAL, not returned to application code.
5. **Session storage** — Only the MSAL `AccountInfo` object (a lightweight reference — no raw token) is stored in the `express-session`. The actual tokens remain in the MSAL cache.
6. **API call (`/me`)** — The app calls `pca.acquireTokenSilent()` with the stored account reference. MSAL checks its cache first; if the access token is still valid it is returned immediately. If it has expired, MSAL automatically uses the refresh token to obtain a new one from Entra ID before returning. The resulting token is used to call Microsoft Graph.
7. **Interaction required** — If `acquireTokenSilent()` throws `InteractionRequiredAuthError`, the user is redirected back through `/login`. Silent renewal cannot always complete, for example when additional consent or authentication is required.
8. **Logout** — The server-side session is destroyed. The MSAL in-memory cache entry is not explicitly removed (the cache lives on the shared `pca` instance and clears on server restart). No Entra ID logout endpoint is called.

Each new login replaces the pending state and verifier, so only the latest login
attempt in a browser session is valid. Once consumed, the transaction cannot be
reused by a subsequent callback, including after user cancellation.

State binds the callback to the initiating browser session. PKCE binds code
redemption to the initiating authorization transaction: the challenge is sent in
the authorization URL, while the verifier stays server-side and is sent only to
the token endpoint. With S256, the challenge is the base64url-encoded SHA-256 hash
of the verifier. Do not log or display the verifier.

Dynamic values in HTML responses, including account fields, error details, and
the serialized Graph profile, are escaped with `escape-html` so they display as
text rather than being interpreted as HTML.

### How this differs from the MSAL demo without PKCE

| Concern | Auth Code MSAL | Auth Code MSAL PKCE |
|---|---|---|
| Authorization URL | `pca.getAuthCodeUrl()` | Same, plus challenge and `S256` |
| `state` / CSRF protection | Generated and validated by the app | Generated and validated by the app |
| `nonce` (ID token replay) | Not implemented | Not implemented |
| PKCE | Intentionally omitted | Verifier/challenge generated by MSAL's `CryptoProvider` |
| Code exchange | `pca.acquireTokenByCode()` | Same, plus `codeVerifier` |
| Client authentication | Client secret | Client secret |
| Pending transaction | Session holds state | Session holds state and verifier |
| Token storage | MSAL cache; session holds account | Same |
| Token renewal | `acquireTokenSilent()` | Same |
| Interaction required | Redirect to `/login` | Same |

### Production considerations

- **PKCE** — Included with S256, as recommended for modern authorization-code implementations, including confidential clients. This addition does not make the rest of the demo production-ready.
- **Nonce** — This demo does not supply or validate a nonce. Do not infer automatic nonce protection from the use of MSAL Node.
- **Token cache persistence** — MSAL's in-memory cache is lost on server restart. For production, plug in a distributed cache (Redis, Azure Cosmos DB) using the [MSAL Node distributed cache plugin](https://github.com/AzureAD/microsoft-authentication-library-for-javascript/blob/dev/lib/msal-node/docs/caching.md).
- **Session store** — Uses `express-session`'s default in-memory store. Both browser sessions and the MSAL token cache are lost on server restart in this demo. Use a suitable persistent session store in production; if adding persistence or multiple instances, coordinate session and token-cache lifetimes.
- **Single `pca` instance** — This local demo shares one `ConfidentialClientApplication` so its in-memory cache survives across requests. Production instance and cache design depends on the application's hosting and user-isolation requirements; a shared instance is not a universal requirement.
