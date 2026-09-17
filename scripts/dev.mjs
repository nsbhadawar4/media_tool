// Runs the backend and frontend dev servers together from the repo root.
// Zero-dependency on purpose so the root workspace stays free of tooling deps.
import { spawn, execFileSync } from "node:child_process";

const targets = ["backend", "frontend"];

let shuttingDown = false;
const children = [];

function pipe(stream, name, out) {
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) out.write(`[${name}] ${line}\n`);
  });
  stream.on("end", () => {
    if (buffer) out.write(`[${name}] ${buffer}\n`);
  });
}

/**
 * `npm run dev` is three processes deep (npm -> tsx -> node), and on Windows killing the
 * npm wrapper leaves the node server alive still holding its port, so the next start fails
 * with EADDRINUSE. taskkill /T ends the whole tree; POSIX gets the ordinary signal.
 */
function killTree(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform !== "win32") {
    child.kill();
    return;
  }
  try {
    execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } catch {
    // Already gone, or taskkill unavailable — the plain kill is the best remaining effort.
    child.kill();
  }
}

function stopAll() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) killTree(child);
}

for (const name of targets) {
  const child = spawn("npm", ["run", "dev", "--workspace", name], {
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  pipe(child.stdout, name, process.stdout);
  pipe(child.stderr, name, process.stderr);
  child.on("exit", (code) => {
    if (shuttingDown) return;
    process.stdout.write(`[${name}] exited with code ${code ?? 0}\n`);
    process.exitCode = code ?? 0;
    stopAll();
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, stopAll);
}
