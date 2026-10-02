# Web Proxy

A small Node.js web proxy with a browser-style UI.

## Deploy on Render

This repository includes a `render.yaml` Blueprint for a Render Web Service.

1. Open urlRenderhttps://render.com/ and sign in.
2. Create a new **Blueprint** and select this GitHub repository.
3. Render reads `render.yaml` and configures the Node.js service automatically.
4. Use the **Free** compute plan defined in the Blueprint.
5. After deployment, open the generated `*.onrender.com` URL.
6. The proxy UI and the Node.js `/proxy` endpoint will then run from the same cloud service.

Render supports Node.js web services and can automatically redeploy when commits are pushed to the linked branch. citeturn0search0turn0search1

## Run locally

```bash
npm install
npm start
```

Open http://localhost:3000

## Security

The server only accepts HTTP/HTTPS URLs, blocks common private/local IP ranges, limits redirects, and caps response size. A public proxy can still be abused, so add authentication, rate limiting, logging, and stricter domain controls before operating it publicly at scale.

GitHub Pages cannot run the Node.js backend; the proxy endpoint needs a Node-compatible web service.
