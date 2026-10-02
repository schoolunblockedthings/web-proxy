import express from "express";
import * as cheerio from "cheerio";
import dns from "node:dns/promises";
import net from "node:net";
import { fetch, Agent } from "undici";

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 20000;
const agent = new Agent({ connect: { timeout: TIMEOUT_MS } });

function normalizeUrl(value) {
  if (!value || typeof value !== "string") return null;
  let raw = value.trim();
  if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.username = "";
    url.password = "";
    return url;
  } catch {
    return null;
  }
}

function isPrivateIPv4(ip) {
  const [a,b,c] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127);
}

function isPrivateIPv6(ip) {
  const x = ip.toLowerCase();
  return x === "::1" || x === "::" || x.startsWith("fc") || x.startsWith("fd") ||
    x.startsWith("fe80:");
}

async function assertPublicHost(hostname) {
  if (net.isIP(hostname)) {
    if ((net.isIPv4(hostname) && isPrivateIPv4(hostname)) ||
        (net.isIPv6(hostname) && isPrivateIPv6(hostname))) {
      throw new Error("Private network targets are blocked.");
    }
    return;
  }
  const records = await dns.lookup(hostname, { all: true });
  if (!records.length) throw new Error("Host could not be resolved.");
  for (const r of records) {
    if ((net.isIPv4(r.address) && isPrivateIPv4(r.address)) ||
        (net.isIPv6(r.address) && isPrivateIPv6(r.address))) {
      throw new Error("Private network targets are blocked.");
    }
  }
}

function requestHeaders(req) {
  const headers = {
    "user-agent": req.get("user-agent") || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
    "accept": req.get("accept") || "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": req.get("accept-language") || "en-US,en;q=0.9"
  };
  for (const name of ["cookie","content-type","referer","origin","authorization","range"]) {
    const value = req.get(name);
    if (value) headers[name] = value;
  }
  return headers;
}

async function safeFetch(startUrl, options = {}) {
  let current = startUrl;
  let method = options.method || "GET";
  let body = options.body;
  const headers = { ...(options.headers || {}) };
  for (let i = 0; i < 5; i++) {
    await assertPublicHost(current.hostname);
    const response = await fetch(current, {
      dispatcher: agent,
      redirect: "manual",
      method,
      body: ["GET","HEAD"].includes(method) ? undefined : body,
      headers
    });
    if ([301,302,303,307,308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Invalid redirect.");
      if (response.headers.getSetCookie) {
        const cookies = response.headers.getSetCookie().map(v => v.split(";")[0]);
        if (cookies.length) headers.cookie = [headers.cookie, ...cookies].filter(Boolean).join("; ");
      }
      if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === "POST")) {
        method = "GET";
        body = undefined;
        delete headers["content-type"];
      }
      current = new URL(location, current);
      continue;
    }
    return { response, url: current };
  }
  throw new Error("Too many redirects.");
}

function proxiedUrl(base, value) {
  if (!value || value.startsWith("#") || /^(data:|javascript:|mailto:|tel:|blob:)/i.test(value)) return value;
  try {
    const absolute = new URL(value, base);
    if (!["http:","https:"].includes(absolute.protocol)) return value;
    return "/proxy?url=" + encodeURIComponent(absolute.href);
  } catch { return value; }
}

