const path = require('path');
const os = require('os');

const iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-2h2v2zm0-4h-2V7h2v6zm4 4h-2v-2h2v2zm0-4h-2V7h2v6z" fill="#8B5CF6" stroke="none"/></svg>`;

function buildCommand(sessionId, isNew, sessionOptions) {
  let cmd = isNew ? `copilot` : `copilot --resume "${sessionId}"`;

  if (sessionOptions?.preLaunchCmd) {
    cmd = sessionOptions.preLaunchCmd + ' ' + cmd;
  }

  return cmd;
}

function getApprovalModes() {
  return [{ value: null, label: 'Default', desc: 'Use trusted folders configuration' }];
}

function getDangerousMode() {
  return null;
}

function getSettingsFields() {
  return [];
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
