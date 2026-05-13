/**
 * file-tree.js — Sidebar file tree panel for Switchboard.
 *
 * Renders a lazy-loaded tree of files for the active session's project
 * directory. Files dispatch an `open-file-request` event when clicked.
 *
 * Globals expected: window.api, escapeHtml, fuzzyScore
 */

const fileTreeContent = document.getElementById("file-tree-content");
let currentTreeProjectPath = null;
let expandedDirs = new Set();
let fileTreeFilter = "";

let fileTreeRootEl = null;
let fileTreeSearchInput = null;

function initFileTree() {
    if (!fileTreeContent) return;

    while (fileTreeContent.firstChild) fileTreeContent.removeChild(fileTreeContent.firstChild);

    const toolbar = document.createElement("div");
    toolbar.className = "file-tree-toolbar";

    const search = document.createElement("input");
    search.type = "text";
    search.className = "file-tree-search";
    search.placeholder = "Filter files...";
    search.addEventListener("input", () => {
        fileTreeFilter = search.value || "";
        filterTree();
    });
    fileTreeSearchInput = search;
    toolbar.appendChild(search);

    const refreshBtn = document.createElement("button");
    refreshBtn.className = "file-tree-refresh";
    refreshBtn.title = "Refresh";
    refreshBtn.textContent = "↻";
    refreshBtn.addEventListener("click", () => {
        const path = currentTreeProjectPath;
        expandedDirs.clear();
        currentTreeProjectPath = null;
        loadFileTree(path);
    });
    toolbar.appendChild(refreshBtn);

    const collapseBtn = document.createElement("button");
    collapseBtn.className = "file-tree-collapse-all";
    collapseBtn.title = "Collapse all";
    collapseBtn.textContent = "⊟";
    collapseBtn.addEventListener("click", () => {
        expandedDirs.clear();
        const path = currentTreeProjectPath;
        currentTreeProjectPath = null;
        loadFileTree(path);
    });
    toolbar.appendChild(collapseBtn);

    fileTreeContent.appendChild(toolbar);

    fileTreeRootEl = document.createElement("div");
    fileTreeRootEl.className = "file-tree-root";
    fileTreeContent.appendChild(fileTreeRootEl);
}

function showMessage(text) {
    if (!fileTreeRootEl) return;
    while (fileTreeRootEl.firstChild) fileTreeRootEl.removeChild(fileTreeRootEl.firstChild);
    const msg = document.createElement("div");
    msg.className = "file-tree-message";
    msg.textContent = text;
    fileTreeRootEl.appendChild(msg);
}

async function loadFileTree(projectPath) {
    if (!fileTreeRootEl) return;

    if (projectPath && projectPath === currentTreeProjectPath && fileTreeRootEl.querySelector(".tree-node")) {
        return;
    }

    currentTreeProjectPath = projectPath || null;

    while (fileTreeRootEl.firstChild) fileTreeRootEl.removeChild(fileTreeRootEl.firstChild);

    if (!projectPath) {
        showMessage("Select a session to browse files");
        return;
    }

    let result;
    try {
        result = await window.api.listDirectory(projectPath);
    } catch (err) {
        showMessage("Error: " + (err && err.message ? err.message : String(err)));
        return;
    }

    if (!result || result.error) {
        showMessage("Error: " + (result && result.error ? result.error : "failed to list directory"));
        return;
    }

    const entries = Array.isArray(result) ? result : [];
    if (entries.length === 0) {
        showMessage("Empty directory");
        return;
    }

    renderEntries(entries, fileTreeRootEl, 0);

    // Restore previously expanded directories
    for (const node of fileTreeRootEl.querySelectorAll('.tree-node[data-is-dir="1"]')) {
        const p = node.getAttribute("data-path");
        if (expandedDirs.has(p)) {
            const childrenEl = node.querySelector(":scope > .tree-children");
            const arrow = node.querySelector(":scope > .tree-node-header > .tree-expand-arrow");
            if (childrenEl && !childrenEl.dataset.loaded) {
                const depth = parseInt(node.getAttribute("data-depth"), 10) || 0;
                // Temporarily remove from set so expandDirectory re-adds and re-fetches
                expandedDirs.delete(p);
                expandDirectory(p, childrenEl, depth, arrow);
            }
        }
    }

    filterTree();
}

function sortEntries(entries) {
    return entries.slice().sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
}

function renderEntries(entries, container, depth) {
    const sorted = sortEntries(entries);
    for (const entry of sorted) {
        container.appendChild(createTreeNode(entry, depth));
    }
}

