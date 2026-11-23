// -----------------------------------------------------------
//  [*] Assistant — the Django clients
//
//  Django is the container's only data source, through two
//  doors. publicFetch calls /api/* as the user, exactly as
//  the GUI would: the user's bearer, and the end user's
//  address so Django rate-limits and audits the real client.
//  internalFetch calls /internal/assistant/* with the shared
//  secret. Both throw an HttpError on any failure, keeping
//  Django's code and message for the tools to hand to the
//  model, rather than return a null a caller would misread.
//
//  A 401 on the public door is announced to the listeners, so
//  the identity cache drops that bearer at once. DJANGO_URL
//  and the secret are read from the environment on every
//  call, ahead of config.js, so the test stub can point the
//  client at its port after import.
//
//  Split into:
//
//    request        — one call under the shared rules
//    onUnauthorized — listen for refused bearers
//    publicFetch    — /api/* as the user
//    userClient     — publicFetch bound to one user
//    internalFetch  — /internal/assistant/* with the secret
// -----------------------------------------------------------

import { DJANGO_URL, INTERNAL_SECRET } from "../config.js";
import { HttpError } from "../middleware/errors.js";


// Milliseconds Django gets to answer — internal network, so
// a slow answer is a stuck worker, not distance. A call that
// has Django ask a model before it answers names its own
// limit (timeoutMs)
const TIMEOUT_MS = 15_000;

// Callbacks told about every bearer Django answered 401 to
const unauthorizedListeners = new Set();







// -----------------------------------------------------------
// request
// -----------------------------------------------------------
//
// One call to Django under the shared rules; the timeout
// (the default, or the call's own timeoutMs) also bounds
// reading the body. A network failure, a timeout, a
// body that breaks off or an OK answer that is not JSON is a
// 502 DJANGO_UNREACHABLE. A non-OK answer keeps its status,
// Django's code and its message, with the path and upstream
// status attached for the log. An empty OK answer is null.
//
// Used by:
//   - publicFetch, internalFetch (below)
// -----------------------------------------------------------

async function request(path, { timeoutMs = TIMEOUT_MS, ...options }) {
  const base = String(process.env.DJANGO_URL || DJANGO_URL).replace(/\/+$/, "");
  let response;
  let text;
  try {
    response = await fetch(`${base}${path}`, {
      ...options,
      signal: AbortSignal.timeout(timeoutMs),
    });
    text = await response.text();
  } catch (err) {
    throw new HttpError(502, "DJANGO_UNREACHABLE", "Backend unreachable",
                        { path, cause: err?.message });
  }

  let body = null;
  let unreadable = false;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      unreadable = true;
    }
  }
  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error
      : body?.error?.message || body?.message || `Backend answered ${response.status}`;
    const code = typeof body?.code === "string" ? body.code
      : typeof body?.error?.code === "string" ? body.error.code : "DJANGO_API_ERROR";
    throw new HttpError(response.status, code, String(message).slice(0, 500),
                        { path, upstreamStatus: response.status });
  }
  if (unreadable) {
    throw new HttpError(502, "DJANGO_UNREACHABLE", "Backend answered an unreadable body",
                        { path, upstreamStatus: response.status });
  }
  return body;
}







// -----------------------------------------------------------
// onUnauthorized
// -----------------------------------------------------------
//
// Registers a listener told the bearer of every public call
// Django refuses with a 401, and returns the function that
// unsubscribes it.
//
// Used by:
//   - services/identity.js — evicts the cached identity
// -----------------------------------------------------------

export function onUnauthorized(listener) {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}







// -----------------------------------------------------------
// publicFetch
// -----------------------------------------------------------
//
// The public API door: the bearer and the client address
// (validated by services/clientIp.js) ride as headers, and
// the body is serialized here. A 401 for a bearer is
// announced to the onUnauthorized listeners before it is
// rethrown.
//
// Used by:
//   - services/identity.js — resolveIdentity
//   - userClient (below)
// -----------------------------------------------------------

export async function publicFetch(path, { token = null, clientIp = null, body, headers = {}, ...options } = {}) {
  try {
    return await request(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(clientIp ? { "X-Real-IP": clientIp } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if (token && err instanceof HttpError && err.status === 401) {
      for (const listener of unauthorizedListeners) listener(token);
    }
    throw err;
  }
}







// -----------------------------------------------------------
// userClient
// -----------------------------------------------------------
//
// publicFetch bound to one user for one turn, with a method
// per HTTP verb, so the tools and the chat route never handle
// the bearer themselves. A sending method takes the call's
// own options last ({ timeoutMs }), for the few calls Django
// answers slowly.
//
// Used by:
//   - routes/chat.js — the POST handler builds one per turn
//     for the tools (llm/tools.js) and services/transcript.js
// -----------------------------------------------------------

export function userClient({ token, clientIp = null }) {
  const call = (method) => (path, body, options = {}) => publicFetch(path, { ...options, token, clientIp, method, body });
  return {
    get: (path) => publicFetch(path, { token, clientIp }),
    post: call("POST"),
    put: call("PUT"),
    patch: call("PATCH"),
    del: (path) => publicFetch(path, { token, clientIp, method: "DELETE" }),
  };
}







// -----------------------------------------------------------
// internalFetch
// -----------------------------------------------------------
//
// The internal door: the shared secret on every call, and the
// body serialized here, so callers hand plain objects.
//
// Used by:
//   - services/prompts.js — activePrompt
//   - services/transcript.js — saveAssistantMessage
//   - routes/chat.js — checkBudget, logTurn
//   - services/title.js — nameThread (the title, its log)
//   - llm/mcp.js — loadServers, the MCP server registry
// -----------------------------------------------------------

export function internalFetch(path, { body, headers = {}, ...options } = {}) {
  return request(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": process.env.ASSISTANT_INTERNAL_SECRET ?? INTERNAL_SECRET,
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
