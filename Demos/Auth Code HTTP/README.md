# Entra ID Token Demo — Raw Fetch

A minimal Node.js/Express app that demonstrates the **OAuth 2.0 Authorization Code flow** with Microsoft Entra ID using only Node 18+ built-in `fetch` and `crypto`. No authentication library is used — every HTTP call to the Entra ID endpoints is made manually, making the underlying protocol fully visible.

---

## Prerequisites

| Requirement | Details |
|---|---|
| Node.js | 18 or later (built-in `fetch` required) |
| Microsoft Entra ID tenant | Any Azure AD / Entra tenant |
| App registration | See steps below |

### App registration (Azure Portal)

1. Go to **Azure Portal → Entra ID → App registrations → New registration**.
2. Set a name (e.g. `entra-token-demo`).
3. Under **Redirect URI**, choose platform **Web** and enter `http://localhost:3000/callback`.
4. After creation, note the **Application (client) ID** and **Directory (tenant) ID** from the Overview page.
5. Go to **Certificates & secrets → New client secret** and copy the generated value immediately.
6. Go to **API permissions** and confirm `User.Read` (Microsoft Graph) is listed — it is granted by default on new registrations.

---

## Setup

```bash
# 1. Install dependencies
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
| `GET /` | Home page — shows a login link when unauthenticated, or token details when signed in |
| `GET /login` | Saves random state in the session, builds the Entra ID authorization URL, and redirects the user |
| `GET /callback` | Validates and consumes state, rejects a missing or invalid authorization code, then exchanges it via `fetch` and stores the token in the session |
| `GET /me` | Calls Microsoft Graph `GET /v1.0/me` using the stored bearer token; reports Graph HTTP errors as `502 Bad Gateway` |
| `GET /logout` | Destroys the server-side session |

---

## Authorization Flow

```
Browser                  This App               Entra ID              Microsoft Graph
  │                         │                      │                        │
  │  GET /login             │                      │                        │
  │────────────────────────>│                      │                        │
  │                         │  Generate state and  │                        │
  │                         │  save in session     │                        │
  │                         │  Build authorize URL │                        │
  │                         │  (client_id, scope,  │                        │
  │                         │   redirect_uri,      │                        │
  │                         │   response_type=code,│                        │
  │                         │   state)             │                        │
  │  302 → /oauth2/v2.0/authorize                  │                        │
  │<────────────────────────│                      │                        │
  │                         │                      │                        │
  │  User authenticates and consents               │                        │
  │────────────────────────────────────────────────>                        │
  │                         │                      │                        │
  │  302 → /callback?code=…&state=…                │                        │
  │<────────────────────────────────────────────────                        │
  │                         │                      │                        │
  │  GET /callback?code=…&state=…                  │                        │
  │────────────────────────>│                      │                        │
  │                         │  Validate state,     │                        │
  │                         │  consume it and save │                        │
  │                         │  POST /oauth2/v2.0/token                      │
  │                         │  (grant_type=authorization_code,              │
  │                         │   code, client_id, client_secret,             │
  │                         │   redirect_uri)       │                        │
  │                         │──────────────────────>│                        │
  │                         │  { access_token, expires_in, scope, … }       │
  │                         │<──────────────────────│                        │
  │                         │                      │                        │
  │                         │  Store in session:   │                        │
  │                         │  accessToken         │                        │
  │                         │  tokenExpiry         │                        │
  │                         │  scopes              │                        │
  │  302 → /               │                      │                        │
  │<────────────────────────│                      │                        │
  │                         │                      │                        │
  │  GET /me                │                      │                        │
  │────────────────────────>│                      │                        │
  │                         │  GET /v1.0/me                                 │
  │                         │  Authorization: Bearer <accessToken>          │
  │                         │───────────────────────────────────────────────>
  │                         │  { id, displayName, mail, … }                 │
  │                         │<───────────────────────────────────────────────
  │  Profile JSON           │                      │                        │
  │<────────────────────────│                      │                        │
```

### Step-by-step summary

1. **`/login`** — The app generates an unpredictable `state` with Node's `crypto.randomBytes()` and saves it in the browser's server-side session. It constructs the authorization URL with `client_id`, `response_type=code`, `redirect_uri`, `scope`, and `state`, then redirects the browser only after the session is saved.
2. **User authentication** — Entra ID presents the Microsoft login page. The user signs in and, if required, consents to the requested scopes.
3. **Redirect to `/callback`** — Entra ID redirects the browser to `REDIRECT_URI` with a short-lived `code` and the original `state`. The app requires a single, nonempty state string matching the session value before processing a code or an authentication error. Invalid state returns HTTP 400 without contacting the token endpoint. Matching state is removed from the session and that change is saved before continuing; session-save failures return HTTP 500 without redeeming the code. After handling an Entra authentication error, the app requires exactly one nonempty string authorization code and returns HTTP 400 if it is missing or malformed.
4. **Token exchange** — The app POSTs the code along with `client_id`, `client_secret`, and `redirect_uri` to the Entra ID token endpoint. Entra ID responds with an access token, its expiry, and the granted scopes.
5. **Session storage** — The access token, expiry timestamp, and scopes are stored in the server-side session (`express-session` in-memory store).
6. **API call (`/me`)** — The app reads the token from the session and calls Microsoft Graph with an `Authorization: Bearer` header to retrieve the signed-in user's profile. A non-success Graph response is reported as `502 Bad Gateway`, not rendered as a successful profile.
7. **Logout** — The session is destroyed on the server; no Entra ID logout endpoint is called (the Microsoft SSO session remains active in the browser).

Each new login replaces the pending state, so only the latest login attempt in a
browser session is valid. Once consumed, the state cannot be reused by a subsequent
callback, including after user cancellation.

Dynamic values in HTML responses, including error details, token information, and
the serialized Graph profile, are escaped with `escape-html` so they display as
text rather than being interpreted as HTML.

### Production considerations

This introductory demo intentionally leaves out several production considerations:

- **PKCE** — Intentionally omitted to keep the protocol walkthrough small. This is a teaching simplification, not production guidance: PKCE is recommended for modern authorization-code implementations, including confidential clients. The client secret is retained; client authentication and PKCE solve different problems.
- **Token refresh** — Not implemented. The app will stop working once the access token expires (`expires_in` seconds, typically 3600). Use a refresh token or redirect the user back through login.
- **Session store** — Uses `express-session`'s default in-memory store, which does not persist across restarts. Use a Redis or database-backed store in production.
