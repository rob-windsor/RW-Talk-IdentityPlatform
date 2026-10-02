import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import express from 'express';
import escapeHtml from 'escape-html';
import session from 'express-session';
import * as msal from '@azure/msal-node';

const { TENANT_ID, CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, SESSION_SECRET, PORT = 3000 } = process.env;

const SCOPES = ['openid', 'profile', 'email', 'User.Read'];

// One shared instance — MSAL maintains its token cache on this object
const pca = new msal.ConfidentialClientApplication({
  auth: {
    clientId: CLIENT_ID,
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    clientSecret: CLIENT_SECRET,
  },
});

const app = express();

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
}));

app.get('/', (req, res) => {
  if (!req.session.account) {
    return res.send(`
      <h1>Entra ID Token Demo (MSAL)</h1>
      <a href="/login">Login with Microsoft</a>
    `);
  }
  const { username, name } = req.session.account;
  res.send(`
    <h1>Entra ID Token Demo (MSAL)</h1>
    <p><strong>Account:</strong> ${escapeHtml(username)}</p>
    <p><strong>Name:</strong> ${escapeHtml(name)}</p>
    <p><a href="/me">View Graph /me profile</a> · <a href="/logout">Logout</a></p>
  `);
});

// MSAL constructs the authorization URL; the app manages state
app.get('/login', async (req, res) => {
  try {
    const state = randomBytes(32).toString('hex');
    req.session.authState = state;

    const authUrl = await pca.getAuthCodeUrl({
      scopes: SCOPES,
      redirectUri: REDIRECT_URI,
      state,
    });
    req.session.save((err) => {
      if (err) {
        console.error('Failed to save login state:', err);
        return res.status(500).send('<p>Unable to start login. Please try again.</p>');
      }
      res.redirect(authUrl);
    });
  } catch (err) {
    res.status(500).send(`<p>Error building auth URL: ${escapeHtml(err.message)}</p>`);
  }
});

// MSAL exchanges the code and populates its in-memory token cache
app.get('/callback', async (req, res) => {
  const { code, error, error_description, state } = req.query;

  if (typeof state !== 'string' || !state || state !== req.session.authState) {
    return res.status(400).send('<p>Invalid login state. Please start login again.</p>');
  }

  try {
    delete req.session.authState;
    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    if (error) {
      const message = typeof error_description === 'string' && error_description
        ? error_description
        : String(error);
      return res.status(400).send(`<p>Auth error: ${escapeHtml(message)}</p>`);
    }

    if (typeof code !== 'string' || !code) {
      return res.status(400).send('<p>Missing or invalid authorization code.</p>');
    }

    const tokenResponse = await pca.acquireTokenByCode({
      code,
      scopes: SCOPES,
      redirectUri: REDIRECT_URI,
    });

    // Store the account reference; the access token lives in MSAL's cache
    req.session.account = tokenResponse.account;
    res.redirect('/');
  } catch (err) {
    console.error('Authorization callback failed:', err);
    res.status(500).send(`<p>Authorization callback error: ${escapeHtml(err.message)}</p>`);
  }
});

// acquireTokenSilent serves from cache; fetches a fresh token if expired
app.get('/me', async (req, res) => {
  if (!req.session.account) {
    return res.redirect('/');
  }

  try {
    const silentResponse = await pca.acquireTokenSilent({
      account: req.session.account,
      scopes: ['User.Read'],
    });

    const meRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${silentResponse.accessToken}` },
    });
    if (!meRes.ok) {
      return res.status(502).send(
        `<p>Microsoft Graph request failed with HTTP ${meRes.status} ${escapeHtml(meRes.statusText)}.</p>`
      );
    }
    const profile = await meRes.json();
    res.send(`<pre>${escapeHtml(JSON.stringify(profile, null, 2))}</pre><p><a href="/">← Home</a></p>`);
  } catch (err) {
    // Silent acquisition requires user interaction — start login again
    if (err instanceof msal.InteractionRequiredAuthError) {
      return res.redirect('/login');
    }
    res.status(500).send(`<p>Unexpected error: ${escapeHtml(err.message)}</p>`);
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
