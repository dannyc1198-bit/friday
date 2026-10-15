import test from "node:test";
import assert from "node:assert/strict";
import {
  issueScopedToken,
  orchestratorHostAllowed,
  originAllowed,
  verifyScopedToken,
  voiceUpgradeDecision,
  webHostAllowed,
} from "./access-gate.js";

const env = { PORT: "3001", FRIDAY_BIND_HOST: "127.0.0.1" } as NodeJS.ProcessEnv;
const secret = "test-secret";
const now = 1_700_000_000_000;

test("voice upgrades require an exact origin, host, and scoped token", () => {
  const token = issueScopedToken({ scope: "voice", secret, now, ttlMs: 60_000 });
  assert.equal(
    voiceUpgradeDecision({
      origin: "http://localhost:3000",
      host: "localhost:3001",
      token,
      secret,
      now,
      env,
    }).ok,
    true
  );
  assert.equal(
    voiceUpgradeDecision({
      origin: "https://evil.example",
      host: "localhost:3001",
      token,
      secret,
      now,
      env,
    }).ok,
    false
  );
  assert.equal(
    voiceUpgradeDecision({
      origin: "http://localhost:3000",
      host: "localhost:3001",
      token: "",
      secret,
      now,
      env,
    }).ok,
    false
  );
  assert.equal(verifyScopedToken(token, "hud", secret, now).ok, false);
  assert.equal(originAllowed(undefined, env), false);
  assert.equal(webHostAllowed("localhost:3000", env), true);
  assert.equal(orchestratorHostAllowed("localhost:3001", env), true);
  assert.equal(orchestratorHostAllowed("evil.example:3001", env), false);
});

test("an expired voice token is rejected", () => {
  const token = issueScopedToken({ scope: "voice", secret, now, ttlMs: 1000 });
  assert.equal(verifyScopedToken(token, "voice", secret, now + 1000).ok, false);
});
