// Starts the dev server and worker for end-to-end tests: mail goes to Mailpit
// (localhost:1025), whatever SMTP the root .env configures. The .env loaders
// never override variables that are already set, so these win.
import { spawn } from "node:child_process";

const env = {
  ...process.env,
  SMTP_HOST: "localhost",
  SMTP_PORT: "1025",
  SMTP_USER: "",
  SMTP_PASSWORD: "",
  MAIL_FROM: "StageDesk <no-reply@stagedesk.local>",
};
const child = spawn("pnpm", ["dev"], { env, stdio: "inherit", shell: process.platform === "win32" });
child.on("exit", (code) => process.exit(code ?? 0));
