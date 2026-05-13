/**
 * git-panel.js — Renderer-side git integration panel for Switchboard.
 *
 * Shows current branch, dirty/clean status, changed files, and recent commits
 * for the active session's project. Lives in the terminal area between
 * terminal-header and grid-viewer.
 *
 * Globals expected: window.api, escapeHtml (utils.js)
 */

const gitPanel = document.getElementById("git-panel");
let gitCache = new Map(); // projectPath → {data, timestamp}
const GIT_CACHE_TTL = 10000;
let gitPanelExpanded = localStorage.getItem("gitPanelExpanded") === "1";
let currentGitProjectPath = null;

// DOM refs populated by initGitPanel()
let gitHeaderEl = null;
let gitBranchNameEl = null;
let gitStatusBadgeEl = null;
let gitExpandArrowEl = null;
let gitRefreshBtn = null;
let gitBodyEl = null;
let gitChangedListEl = null;
let gitCommitsListEl = null;

const SVG_NS = "http://www.w3.org/2000/svg";

function makeSvg(pathD, size = 12) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("fill", "currentColor");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", pathD);
    svg.appendChild(path);
    return svg;
}

const BRANCH_ICON_D =
    "M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM3.5 3.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0z";
const REFRESH_ICON_D =
    "M8 3a5 5 0 0 1 4.546 2.914.75.75 0 1 0 1.362-.628A6.5 6.5 0 0 0 1.5 8H.75a.25.25 0 0 0-.177.427l2 2a.25.25 0 0 0 .354 0l2-2A.25.25 0 0 0 4.75 8H3a5 5 0 0 1 5-5zm0 10a5 5 0 0 1-4.546-2.914.75.75 0 1 0-1.362.628A6.5 6.5 0 0 0 14.5 8h.75a.25.25 0 0 0 .177-.427l-2-2a.25.25 0 0 0-.354 0l-2 2A.25.25 0 0 0 11.25 8H13a5 5 0 0 1-5 5z";

function joinPath(base, rel) {
    if (!base) return rel;
    if (!rel) return base;
    const sep = window.api && window.api.platform === "win32" ? "\\" : "/";
    const trimmed = base.replace(/[\\/]+$/, "");
    const relNorm = rel.replace(/^[\\/]+/, "");
    return trimmed + sep + relNorm;
}

function initGitPanel() {
    if (!gitPanel) return;

    // Header
    gitHeaderEl = document.createElement("div");
    gitHeaderEl.id = "git-panel-header";

    const branchIcon = document.createElement("span");
    branchIcon.className = "git-branch-icon";
    branchIcon.appendChild(makeSvg(BRANCH_ICON_D));

    gitBranchNameEl = document.createElement("span");
    gitBranchNameEl.className = "git-branch-name";

    gitStatusBadgeEl = document.createElement("span");
    gitStatusBadgeEl.className = "git-status-badge";

    const spacer = document.createElement("span");
    spacer.style.flex = "1";

    gitRefreshBtn = document.createElement("button");
    gitRefreshBtn.id = "git-panel-refresh";
    gitRefreshBtn.type = "button";
    gitRefreshBtn.title = "Refresh";
    gitRefreshBtn.appendChild(makeSvg(REFRESH_ICON_D));

    gitExpandArrowEl = document.createElement("span");
    gitExpandArrowEl.className = "git-expand-arrow";
    gitExpandArrowEl.textContent = "▶";
    if (gitPanelExpanded) gitExpandArrowEl.classList.add("expanded");

    gitHeaderEl.appendChild(branchIcon);
    gitHeaderEl.appendChild(gitBranchNameEl);
    gitHeaderEl.appendChild(gitStatusBadgeEl);
    gitHeaderEl.appendChild(spacer);
    gitHeaderEl.appendChild(gitRefreshBtn);
    gitHeaderEl.appendChild(gitExpandArrowEl);

    // Body
    gitBodyEl = document.createElement("div");
    gitBodyEl.id = "git-panel-body";
    gitBodyEl.style.display = gitPanelExpanded ? "" : "none";

    const changedSection = document.createElement("div");
    changedSection.className = "git-section";
    const changedTitle = document.createElement("div");
    changedTitle.className = "git-section-title";
    changedTitle.textContent = "Changed Files";
    gitChangedListEl = document.createElement("div");
    gitChangedListEl.className = "git-changed-files-list";
    changedSection.appendChild(changedTitle);
    changedSection.appendChild(gitChangedListEl);

    const commitsSection = document.createElement("div");
    commitsSection.className = "git-section";
    const commitsTitle = document.createElement("div");
    commitsTitle.className = "git-section-title";
    commitsTitle.textContent = "Recent Commits";
    gitCommitsListEl = document.createElement("div");
    gitCommitsListEl.className = "git-commits-list";
    commitsSection.appendChild(commitsTitle);
    commitsSection.appendChild(gitCommitsListEl);

    gitBodyEl.appendChild(changedSection);
    gitBodyEl.appendChild(commitsSection);

    gitPanel.appendChild(gitHeaderEl);
    gitPanel.appendChild(gitBodyEl);

    // Wire events
    gitHeaderEl.addEventListener("click", e => {
        if (e.target.closest("#git-panel-refresh")) return;
        gitPanelExpanded = !gitPanelExpanded;
        localStorage.setItem("gitPanelExpanded", gitPanelExpanded ? "1" : "0");
        gitBodyEl.style.display = gitPanelExpanded ? "" : "none";
        gitExpandArrowEl.classList.toggle("expanded", gitPanelExpanded);
    });

    gitRefreshBtn.addEventListener("click", e => {
        e.stopPropagation();
        if (currentGitProjectPath) {
            gitCache.delete(currentGitProjectPath);
            refreshGitPanel(currentGitProjectPath);
        }
    });
}

