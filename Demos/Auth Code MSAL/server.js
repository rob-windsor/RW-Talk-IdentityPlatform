import 'dotenv/config';
import express from 'express';
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
    <p><strong>Account:</strong> ${username}</p>
    <p><strong>Name:</strong> ${name}</p>
    <p><a href="/me">View Graph /me profile</a> · <a href="/logout">Logout</a></p>
  `);
});

// MSAL builds and signs the authorization URL (including state + nonce)
app.get('/login', async (req, res) => {
  try {
    const authUrl = await pca.getAuthCodeUrl({
      scopes: SCOPES,
      redirectUri: REDIRECT_URI,
    });
    res.redirect(authUrl);
  } catch (err) {
    res.status(500).send(`<p>Error building auth URL: ${err.message}</p>`);
  }
});

// MSAL exchanges the code and populates its in-memory token cache
app.get('/callback', async (req, res) => {
  const { code, error, error_description } = req.query;

  if (error) {
    return res.status(400).send(`<p>Auth error: ${error_description}</p>`);
  }

  try {
    const tokenResponse = await pca.acquireTokenByCode({
      code,
      scopes: SCOPES,
      redirectUri: REDIRECT_URI,
    });

    // Store the account reference; the access token lives in MSAL's cache
    req.session.account = tokenResponse.account;
    res.redirect('/');
  } catch (err) {
    res.status(500).send(`<p>Token error: ${err.message}</p>`);
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
    const profile = await meRes.json();
    res.send(`<pre>${JSON.stringify(profile, null, 2)}</pre><p><a href="/">← Home</a></p>`);
  } catch (err) {
    // Refresh token expired or missing — send user back through login
    if (err instanceof msal.InteractionRequiredAuthError) {
      return res.redirect('/login');
    }
    res.status(500).send(`<p>Unexpected error: ${err.message}</p>`);
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
