import test from "node:test";
import assert from "node:assert/strict";
import { buildPowershellInvocation } from "./powershell-runner.js";

test("typed quotes and ampersands stay inside the encoded command", () => {
  const script = `$w = New-Object -ComObject wscript.shell; $w.SendKeys('say "hi" & whoami')`;
  const invocation = buildPowershellInvocation(script);
  assert.equal(invocation.shell, false);
  assert.deepEqual(invocation.args.slice(0, 3), ["-NoProfile", "-NonInteractive", "-EncodedCommand"]);
  assert.equal(invocation.args.some((arg) => arg.includes("&") || arg.includes('"')), false);
  const decoded = Buffer.from(invocation.args[3], "base64").toString("utf16le");
  assert.equal(decoded, script);
});
