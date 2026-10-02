# Client Credentials Flow Demo

A .NET 9 console application demonstrating the OAuth 2.0 client credentials flow using the Microsoft Identity Platform and MSAL.NET.

This is a token-acquisition and inspection demo. It prints an app-only access token
but does not call Microsoft Graph.

## How the Client Credentials Flow Works

The client credentials flow is used by applications that run without a signed-in user — background services, daemons, and API-to-API calls. The application authenticates as itself using its own credentials (a client secret or certificate) rather than on behalf of a user.

1. The application sends a POST request to the Entra ID token endpoint, including its client ID and client secret
2. Entra ID validates the credentials and returns an access token
3. The application uses the access token to call the target API

Step 3 describes how a client would use the token; this demo stops after acquiring
and displaying it.

The token does not represent a signed-in user. User-specific claims such as `name`
and `email` are typically absent. An `oid` claim, if present, identifies the
requesting service principal, not a user. For this Graph application-permission
example, granted application permissions appear in `roles` rather than delegated
scopes in `scp`. Do not assume a fixed claim set or use missing display claims as
the definitive test for app-only access.

### What `.default` means

The existing scope, `https://graph.microsoft.com/.default`, requests the Microsoft
Graph application permissions configured for this app and granted through admin
consent. It does not grant new permissions or obtain consent. MSAL.NET's
`AcquireTokenForClient()` uses this scope for app-only token acquisition.

## Prerequisites

- [.NET 9 SDK](https://dotnet.microsoft.com/download)
- An Azure account with permission to register applications in Entra ID

## Entra ID App Registration Setup

1. Sign in to the [Azure Portal](https://portal.azure.com) and navigate to **Entra ID > App registrations**
2. Click **New registration**, give the app a name, and click **Register**
3. Note the **Application (client) ID** and **Directory (tenant) ID** from the Overview page
4. Navigate to **Certificates & secrets > Client secrets** and click **New client secret**
5. Give it a description, choose an expiry, and click **Add** — copy the secret **Value** immediately
6. Navigate to **API permissions**, click **Add a permission > Microsoft Graph > Application permissions**
7. For this demo, add **Organization.Read.All** and have an authorized administrator click **Grant admin consent**

Use a dedicated demo app registration and tenant. `Organization.Read.All` is a
read-only application permission for organization information and provides an
identifiable value to inspect in the token's `roles` claim. Microsoft documents it
as the least-privileged application permission for
[reading the organization](https://learn.microsoft.com/en-us/graph/api/organization-get?view=graph-rest-1.0).
It still grants real access: do not add broader directory, write, or mailbox
permissions solely for token inspection. This demo does not exercise the
organization API.

## Project Setup

1. Clone or download this project

2. Set the tenant ID and client ID in `appsettings.json`:
   ```json
   {
     "AzureAd": {
       "TenantId": "<your-tenant-id>",
       "ClientId": "<your-client-id>",
       "ClientSecret": ""
     }
   }
   ```

3. Store the client secret using .NET user secrets (keeps it out of source control):
   ```
   dotnet user-secrets set "AzureAd:ClientSecret" "<your-client-secret>"
   ```

## Running the Demo

```
dotnet run
```

The application acquires an app-only access token from Entra ID and prints it to
the console. Inspect only a dedicated demo token at
[https://jwt.ms](https://jwt.ms). With the setup above, look for
`Organization.Read.All` in `roles`. User-specific `name` and `email` claims are
typically absent; `oid`, if present, identifies the service principal.

**Access tokens are credentials.** Do not publish them in source code, screenshots,
or recordings. Keep the token out of captured presentation output, and use a
dedicated demo environment rather than a production token.

## Credential considerations

The client secret keeps this walkthrough small. Store it in .NET user secrets,
not source control; user secrets are a development convenience, not an encrypted
production secret store. Where supported, managed identity or workload identity
federation can avoid storing client secrets. Those alternatives are outside this
demo's scope.
