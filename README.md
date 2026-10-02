# Web Proxy

A small Node.js web proxy with a simple browser UI.

## Run locally

```bash
npm install
npm start
```

Open http://localhost:3000

## Deployment

Deploy this project to a Node-compatible host. Set the start command to `npm start`.

## Security

The server only accepts HTTP/HTTPS URLs, blocks common private/local IP ranges, limits redirects, and caps response size. A public proxy can still be abused, so add authentication, rate limiting, logging, and stricter domain controls before operating it publicly at scale.

GitHub Pages cannot run the backend; use a Node-compatible server for the proxy endpoint.
