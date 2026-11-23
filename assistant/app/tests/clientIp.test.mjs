// -----------------------------------------------------------
//  [*] Tests — the end user's address (services/clientIp.js)
//
//  One hop is trusted: Caddy, which sets X-Real-IP on every
//  proxied request. The helpers run on fake requests: only a
//  plain IPv4 or IPv6 literal counts, since the value reaches
//  Django's audit and rate limits, and no other header does.
//  Then the real app with the Django stub: what Django
//  receives as X-Real-IP, and what the log line names.
// -----------------------------------------------------------

import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import "./env.mjs";
import { startStubDjango } from "./stubDjango.mjs";
import { clientIpOf, clientKeyOf } from "../services/clientIp.js";


// A thread id the status route accepts
const THREAD = "0b6f8e8c-1c2d-4e5f-8a9b-0c1d2e3f4a5b";

// The stub and the app on its random port, set up by before()
let stub;
let server;
let base;
let app;







// -----------------------------------------------------------
// fakeReq
// -----------------------------------------------------------
//
// A stand-in for the two things the helpers read from a
// request: get(), case-insensitive like Express's, and the
// socket's peer address. A null peer means no socket at all.
//
// Used by:
//   - the unit tests (below)
// -----------------------------------------------------------

function fakeReq(headers = {}, peer = "10.0.0.5") {
  const lower = Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]));
  return { get: (name) => lower[name.toLowerCase()], socket: peer === null ? undefined : { remoteAddress: peer } };
}


before(async () => {
  stub = await startStubDjango({
    "GET /api/auth/me": () => ({ json: { id: "u1", displayName: "Tomas", role: "user" } }),
  });
  process.env.DJANGO_URL = stub.url;
  const { createApp } = await import("../app.js");
  app = createApp();
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await stub.close();
});


test("clientIpOf accepts IPv4 and IPv6 literals as Caddy writes them", () => {
  const good = [
    ["203.0.113.7", "203.0.113.7"], ["  198.51.100.1  ", "198.51.100.1"], ["2001:db8::1", "2001:db8::1"],
    ["::1", "::1"], ["::ffff:192.0.2.1", "::ffff:192.0.2.1"], ["2001:0db8:0000:0000:0000:0000:0000:0001", "2001:0db8:0000:0000:0000:0000:0000:0001"],
    ["0.0.0.0", "0.0.0.0"], ["255.255.255.255", "255.255.255.255"], ["FE80::ABCD", "FE80::ABCD"],
  ];
  for (const [header, expected] of good) assert.equal(clientIpOf(fakeReq({ "X-Real-IP": header })), expected, header);
});


test("clientIpOf refuses every other shape — nothing is forwarded then (FIXED 2026-09, regression guard)", () => {
  const bad = [
    undefined, "", "   ", "unknown", "localhost", "abc", "dead:beef", "::::", "1.2.3", "999.1.1.1", "256.0.0.1",
    "1.2.3.4:443", "[2001:db8::1]:443", "[2001:db8::1]", "fe80::1%eth0", "1.2.3.4, 5.6.7.8", "1.2.3.4 5.6.7.8",
    "0x7f.0.0.1", "127.1", "1.2.3.4\u0000", `${"a:".repeat(40)}1`, "not an ip; DROP TABLE",
  ];
  for (const header of bad) {
    assert.equal(clientIpOf(fakeReq(header === undefined ? {} : { "X-Real-IP": header })), null, JSON.stringify(header));
  }
  assert.equal(clientIpOf({}), null, "a request without get() at all");
});


test("clientKeyOf: the ingress's address, else the socket peer, else 'unknown'", () => {
  assert.equal(clientKeyOf(fakeReq({ "X-Real-IP": "203.0.113.7" }, "10.0.0.5")), "203.0.113.7");
  assert.equal(clientKeyOf(fakeReq({ "X-Real-IP": "1.2.3.4:443" }, "10.0.0.5")), "10.0.0.5", "a malformed value is not the key");
  assert.equal(clientKeyOf(fakeReq({}, "::ffff:172.28.0.4")), "::ffff:172.28.0.4", "IPv6-mapped, as Node reports it");
  assert.equal(clientKeyOf(fakeReq({}, null)), "unknown", "no socket");
  assert.equal(clientKeyOf({ get: () => undefined, socket: { remoteAddress: undefined } }), "unknown", "a destroyed socket");
});


test("spoofing attempts: forwarding headers other than the ingress's X-Real-IP never count", () => {
  const spoofed = {
    "X-Forwarded-For": "6.6.6.6", Forwarded: "for=6.6.6.6", "True-Client-IP": "6.6.6.6", "CF-Connecting-IP": "6.6.6.6",
    "X-Client-IP": "6.6.6.6", "X-Cluster-Client-IP": "6.6.6.6",
  };
  assert.equal(clientIpOf(fakeReq(spoofed)), null);
  assert.equal(clientKeyOf(fakeReq(spoofed, "10.0.0.5")), "10.0.0.5");
  assert.equal(clientKeyOf(fakeReq({ ...spoofed, "X-Real-IP": "203.0.113.7" })), "203.0.113.7");
});


test("Express trusts no proxy hop: trust proxy is off for every address", () => {
  assert.equal(app.get("trust proxy"), false);
  const trust = app.get("trust proxy fn");
  for (const address of ["127.0.0.1", "10.0.0.5", "172.28.0.4", "::1", "6.6.6.6"]) {
    for (const hop of [0, 1, 2]) assert.equal(trust(address, hop), false, `${address} hop ${hop}`);
  }
});


test("through the app: the user's IP rides to Django as X-Real-IP; a spoofed shape rides nowhere", async () => {
  const cases = [
    [{ "X-Real-IP": "203.0.113.9" }, "203.0.113.9"],
    [{ "X-Real-IP": "2001:db8::42" }, "2001:db8::42"],
    [{ "X-Real-IP": "1.2.3.4:443" }, null],
    [{ "X-Forwarded-For": "6.6.6.6" }, null],
    [{ "X-Real-IP": "6.6.6.6, 203.0.113.9" }, null],
  ];
  const { resetIdentityCacheForTests } = await import("../services/identity.js");
  for (const [headers, forwarded] of cases) {
    resetIdentityCacheForTests();
    stub.requests.length = 0;
    const response = await fetch(`${base}/api/assistant/chat/${THREAD}/status`, { headers: { Authorization: "Bearer tok", ...headers } });
    assert.equal(response.status, 200, JSON.stringify(headers));
    const me = stub.requests.find((r) => r.path === "/api/auth/me");
    assert.equal(me.realIp, forwarded, JSON.stringify(headers));
  }
});


test("through the app: the log line names the ingress's address, never a forwarded one", async (t) => {
  const warnings = [];
  t.mock.method(console, "warn", (...args) => warnings.push(args.join(" ")));
  await fetch(`${base}/api/assistant/chat`, { method: "POST", headers: { "X-Forwarded-For": "6.6.6.6" } });
  await fetch(`${base}/api/assistant/chat`, { method: "POST", headers: { "X-Real-IP": "203.0.113.77", "X-Forwarded-For": "6.6.6.6" } });
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /from (::ffff:)?127\.0\.0\.1\)$/, "the socket peer");
  assert.match(warnings[1], /from 203\.0\.113\.77\)$/);
  assert.ok(warnings.every((line) => !line.includes("6.6.6.6")));
});
