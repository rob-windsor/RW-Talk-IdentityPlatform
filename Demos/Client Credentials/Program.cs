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
Console.WriteLine("Paste the token below into https://jwt.ms and notice there are no");
Console.WriteLine("name, email, or oid claims — the token identifies the app, not a user.");
Console.WriteLine();
Console.WriteLine(result.AccessToken);
