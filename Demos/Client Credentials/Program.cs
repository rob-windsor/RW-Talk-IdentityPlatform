using Microsoft.Extensions.Configuration;
using Microsoft.Identity.Client;

var config = new ConfigurationBuilder()
    .AddJsonFile("appsettings.json")
    .AddUserSecrets<Program>()
    .Build();

var tenantId = config["AzureAd:TenantId"]!;
var clientId = config["AzureAd:ClientId"]!;
var clientSecret = config["AzureAd:ClientSecret"]!;

var app = ConfidentialClientApplicationBuilder
    .Create(clientId)
    .WithClientSecret(clientSecret)
    .WithAuthority($"https://login.microsoftonline.com/{tenantId}")
    .Build();

var scopes = new[] { "https://graph.microsoft.com/.default" };

Console.WriteLine("Acquiring app-only access token...");

var result = await app.AcquireTokenForClient(scopes).ExecuteAsync();

Console.WriteLine("Access token acquired.");
Console.WriteLine();
Console.WriteLine("This token does not represent a signed-in user.");
Console.WriteLine("User-specific claims such as name and email are typically absent.");
Console.WriteLine("An oid claim, if present, identifies the requesting service principal.");
Console.WriteLine("For this Graph example, granted application permissions appear in roles.");
Console.WriteLine();
Console.WriteLine("This demo acquires a token for inspection; it does not call Microsoft Graph.");
Console.WriteLine("Inspect only a dedicated demo token at https://jwt.ms.");
Console.WriteLine("WARNING: Access tokens are credentials. Do not publish this token in");
Console.WriteLine("source code, screenshots, or recordings.");
Console.WriteLine();
Console.WriteLine(result.AccessToken);
