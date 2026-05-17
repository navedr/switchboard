const path = require("path");
const os = require("os");
const { execFile } = require("child_process");

const DEFAULT_CLAUDE_DIR = path.join(os.homedir(), ".claude");
const cache = new Map();
const pending = new Map();

const SENTINEL_RE = /__CONFIGDIR__(.+)__END__/;

function execShell(shell, args, cwd) {
    return new Promise(resolve => {
        execFile(
            shell,
            args,
            {
                cwd,
                timeout: 3000,
                encoding: "utf8",
                env: { ...process.env, HOME: os.homedir() },
                stdio: ["pipe", "pipe", "pipe"],
            },
            (err, stdout) => {
                if (err) return resolve("");
                resolve(stdout || "");
            },
        );
    });
}

async function resolveConfigDir(projectPath, shellPath) {
    if (cache.has(projectPath)) return cache.get(projectPath);
    if (pending.has(projectPath)) return pending.get(projectPath);

    const promise = _resolve(projectPath, shellPath);
    pending.set(projectPath, promise);
    try {
        return await promise;
    } finally {
        pending.delete(projectPath);
    }
}

async function _resolve(projectPath, shellPath) {
    let configDir = DEFAULT_CLAUDE_DIR;
    try {
        const shell = shellPath || process.env.SHELL || "/bin/zsh";
        const shellName = path.basename(shell);
        const isBashLike = shellName === "zsh" || shellName === "bash" || shellName === "sh";

        if (isBashLike) {
            // Strategy 1: Detect shell functions that set CLAUDE_CONFIG_DIR inline
            // (e.g. `CLAUDE_CONFIG_DIR=X command claude`). Redefine `command` to
            // capture the var. Use -i so .zshrc/.bashrc functions load.
            // Pipe stderr to /dev/null to suppress interactive shell noise.
            const raw = await execShell(
                shell,
                ["-i", "-c", 'command() { echo "__CONFIGDIR__${CLAUDE_CONFIG_DIR}__END__"; }; claude 2>/dev/null'],
                projectPath,
            );
            const match = raw.match(SENTINEL_RE);
            if (match && match[1].trim()) {
                configDir = match[1].trim();
            }
        }

        // Strategy 2: Check plain env var (works with direnv / .envrc / export)
        if (configDir === DEFAULT_CLAUDE_DIR) {
            const raw2 = await execShell(
                shellPath || process.env.SHELL || "/bin/zsh",
                ["-l", "-c", 'echo "__CONFIGDIR__${CLAUDE_CONFIG_DIR}__END__"'],
                projectPath,
            );
            const match2 = raw2.match(SENTINEL_RE);
            if (match2 && match2[1].trim()) {
                configDir = match2[1].trim();
            }
        }
    } catch {}

    cache.set(projectPath, configDir);
    return configDir;
}

function resolveConfigDirSync(projectPath) {
    if (cache.has(projectPath)) return cache.get(projectPath);
    return DEFAULT_CLAUDE_DIR;
}

function getProjectsDir(configDir) {
    return path.join(configDir, "projects");
}

function getAllKnownConfigDirs() {
    const dirs = new Set([DEFAULT_CLAUDE_DIR]);
    for (const dir of cache.values()) {
        dirs.add(dir);
    }
    return [...dirs];
}

function clearCache() {
    cache.clear();
}

module.exports = {
    resolveConfigDir,
    resolveConfigDirSync,
    getProjectsDir,
    getAllKnownConfigDirs,
    clearCache,
    DEFAULT_CLAUDE_DIR,
};
