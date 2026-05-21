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
| `GET /login` | Builds the Entra ID authorization URL manually and redirects the user |
| `GET /callback` | Receives the authorization code, POSTs to the token endpoint via `fetch`, stores the token in the session |
| `GET /me` | Calls Microsoft Graph `GET /v1.0/me` using the stored bearer token |
| `GET /logout` | Destroys the server-side session |

---

## Authorization Flow

```
Browser                  This App               Entra ID              Microsoft Graph
  │                         │                      │                        │
  │  GET /login             │                      │                        │
  │────────────────────────>│                      │                        │
  │                         │  Build authorize URL │                        │
  │                         │  (client_id, scope,  │                        │
  │                         │   redirect_uri,      │                        │
  │                         │   response_type=code)│                        │
  │  302 → /oauth2/v2.0/authorize                  │                        │
  │<────────────────────────│                      │                        │
  │                         │                      │                        │
  │  User authenticates and consents               │                        │
  │────────────────────────────────────────────────>                        │
  │                         │                      │                        │
  │  302 → /callback?code=…                        │                        │
  │<────────────────────────────────────────────────                        │
  │                         │                      │                        │
  │  GET /callback?code=…   │                      │                        │
  │────────────────────────>│                      │                        │
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

1. **`/login`** — The app constructs the authorization URL with `client_id`, `response_type=code`, `redirect_uri`, and `scope`, then redirects the browser to Entra ID.
2. **User authentication** — Entra ID presents the Microsoft login page. The user signs in and, if required, consents to the requested scopes.
3. **Redirect to `/callback`** — Entra ID redirects the browser to `REDIRECT_URI` with a short-lived `code` query parameter.
4. **Token exchange** — The app POSTs the code along with `client_id`, `client_secret`, and `redirect_uri` to the Entra ID token endpoint. Entra ID responds with an access token, its expiry, and the granted scopes.
5. **Session storage** — The access token, expiry timestamp, and scopes are stored in the server-side session (`express-session` in-memory store).
6. **API call (`/me`)** — The app reads the token from the session and calls Microsoft Graph with an `Authorization: Bearer` header to retrieve the signed-in user's profile.
7. **Logout** — The session is destroyed on the server; no Entra ID logout endpoint is called (the Microsoft SSO session remains active in the browser).

### Production considerations

This demo intentionally omits several things that are required in production:

- **`state` parameter** — Not included. In production, generate a random value, store it in the session before the redirect, and verify it matches on the callback to prevent CSRF attacks.
- **Token refresh** — Not implemented. The app will stop working once the access token expires (`expires_in` seconds, typically 3600). Use a refresh token or redirect the user back through login.
- **Session store** — Uses `express-session`'s default in-memory store, which does not persist across restarts. Use a Redis or database-backed store in production.
