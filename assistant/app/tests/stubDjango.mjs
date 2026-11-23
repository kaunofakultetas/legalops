// -----------------------------------------------------------
//  [*] Tests — a scripted stand-in for Django
//
//  An http server answering the Django routes a test scripts
//  and recording every request (method, path, query, body,
//  bearer, X-Real-IP, secret), so the test can assert what
//  Django was asked. A route nobody scripted answers 404 in
//  Django's error envelope.
// -----------------------------------------------------------

import http from "node:http";







// -----------------------------------------------------------
// startStubDjango
// -----------------------------------------------------------
//
// Starts the stub on a random port. A handler, keyed by
// method and path regex, gets the parsed body, the request
// and its URL and answers a status and JSON (or a promise of
// them); one that throws answers 500 STUB_FAILED. The route
// table stays live, matched in insertion order, so a test can
// swap a handler mid-file. waitFor polls the log for the
// first matching request and throws if none arrives in time.
//
// Used by:
//   - tests/helpers/chatApp.mjs, tests/helpers/toolKit.mjs
//   - tests/app, clientIp, django, errors, identity, mcp,
//     prompts-service, ratelimit, server, tools and
//     transcript (.test.mjs)
// -----------------------------------------------------------

export async function startStubDjango(handlers = {}) {
  const requests = [];
  const routes = { ...handlers };
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", async () => {
      let body = null;
      try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
      const url = new URL(req.url, "http://stub");
      requests.push({
        method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body,
        auth: req.headers.authorization || null, secret: req.headers["x-internal-secret"] || null,
        realIp: req.headers["x-real-ip"] || null,
      });
      const key = Object.keys(routes).find((k) => {
        const [method, pattern] = k.split(" ");
        return method === req.method && new RegExp(`^${pattern}$`).test(url.pathname);
      });
      let answer;
      try {
        answer = key ? await routes[key](body, req, url) : { status: 404, json: { error: "Not found", code: "NOT_FOUND" } };
      } catch (err) {
        answer = { status: 500, json: { error: String(err?.message || err), code: "STUB_FAILED" } };
      }
      res.writeHead(answer.status || 200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(answer.json ?? {}));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  const waitFor = async (predicate, ms = 5_000) => {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      const hit = requests.find(predicate);
      if (hit) return hit;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("stub: the expected request never arrived");
  };

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    routes,
    waitFor,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
