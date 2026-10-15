import test from "node:test";
import assert from "node:assert/strict";
import { hudGate, signHudSession } from "./hud-session.js";

const now = 1_700_000_000_000;
const secret = "hud-secret";

test("a mutation needs a matching origin and session cookie", async () => {
  const host = "localhost:3000";
  const cookie = await signHudSession(secret, host, now);
  const allowed = await hudGate({
    method: "POST",
    host,
    origin: "http://localhost:3000",
    cookie,
    demo: null,
    secret,
    now,
    secFetchSite: "same-origin",
  });
  assert.equal(allowed.ok, true);
  const cross = await hudGate({
    method: "POST",
    host,
    origin: "https://evil.example",
    cookie,
    demo: null,
    secret,
    now,
    secFetchSite: "cross-site",
  });
  assert.equal(cross.ok, false);
  const missing = await hudGate({
    method: "POST",
    host,
    origin: "http://localhost:3000",
    cookie: null,
    demo: null,
    secret,
    now,
  });
  assert.equal(missing.status, 401);
});

test("demo mode blocks mutations and a read can mint a session", async () => {
  const demo = await hudGate({
    method: "POST",
    host: "localhost:3000",
    origin: "http://localhost:3000",
    cookie: "ignored",
    demo: "1",
    secret,
    now,
  });
  assert.equal(demo.status, 409);
  const read = await hudGate({
    method: "GET",
    host: "localhost:3000",
    origin: null,
    cookie: null,
    demo: null,
    secret,
    now,
  });
  assert.equal(read.ok, true);
  assert.ok(read.setCookie);
});
