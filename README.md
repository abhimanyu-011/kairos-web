# Kairos

Kairos - an AI assistant created by Abhimanyu.

Static chat page (index.html) + Vercel functions:
- api/chat.js   - forwards messages to the Kairos server and streams the reply
- api/health.js - shows whether the server is online

Vercel environment variables: KAIROS_API_URL, KAIROS_API_KEY.

Test the UI without a server: open index.html?fake=1

