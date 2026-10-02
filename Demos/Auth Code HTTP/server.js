import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import express from 'express';
import escapeHtml from 'escape-html';
import session from 'express-session';

const { TENANT_ID, CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, SESSION_SECRET, PORT = 3000 } = process.env;

const app = express();

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
}));

app.get('/', (req, res) => {
  if (!req.session.accessToken) {
    return res.send(`
      <h1>Entra ID Token Demo</h1>
      <a href="/login">Login with Microsoft</a>
    `);
  }
  res.send(`
    <h1>Entra ID Token Demo</h1>
    <p><strong>Token (first 50 chars):</strong> ${escapeHtml(req.session.accessToken.slice(0, 50))}…</p>
    <p><strong>Expires:</strong> ${escapeHtml(new Date(req.session.tokenExpiry).toLocaleString())}</p>
    <p><strong>Scopes:</strong> ${escapeHtml(req.session.scopes)}</p>
    <p><a href="/me">View Graph /me profile</a> · <a href="/logout">Logout</a></p>
  `);
});

// Redirect to Entra ID authorization endpoint
app.get('/login', (req, res) => {
  const state = randomBytes(32).toString('hex');
  req.session.authState = state;

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: 'openid profile email User.Read',
    state,
  });
  req.session.save((err) => {
    if (err) {
      console.error('Failed to save login state:', err);
      return res.status(500).send('<p>Unable to start login. Please try again.</p>');
    }
    res.redirect(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize?${params}`);
  });
});

// Exchange authorization code for tokens
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
      return res.status(400).send(`<p>Auth error: ${escapeHtml(error_description)}</p>`);
    }

    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: REDIRECT_URI,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
        }),
      }
    );

    const tokens = await tokenRes.json();

    if (tokens.error) {
      return res.status(400).send(`<p>Token error: ${escapeHtml(tokens.error_description)}</p>`);
    }

    req.session.accessToken = tokens.access_token;
    req.session.tokenExpiry = Date.now() + tokens.expires_in * 1000;
    req.session.scopes = tokens.scope;

    res.redirect('/');
  } catch (err) {
    console.error('Authorization callback failed:', err);
    res.status(500).send(`<p>Unexpected error: ${escapeHtml(err.message)}</p>`);
  }
});

// Call Microsoft Graph /me using the stored access token
app.get('/me', async (req, res) => {
  if (!req.session.accessToken) {
    return res.redirect('/');
  }

  try {
    const meRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${req.session.accessToken}` },
    });
    const profile = await meRes.json();
    res.send(`<pre>${escapeHtml(JSON.stringify(profile, null, 2))}</pre><p><a href="/">← Home</a></p>`);
  } catch (err) {
    res.status(500).send(`<p>Unexpected error: ${escapeHtml(err.message)}</p>`);
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
