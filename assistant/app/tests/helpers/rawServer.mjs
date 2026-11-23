// -----------------------------------------------------------
//  [*] Tests — a raw HTTP double for a misbehaving Django
//
//  stubDjango.mjs always answers well-formed JSON, but the
//  Django clients must also survive a real upstream on a bad
//  day: an HTML error page, an empty body, a body cut off
//  mid-way, headers and then silence, no answer at all. Here
//  the test's handler writes the raw response itself.
// -----------------------------------------------------------

import http from "node:http";







// -----------------------------------------------------------
// startRawServer
// -----------------------------------------------------------
//
// Starts the double on a random loopback port and records
// every request with its headers and body. The handler runs
// once the body has arrived and answers however it likes, or
// never; close() drops every open connection first, so a
// handler that hangs cannot hang the test.
//
// Used by:
//   - tests/django, identity and prompts-service (.test.mjs)
// -----------------------------------------------------------

export async function startRawServer(handler) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      requests.push({ method: req.method, path: req.url, headers: req.headers, body: raw });
      handler(req, res, raw);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    requests,
    close: () => new Promise((resolve) => {
      server.closeAllConnections();
      server.close(resolve);
    }),
  };
}