function rewriteSrcset(base, value) {
  if (!value) return value;
  return value.split(",").map(part => {
    const bits = part.trim().split(/\s+/);
    if (!bits[0]) return part;
    bits[0] = proxiedUrl(base, bits[0]);
    return bits.join(" ");
  }).join(", ");
}
function rewriteCss(base, css) {
  return css.replace(/url\((\s*["\']?)([^"\')]+)(["\']?\s*)\)/gi,
    (_, before, value, after) => "url(" + before + proxiedUrl(base, value.trim()) + after + ")");
}
function runtimeBridge() {
  return '<script>' +
    '(function(){' +
    'const proxy=function(value){' +
    'try{const u=new URL(value,document.baseURI);' +
    'if(u.protocol==="http:"||u.protocol==="https:") return "/proxy?url="+encodeURIComponent(u.href);' +
    '}catch(e){} return value;};' +
    'const originalFetch=window.fetch;' +
    'if(originalFetch) window.fetch=function(input,init){' +
    'try{if(typeof input==="string") input=proxy(input); else if(input&&input.url) input=proxy(input.url);}' +
    'catch(e){} return originalFetch.call(this,input,init);};' +
    'const originalOpen=XMLHttpRequest.prototype.open;' +
    'XMLHttpRequest.prototype.open=function(method,url){arguments[1]=proxy(url);return originalOpen.apply(this,arguments);};' +
    '})();' +
    '</script>';
}
function rewriteHtml(html, baseUrl) {
  const $ = cheerio.load(html, { decodeEntities: false });
  const declaredBase = $("base[href]").first().attr("href");
  const resourceBase = declaredBase ? new URL(declaredBase, baseUrl).href : baseUrl.href;
  $("base").remove();
  $("a[href]").each((_, el) => $(el).attr("href", proxiedUrl(resourceBase, $(el).attr("href"))));
  $("img[src],script[src],iframe[src],video[src],audio[src],source[src]").each((_, el) => {
    const attr = $(el).attr("src");
    if (attr) $(el).attr("src", proxiedUrl(resourceBase, attr));
  });
  $("[srcset]").each((_, el) => $(el).attr("srcset", rewriteSrcset(resourceBase, $(el).attr("srcset"))));
  $("[style]").each((_, el) => $(el).attr("style", rewriteCss(resourceBase, $(el).attr("style"))));
  $("style").each((_, el) => $(el).html(rewriteCss(resourceBase, $(el).html() || "")));
  $("link[href]").each((_, el) => $(el).attr("href", proxiedUrl(resourceBase, $(el).attr("href"))));
  $("form[action]").each((_, el) => $(el).attr("action", proxiedUrl(baseUrl, $(el).attr("action"))));
  $("meta[http-equiv='refresh']").each((_, el) => {
    const content=$(el).attr("content") || "";
    const match=content.match(/url=(.+)$/i);
    if (match) $(el).attr("content", content.slice(0, match.index) + "url=" + proxiedUrl(resourceBase, match[1]));
  });
  $("head").prepend(runtimeBridge());
  return $.html();
}

app.use(express.static("public"));
app.use(express.raw({ type: () => true, limit: "8mb" }));

app.all("/proxy", async (req, res) => {
  const target = normalizeUrl(req.query.url);
  if (!target) return res.status(400).send("Invalid URL.");
  try {
    const { response, url } = await safeFetch(target, {
      method: req.method,
      headers: requestHeaders(req),
      body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body
    });
    const type = response.headers.get("content-type") || "application/octet-stream";
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length > MAX_BYTES) return res.status(413).send("Response is too large.");
    res.status(response.status);
    res.set("x-proxy-url", url.href);
    const setCookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
    for (const cookie of setCookies) {
      const rewritten = cookie
        .replace(/;\s*Domain=[^;]+/gi, "")
        .replace(/;\s*Path=[^;]*/gi, "; Path=/");
      res.append("Set-Cookie", rewritten);
    }
    for (const header of ["cache-control","etag","last-modified","content-language","content-disposition","accept-ranges"]) {
      const value = response.headers.get(header);
      if (value) res.set(header, value);
    }
    res.removeHeader("content-security-policy");
    res.removeHeader("content-security-policy-report-only");
    if (/text\/html|application\/xhtml\+xml/i.test(type)) {
      res.type("html").send(rewriteHtml(body.toString("utf8"), url));
    } else if (/text\/css/i.test(type)) {
      res.set("content-type", type).send(rewriteCss(url, body.toString("utf8")));
    } else {
      res.set("content-type", type).send(body);
    }
  } catch (error) {
    res.status(502).send("Proxy error: " + error.message);
  }
});

app.get("/health", (_, res) => res.json({ ok: true }));
app.listen(PORT, () => console.log("Web proxy listening on port " + PORT));
