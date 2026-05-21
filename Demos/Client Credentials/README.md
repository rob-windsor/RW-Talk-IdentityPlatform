# Client Credentials Flow Demo

A .NET 9 console application demonstrating the OAuth 2.0 client credentials flow using the Microsoft Identity Platform and MSAL.NET.

## How the Client Credentials Flow Works

The client credentials flow is used by applications that run without a signed-in user — background services, daemons, and API-to-API calls. The application authenticates as itself using its own credentials (a client secret or certificate) rather than on behalf of a user.

1. The application sends a POST request to the Entra ID token endpoint, including its client ID and client secret
2. Entra ID validates the credentials and returns an access token
3. The application uses the access token to call the target API

Because no user is involved, the resulting token contains no user identity claims (no `name`, `email`, or `oid`). The token identifies the application, not a person. Permissions are granted as application permissions (appearing as `roles` claims) rather than delegated permissions.

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
7. Add the permission(s) your app requires and click **Grant admin consent**

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

The application will acquire an app-only access token from Entra ID and print it to the console. Paste the token into [https://jwt.ms](https://jwt.ms) to inspect its claims — notice that user identity claims such as `name`, `email`, and `oid` are absent.
