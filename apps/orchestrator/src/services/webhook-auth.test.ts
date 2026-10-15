import test from "node:test";
import assert from "node:assert/strict";
import { webhookAuthorized } from "./webhook-auth.js";

test("phone and VAPI tool routes require a configured secret", () => {
  assert.equal(webhookAuthorized({ "x-vapi-secret": "s3cret" }, {}), false);
  assert.equal(webhookAuthorized({}, { VAPI_WEBHOOK_SECRET: "s3cret" }), false);
  assert.equal(webhookAuthorized({ "x-vapi-secret": "s3cret" }, { VAPI_WEBHOOK_SECRET: "s3cret" }), true);
  assert.equal(
    webhookAuthorized({ authorization: "Bearer s3cret" }, { RECEPTIONIST_WEBHOOK_SECRET: "s3cret" }),
    true
  );
  assert.equal(webhookAuthorized({ authorization: "Bearer wrong" }, { VAPI_WEBHOOK_SECRET: "s3cret" }), false);
});
