import { createServer } from "http";
import { exec } from "child_process";
import * as dotenv from "dotenv";
import { URL } from "url";

// Load existing environment variables
dotenv.config();

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("❌ Error: GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET are required.");
    console.error("   To get these:");
    console.error("   1. Go to Google Cloud Console (https://console.cloud.google.com)");
    console.error("   2. Create a Project and enable the Gmail API");
    console.error("   3. Configure OAuth Consent Screen (External/Testing)");
    console.error(`   4. Create OAuth Credentials (Desktop App or Web App with redirect ${REDIRECT_URI})`);
    console.error("   5. Add them to your .env file and run this script again.");
    process.exit(1);
}

// Scopes required for Gmail, Calendar, and Drive integration
const SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/drive.readonly",
].join(" ");

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&access_type=offline` +
    `&prompt=consent`;

console.log("=========================================");
console.log("🔐 Gmail OAuth Helper");
console.log("=========================================\n");
console.log("1. We will now open your browser.");
console.log("2. Sign in with your Google account and grant permissions.");
console.log("3. You will be redirected back here to receive your Refresh Token.\n");

function openBrowser(url: string) {
    const start = process.platform === "darwin" ? "open" :
        process.platform === "win32" ? "start" : "xdg-open";
    exec(`${start} "${url}"`);
}

const server = createServer(async (req, res) => {
    try {
        const url = new URL(req.url || "", `http://localhost:${PORT}`);

        if (url.pathname === "/oauth2callback") {
            const code = url.searchParams.get("code");

            if (!code) {
                res.writeHead(400);
                res.end("No code found in URL.");
                return;
            }

            console.log("⏳ Received auth code... Exchanging for refresh token...");

            res.writeHead(200, { "Content-Type": "text/html" });
            res.write(`
                <html><body>
                    <h2>Authenticating...</h2>
                    <p>Please check your terminal for the Refresh Token.</p>
                </body></html>
            `);

            // Exchange code for tokens
            const response = await fetch("https://oauth2.googleapis.com/token", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    code,
                    client_id: CLIENT_ID,
                    client_secret: CLIENT_SECRET,
                    redirect_uri: REDIRECT_URI,
                    grant_type: "authorization_code",
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                console.error("❌ Token exchange failed:", data);
                res.end("Authentication failed. Check terminal for details.");
                server.close();
                process.exit(1);
            }

            console.log("\n🎉 Authorization Successful!\n");
            console.log("=========================================");
            console.log("🔑 Add this line to your .env file:");
            console.log(`GMAIL_REFRESH_TOKEN="${data.refresh_token}"`);
            console.log("=========================================");

            if (!data.refresh_token) {
                console.log("⚠️  Warning: No refresh token returned. This usually means you've authenticated before.");
                console.log("    To get a new refresh token, go to https://myaccount.google.com/permissions");
                console.log("    Revoke access for your app, and run this script again.");
            } else {
                console.log("\n✅ You can now restart your Gravity Claw agent.");
            }

            res.end(`
                <script>document.body.innerHTML = "<h2>Authentication Successful!</h2><p>You can close this tab and check your terminal.</p>";</script>
            `);

            server.close();
            process.exit(0);
        } else {
            res.writeHead(404);
            res.end();
        }
    } catch (err) {
        console.error("Error handling request:", err);
        res.writeHead(500);
        res.end("Server error.");
    }
});

server.listen(PORT, () => {
    console.log(`📡 Local server listening at http://localhost:${PORT}`);
    setTimeout(() => {
        openBrowser(authUrl);
        console.log("Opening browser...");
    }, 1500);
});
