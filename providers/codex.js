const path = require('path');
const os = require('os');

const iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24"><path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" fill="#10a37f" stroke="none"/></svg>`;

function validateShellArg(value, name) {
  if (/[;&|`$(){}]/.test(value)) throw new Error(`Invalid characters in ${name}`);
}

const isWindows = process.platform === 'win32';

function resolveBinDir() {
  const { execFileSync } = require('child_process');
  try {
    if (isWindows) {
      const out = execFileSync('where', ['codex'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
      return out ? path.dirname(out) : null;
    }
    const bin = execFileSync('bash', ['-l', '-c', 'which codex'], { encoding: 'utf8' }).trim();
    return bin ? path.dirname(bin) : null;
  } catch {
    return null;
  }
}

let _binDir;
function getBinDir() {
  if (_binDir === undefined) _binDir = resolveBinDir();
  return _binDir;
}

function getPathPrefix() {
  const dir = getBinDir();
  if (!dir) return '';
  // On Windows, codex is typically installed globally via npm and already on PATH.
  // Skip the prefix — the `where codex` check confirms it's findable.
  if (isWindows) return '';
  return `PATH="${dir}:$PATH" `;
}

function buildCommand(sessionId, isNew, sessionOptions) {
  const pfx = getPathPrefix();
  let cmd;
  if (sessionOptions?.forkFrom) {
    cmd = `${pfx}codex --no-alt-screen fork "${sessionOptions.forkFrom}"`;
  } else if (isNew) {
    cmd = `${pfx}codex --no-alt-screen`;
  } else {
    cmd = `${pfx}codex --no-alt-screen resume "${sessionId}"`;
  }

  if (sessionOptions) {
    if (sessionOptions.dangerouslySkipPermissions) {
      cmd += ' --dangerously-bypass-approvals-and-sandbox';
    } else if (sessionOptions.approvalPolicy || sessionOptions.permissionMode) {
      const policy = sessionOptions.approvalPolicy || sessionOptions.permissionMode;
      const validPolicies = ['on-request', 'never'];
      if (validPolicies.includes(policy)) {
        validateShellArg(policy, 'approvalPolicy');
        cmd += ` -a "${policy}"`;
      }
    }
    if (sessionOptions.addDirs) {
      const dirs = sessionOptions.addDirs.split(',').map(d => d.trim()).filter(Boolean);
      for (const dir of dirs) {
        validateShellArg(dir, 'addDirs');
        cmd += ` --add-dir "${dir}"`;
      }
    }
  }

  if (sessionOptions?.preLaunchCmd) {
    cmd = sessionOptions.preLaunchCmd + ' ' + cmd;
  }

  return cmd;
}

function getApprovalModes() {
  return [
    { value: null, label: 'Default', desc: 'Prompt for all actions' },
    { value: 'on-request', label: 'On Request', desc: 'Ask before executing commands' },
    { value: 'never', label: 'Never', desc: 'Never ask for approval' },
  ];
}

function getDangerousMode() {
  return { value: 'dangerouslySkipPermissions', label: 'Bypass Sandbox', desc: 'Bypass all approvals and sandbox (use with caution)' };
}

function getSettingsFields() {
  return [
    { key: 'noAltScreen', type: 'toggle', label: 'No Alt Screen', desc: 'Disable alternate screen mode' },
  ];
}

function getEnvVars() {
  return {};
}

module.exports = {
  id: 'codex',
  name: 'Codex',
  configDir: path.join(os.homedir(), '.codex'),
  binary: 'codex',
  supportsMcp: false,
  supportsResume: true,
  supportsFork: true,
  supportsSessionLogs: true,
  iconSvg,
  buildCommand,
  getApprovalModes,
  getDangerousMode,
  getSettingsFields,
  getEnvVars,
};
