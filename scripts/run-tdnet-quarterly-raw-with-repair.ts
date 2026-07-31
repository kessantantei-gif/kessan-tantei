import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { spawnSync } from "node:child_process";

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
  });
  return result.status ?? 1;
}

const args = process.argv.slice(2);
const syncExit = run("npm", ["run", "sync:tdnet-quarterly:core", "--", ...args]);
if (syncExit !== 0) {
  process.exit(syncExit);
}

const repairExit = run("npm", ["run", "repair:tdnet-text-block", "--", ...args]);
if (repairExit !== 0) {
  process.exit(repairExit);
}
