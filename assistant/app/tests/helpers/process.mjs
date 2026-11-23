// -----------------------------------------------------------
//  [*] Tests — child node processes
//
//  config.js reads the environment once per process and
//  server.js is a process, so both are tested by spawning
//  node with a crafted environment. A child inherits only
//  PATH, HOME and NODE_ENV, plus the test's own variables, so
//  neither env.mjs's values nor the container's own settings
//  leak in. It runs from the app root, so its paths resolve
//  as in the image.
//
//  Split into:
//
//    APP_ROOT  — the app directory (tests/..)
//    baseEnv   — the inherited minimum
//    runNode   — a module script run to its end
//    spawnNode — a long-lived child with output helpers
//    freePort  — a port nothing listens on
// -----------------------------------------------------------

import { spawn } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";


// The app directory: this file sits in tests/helpers/
export const APP_ROOT = fileURLToPath(new URL("../../", import.meta.url));







// -----------------------------------------------------------
// baseEnv
// -----------------------------------------------------------
//
// The environment every child starts from: PATH, HOME and
// NODE_ENV from this process, then the test's own variables.
//
// Used by:
//   - runNode, spawnNode (below)
// -----------------------------------------------------------

function baseEnv(env) {
  const inherited = {};
  for (const name of ["PATH", "HOME", "NODE_ENV"]) {
    if (process.env[name] !== undefined) inherited[name] = process.env[name];
  }
  return { ...inherited, ...env };
}







// -----------------------------------------------------------
// runNode
// -----------------------------------------------------------
//
// Runs a script as an ES module in a child node and resolves
// with its exit code, signal and output once it ends. A child
// still running after timeoutMs is killed, so a hang fails
// that test instead of stalling the run.
//
// Used by:
//   - tests/config.test.mjs, tests/internal-auth.test.mjs
// -----------------------------------------------------------

export function runNode(script, { env = {}, timeoutMs = 20_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", script], {
      cwd: APP_ROOT, env: baseEnv(env), stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("error", reject);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr });
    });
  });
}







// -----------------------------------------------------------
// spawnNode
// -----------------------------------------------------------
//
// A long-lived child, such as server.js under test.
// waitForOutput polls the combined output until a pattern
// shows up, and rejects with the output so far when it never
// does or the child exits first; exited resolves with the
// exit code and signal. Every child is SIGKILLed after
// timeoutMs as a safety net.
//
// Used by:
//   - tests/server.test.mjs
// -----------------------------------------------------------

export function spawnNode(args, { env = {}, timeoutMs = 60_000 } = {}) {
  const child = spawn(process.execPath, args, { cwd: APP_ROOT, env: baseEnv(env), stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  let combined = "";
  let done = null;
  child.stdout.on("data", (chunk) => { stdout += chunk; combined += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; combined += chunk; });
  const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
  const exited = new Promise((resolve) => {
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      done = { code, signal };
      resolve(done);
    });
  });

  const waitForOutput = async (pattern, ms = 15_000) => {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      const match = combined.match(pattern);
      if (match) return match;
      if (done) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`child output never matched ${pattern} (exit: ${JSON.stringify(done)}):\n${combined}`);
  };

  return {
    child,
    exited,
    waitForOutput,
    stdout: () => stdout,
    stderr: () => stderr,
    output: () => combined,
    kill: (signal = "SIGTERM") => child.kill(signal),
  };
}







// -----------------------------------------------------------
// freePort
// -----------------------------------------------------------
//
// A TCP port that was free a moment ago, for a child that
// must be told its PORT up front (its log line names it).
//
// Used by:
//   - tests/server.test.mjs
// -----------------------------------------------------------

export async function freePort() {
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}
