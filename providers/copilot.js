const path = require('path');
const os = require('os');

const iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-2h2v2zm0-4h-2V7h2v6zm4 4h-2v-2h2v2zm0-4h-2V7h2v6z" fill="#8B5CF6" stroke="none"/></svg>`;

function validateShellArg(value, name) {
  if (/[;&|`$(){}!#\n\r]/.test(value)) throw new Error(`Invalid characters in ${name}`);
}

function buildCommand(sessionId, isNew, sessionOptions) {
  let cmd = isNew ? `copilot` : `copilot --resume=${sessionId}`;

  if (sessionOptions) {
    if (sessionOptions.dangerouslySkipPermissions) {
      cmd += ' --yolo';
    } else if (sessionOptions.permissionMode) {
      const validModes = ['interactive', 'plan', 'autopilot'];
      if (validModes.includes(sessionOptions.permissionMode)) {
        validateShellArg(sessionOptions.permissionMode, 'permissionMode');
        cmd += ` --mode "${sessionOptions.permissionMode}"`;
      }
    }
    if (sessionOptions.allowAllTools) {
      cmd += ' --allow-all-tools';
    }
    if (sessionOptions.addDirs) {
      const dirs = sessionOptions.addDirs.split(',').map(d => d.trim()).filter(Boolean);
      for (const dir of dirs) {
        validateShellArg(dir, 'addDirs');
        cmd += ` --add-dir "${dir}"`;
      }
    }
  }

  if (sessionOptions?.appendSystemPrompt) {
    console.warn('[copilot] --append-system-prompt is not supported by Copilot CLI, ignoring');
  }

  if (sessionOptions?.preLaunchCmd) {
    cmd = sessionOptions.preLaunchCmd + ' ' + cmd;
  }

  return cmd;
}

function getApprovalModes() {
  return [
    { value: null, label: 'Default', desc: 'Interactive mode with permission prompts' },
    { value: 'autopilot', label: 'Autopilot', desc: 'Run autonomously without asking questions' },
    { value: 'plan', label: 'Plan', desc: 'Plan changes without executing' },
  ];
}

function getDangerousMode() {
  return { value: 'dangerouslySkipPermissions', label: 'YOLO', desc: 'Enable all permissions (tools, paths, URLs)' };
}

function getSettingsFields() {
  return [
    { key: 'allowAllTools', type: 'toggle', label: 'Allow All Tools', desc: 'Auto-approve all tool executions' },
  ];
}

function getEnvVars() {
  return {};
}

module.exports = {
  id: 'copilot',
  name: 'Copilot',
  configDir: path.join(os.homedir(), '.copilot'),
  binary: 'copilot',
  supportsMcp: false,
  supportsResume: true,
  supportsFork: false,
  supportsSessionLogs: true,
  iconSvg,
  buildCommand,
  getApprovalModes,
  getDangerousMode,
  getSettingsFields,
  getEnvVars,
};
