const claude = require('./claude');
const codex = require('./codex');
const copilot = require('./copilot');

const providers = { claude, codex, copilot };

function getProvider(id) {
  return providers[id] || providers.claude;
}

function getAllProviders() {
  return Object.values(providers);
}

module.exports = { providers, getProvider, getAllProviders };
