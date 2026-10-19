// Registers the notes server to start (hidden) when you log in to Windows. No admin rights needed:
// it drops a small .vbs launcher in your Startup folder.
//   npm run startup:install    – register and start it now
//   npm run startup:uninstall  – unregister and stop it
import { execSync, spawn } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const action = process.argv[2];

if (process.platform !== "win32") {
  console.error("This script sets up Windows login startup. On other systems, run `npm start` with your own service manager.");
  process.exit(1);
}

const startupDir = path.join(process.env.APPDATA, "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
const launcher = path.join(startupDir, "work-notes.vbs");

function readPort() {
  try {
    process.loadEnvFile(path.join(root, ".env"));
  } catch {}
  return Number(process.env.PORT ?? 4747);
}

function stopRunningServer() {
  const port = readPort();
  try {
    execSync(
      `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"`,
      { stdio: "ignore" },
    );
  } catch {}
}

if (action === "install") {
  if (!existsSync(path.join(root, "dist", "index.html"))) {
    console.error("Build the UI first: npm run build");
    process.exit(1);
  }
  const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
  const log = path.join(root, "server.log");
  const command = `cmd /c "cd /d "${root}" && "${process.execPath}" "${tsx}" server\\index.ts >> "${log}" 2>&1"`;
  // In VBScript string literals a quote is written as "". Window style 0 = hidden.
  const vbs = `Set shell = CreateObject("WScript.Shell")\r\nshell.Run "${command.replaceAll('"', '""')}", 0, False\r\n`;
  writeFileSync(launcher, vbs);
  stopRunningServer();
  spawn("wscript.exe", [launcher], { detached: true, stdio: "ignore" }).unref();
  console.log(`Installed ${launcher}`);
  console.log(`The server is starting now and will start automatically when you log in.`);
  console.log(`Open http://localhost:${readPort()} (logs: ${log})`);
} else if (action === "uninstall") {
  rmSync(launcher, { force: true });
  stopRunningServer();
  console.log("Removed the login startup entry and stopped the server.");
} else {
  console.error("Usage: node scripts/startup.mjs install|uninstall");
  process.exit(1);
}
