// -----------------------------------------------------------
//  [*] zodSetup — zod without its JIT probe
//
//  zod (inside the chat's AI SDK and assistant-ui) probes
//  `new Function` to decide whether to JIT-compile its
//  parsers; under the production CSP (script-src 'self') the
//  probe is blocked AND reported as a CSP violation. jitless
//  mode skips the probe and parses interpreted. It must be set
//  before the first schema runs, so the chat route's lazy
//  loader (router.jsx) imports this module together with the
//  chat page — and the pages without zod never load it.
// -----------------------------------------------------------

import { config } from 'zod';


// Module side effect on purpose: importing is configuring
config({ jitless: true });