function createTreeNode(entry, depth) {
    const node = document.createElement("div");
    node.className = "tree-node";
    node.setAttribute("data-path", entry.path);
    node.setAttribute("data-name", entry.name);
    node.setAttribute("data-depth", String(depth));
    node.setAttribute("data-is-dir", entry.isDirectory ? "1" : "0");

    const header = document.createElement("div");
    header.className = "tree-node-header";
    header.style.paddingLeft = depth * 16 + 8 + "px";

    const arrow = document.createElement("span");
    arrow.className = "tree-expand-arrow";
    if (entry.isDirectory) {
        arrow.textContent = "▸";
    } else {
        arrow.textContent = "";
        arrow.style.visibility = "hidden";
    }
    header.appendChild(arrow);

    const icon = document.createElement("span");
    icon.className = "tree-icon";
    icon.textContent = entry.isDirectory ? "📁" : "📄";
    header.appendChild(icon);

    const name = document.createElement("span");
    name.className = "tree-name";
    name.textContent = entry.name;
    header.appendChild(name);

    node.appendChild(header);

    if (entry.isDirectory) {
        const children = document.createElement("div");
        children.className = "tree-children";
        children.style.display = "none";
        node.appendChild(children);

        header.addEventListener("click", e => {
            e.stopPropagation();
            if (expandedDirs.has(entry.path)) {
                collapseDirectory(entry.path, children, arrow);
            } else {
                expandDirectory(entry.path, children, depth, arrow);
            }
        });
    } else {
        header.addEventListener("click", e => {
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent("open-file-request", { detail: { filePath: entry.path } }));
        });
    }

    return node;
}

async function expandDirectory(dirPath, childrenContainer, depth, arrowEl) {
    expandedDirs.add(dirPath);
    if (arrowEl) {
        arrowEl.textContent = "▾";
        arrowEl.classList.add("expanded");
    }

    // Clear before fetching to keep fresh
    while (childrenContainer.firstChild) childrenContainer.removeChild(childrenContainer.firstChild);

    let result;
    try {
        result = await window.api.listDirectory(dirPath);
    } catch (err) {
        const errEl = document.createElement("div");
        errEl.className = "tree-error";
        errEl.style.paddingLeft = (depth + 1) * 16 + 8 + "px";
        errEl.textContent = "Error: " + (err && err.message ? err.message : String(err));
        childrenContainer.appendChild(errEl);
        childrenContainer.style.display = "";
        childrenContainer.dataset.loaded = "1";
        return;
    }

    if (!result || result.error) {
        const errEl = document.createElement("div");
        errEl.className = "tree-error";
        errEl.style.paddingLeft = (depth + 1) * 16 + 8 + "px";
        errEl.textContent = "Error: " + (result && result.error ? result.error : "failed to list directory");
        childrenContainer.appendChild(errEl);
        childrenContainer.style.display = "";
        childrenContainer.dataset.loaded = "1";
        return;
    }

    const entries = Array.isArray(result) ? result : [];
    renderEntries(entries, childrenContainer, depth + 1);
    childrenContainer.style.display = "";
    childrenContainer.dataset.loaded = "1";

    // Recursively restore expanded children
    for (const childNode of childrenContainer.querySelectorAll(':scope > .tree-node[data-is-dir="1"]')) {
        const p = childNode.getAttribute("data-path");
        if (expandedDirs.has(p)) {
            const grandChildren = childNode.querySelector(":scope > .tree-children");
            const childArrow = childNode.querySelector(":scope > .tree-node-header > .tree-expand-arrow");
            if (grandChildren) {
                expandedDirs.delete(p);
                expandDirectory(p, grandChildren, depth + 1, childArrow);
            }
        }
    }

    filterTree();
}

function collapseDirectory(dirPath, childrenContainer, arrowEl) {
    // Remove dirPath and any descendants from expandedDirs
    const prefix = dirPath.endsWith("/") ? dirPath : dirPath + "/";
    for (const p of Array.from(expandedDirs)) {
        if (p === dirPath || p.startsWith(prefix)) expandedDirs.delete(p);
    }

    childrenContainer.style.display = "none";
    while (childrenContainer.firstChild) childrenContainer.removeChild(childrenContainer.firstChild);
    delete childrenContainer.dataset.loaded;

    if (arrowEl) {
        arrowEl.textContent = "▸";
        arrowEl.classList.remove("expanded");
    }
}

function filterTree() {
    if (!fileTreeRootEl) return;
    const filter = (fileTreeFilter || "").trim();
    const allNodes = fileTreeRootEl.querySelectorAll(".tree-node");

    if (!filter) {
        for (const node of allNodes) node.style.display = "";
        return;
    }

    const matched = new Set();
    for (const node of allNodes) {
        const name = node.getAttribute("data-name") || "";
        let score = 0;
        try {
            score =
                typeof fuzzyScore === "function"
                    ? fuzzyScore(filter, name)
                    : name.toLowerCase().includes(filter.toLowerCase())
                      ? 1
                      : 0;
        } catch (e) {
            score = name.toLowerCase().includes(filter.toLowerCase()) ? 1 : 0;
        }
        if (score > 0) {
            matched.add(node);
            // Add all ancestors
            let parent = node.parentElement;
            while (parent && parent !== fileTreeRootEl) {
                if (parent.classList && parent.classList.contains("tree-node")) {
                    matched.add(parent);
                }
                parent = parent.parentElement;
            }
        }
    }

    for (const node of allNodes) {
        node.style.display = matched.has(node) ? "" : "none";
    }
}

initFileTree();

window.loadFileTree = loadFileTree;