function statusClass(s) {
    if (s === "M") return "modified";
    if (s === "A") return "added";
    if (s === "D") return "deleted";
    return "untracked";
}

function renderGitData(projectPath, data) {
    const { status, log } = data;
    const branch = (status && status.branch) || "(detached)";
    gitBranchNameEl.textContent = branch;

    const clean = !!(status && status.clean);
    gitStatusBadgeEl.classList.toggle("clean", clean);
    gitStatusBadgeEl.classList.toggle("dirty", !clean);
    gitStatusBadgeEl.textContent = clean ? "clean" : "dirty";

    // Changed files
    gitChangedListEl.replaceChildren();
    const files = status && Array.isArray(status.files) ? status.files : [];
    if (files.length === 0) {
        const empty = document.createElement("div");
        empty.className = "git-empty";
        empty.textContent = "No changes";
        gitChangedListEl.appendChild(empty);
    } else {
        for (const f of files) {
            const row = document.createElement("div");
            row.className = "git-changed-file";
            row.title = f.path;

            const badge = document.createElement("span");
            badge.className = "git-file-status " + statusClass(f.status);
            badge.textContent = f.status;

            const name = document.createElement("span");
            name.className = "git-file-name";
            name.textContent = f.path;

            row.appendChild(badge);
            row.appendChild(name);
            row.addEventListener("click", () => {
                openFileInPanel(joinPath(projectPath, f.path));
            });
            gitChangedListEl.appendChild(row);
        }
    }

    // Commits
    gitCommitsListEl.replaceChildren();
    const commits = log && Array.isArray(log.commits) ? log.commits : [];
    if (commits.length === 0) {
        const empty = document.createElement("div");
        empty.className = "git-empty";
        empty.textContent = "No commits";
        gitCommitsListEl.appendChild(empty);
    } else {
        for (const c of commits) {
            const row = document.createElement("div");
            row.className = "git-commit";

            const hash = document.createElement("span");
            hash.className = "git-commit-hash";
            hash.textContent = (c.hash || "").slice(0, 7);

            const msg = document.createElement("span");
            msg.className = "git-commit-message";
            msg.textContent = c.message || "";

            const time = document.createElement("span");
            time.className = "git-commit-time";
            time.textContent = c.relativeTime || "";

            row.title = `${c.message || ""}\n${c.author || ""} — ${c.relativeTime || ""}`;
            row.appendChild(hash);
            row.appendChild(msg);
            row.appendChild(time);
            gitCommitsListEl.appendChild(row);
        }
    }
}

async function refreshGitPanel(projectPath) {
    if (!gitPanel) return;

    if (!projectPath) {
        gitPanel.style.display = "none";
        currentGitProjectPath = null;
        return;
    }

    currentGitProjectPath = projectPath;

    const cached = gitCache.get(projectPath);
    const now = Date.now();
    if (cached && now - cached.timestamp < GIT_CACHE_TTL) {
        gitPanel.style.display = "";
        renderGitData(projectPath, cached.data);
        gitBodyEl.style.display = gitPanelExpanded ? "" : "none";
        gitExpandArrowEl.classList.toggle("expanded", gitPanelExpanded);
        return;
    }

    let status, log;
    try {
        [status, log] = await Promise.all([window.api.gitStatus(projectPath), window.api.gitLog(projectPath, 8)]);
    } catch (err) {
        gitPanel.style.display = "none";
        return;
    }

    // A project switch may have happened while awaiting — bail if so.
    if (currentGitProjectPath !== projectPath) return;

    if (!status || status.error || !log || log.error) {
        gitPanel.style.display = "none";
        return;
    }

    const data = { status, log };
    gitCache.set(projectPath, { data, timestamp: Date.now() });

    gitPanel.style.display = "";
    renderGitData(projectPath, data);
    gitBodyEl.style.display = gitPanelExpanded ? "" : "none";
    gitExpandArrowEl.classList.toggle("expanded", gitPanelExpanded);
}

function openFileInPanel(filePath) {
    if (!filePath) return;
    try {
        if (window.api && typeof window.api.readFileForPanel === "function") {
            window.api.readFileForPanel(filePath);
        }
    } catch (_) {
        /* ignore */
    }
    window.dispatchEvent(new CustomEvent("open-file-request", { detail: { filePath } }));
}

initGitPanel();

window.refreshGitPanel = refreshGitPanel;
