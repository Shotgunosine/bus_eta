# WMATA Next Times (GitHub Pages)

Shows:
- Next bus times for stops: 8410, 8553, 21912
- Next train times for Fort Totten (B06)

## Get a WMATA API key
Sign up on WMATA's developer portal and create a subscription key. (Free.)  
https://developer.wmata.com/  (key is entered in the site UI and stored locally)

## Run locally
Open `index.html` in a browser (or use VS Code Live Server).

## Deploy on GitHub Pages
1. Push this repo to GitHub
2. Repo Settings → Pages
3. Source: `Deploy from a branch`
4. Branch: `main` (root)

## CORS trouble? (Optional static-friendly proxy)
If your browser blocks calls to `https://api.wmata.com/...` with CORS errors,
use a tiny Cloudflare Worker as a proxy (still keeps this repo static).

### Cloudflare Worker (example)
Create a worker with:

```js
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = url.searchParams.get("url");
    if (!target) return new Response("Missing ?url=", { status: 400 });

    const apiKey = request.headers.get("api_key") || "";
    const resp = await fetch(target, { headers: { api_key: apiKey } });

    return new Response(resp.body, {
      status: resp.status,
      headers: {
        "Content-Type": resp.headers.get("Content-Type") || "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
};
