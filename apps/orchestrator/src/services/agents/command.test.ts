import test from "node:test";
import assert from "node:assert/strict";
import {
  codexExecArgs,
  gitResetHardArgs,
  spawnSpec,
  splitWindowsCommandLine,
  windowsCommandLine,
} from "./command.js";

test("git reset --hard stays a subcommand flag when the command line is quoted", () => {
  const args = gitResetHardArgs("abc1234");
  assert.deepEqual(args, ["reset", "--hard", "abc1234"]);
  const line = windowsCommandLine("git", args);
  const tokens = splitWindowsCommandLine(line);
  assert.deepEqual(tokens, ["git", "reset", "--hard", "abc1234"]);
  assert.ok(tokens.indexOf("reset") < tokens.indexOf("--hard"));

  const leaked = "Bash(git reset --hard *)";
  const naive = ["codex", "exec", leaked].join(" ").split(" ");
  assert.ok(naive.includes("--hard"));
  const parsed = splitWindowsCommandLine(windowsCommandLine("codex", ["exec", leaked]));
  assert.equal(parsed.includes("--hard"), false);
  assert.equal(parsed[parsed.length - 1], leaked);
});

test("codex exec closes stdin and keeps the task as one argument", () => {
  const task = "reset the branch --hard now";
  const args = codexExecArgs(task);
  assert.equal(args[0], "exec");
  assert.equal(args[args.length - 1], task);
  const spec = spawnSpec("codex", args, "win32", "ignore");
  assert.equal(spec.shell, false);
  assert.equal(spec.stdin, "ignore");
  assert.equal(spec.windowsVerbatimArguments, true);
  const tokens = splitWindowsCommandLine(spec.args[spec.args.length - 1]);
  assert.equal(tokens[tokens.length - 1], task);
  assert.equal(tokens.slice(0, -1).includes("--hard"), false);
  assert.throws(() => gitResetHardArgs("--hard"), /unexpected sha/);
});
