// -----------------------------------------------------------
//  [*] Tests — the environment, set before config.js loads
//
//  config.js reads the environment once, as it loads, and ESM
//  runs every import before a test's own code, so a test
//  imports this module first. It sets a known internal secret
//  and a gateway that can never be reached (a .invalid host),
//  and lifts the per-user turn limit so route tests are not
//  throttled. DJANGO_URL is left to each test's stub:
//  services/django.js reads it on every call.
// -----------------------------------------------------------

process.env.ASSISTANT_INTERNAL_SECRET = "s3cret";
process.env.AI_GATEWAY_URL = "http://gateway.invalid/v1";
process.env.AI_GATEWAY_KEY = "test-key";
process.env.RATE_LIMIT_TURNS = "1000";
