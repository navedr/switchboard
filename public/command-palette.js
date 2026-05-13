// Command palette — Cmd/Ctrl+K to search sessions and run actions.
// Loaded before sidebar.js / app.js, so functions like openSession may not exist
// at script-eval time; we resolve them lazily inside action handlers.

let paletteVisible = false;
let paletteQuery = "";
let selectedIndex = 0;
let paletteResults = [];
let paletteEl = null;
let paletteInputEl = null;
let paletteResultsEl = null;
let paletteOverlayEl = null;
let paletteDebounceTimer = null;
let lastFocusedTerminalEl = null;

const ACTIONS = [
    {
        id: "new-session",
        label: "New Session",
        keywords: "new create session project add",
        icon: "+",
        action: () => {
            const btn = document.getElementById("add-project-btn");
            if (btn) btn.click();
        },
    },
    {
        id: "toggle-grid",
        label: "Toggle Grid View",
        keywords: "grid view layout tile",
        icon: "⊞",
        action: () => {
            if (typeof toggleGridView === "function") toggleGridView();
        },
    },
    {
        id: "open-settings",
        label: "Open Global Settings",
        keywords: "settings preferences config global",
        icon: "⚙",
        action: () => {
            if (typeof openSettingsViewer === "function") openSettingsViewer("global");
        },
    },
    {
        id: "toggle-archive",
        label: "Toggle Archived Sessions",
        keywords: "archive archived hidden show",
        icon: "📦",
        action: () => {
            const btn = document.getElementById("archive-toggle");
            if (btn) btn.click();
        },
    },
    {
        id: "switch-tab-sessions",
        label: "Switch to Sessions Tab",
        keywords: "tab sessions switch",
        icon: "",
        action: () => {
            const el = document.querySelector('[data-tab="sessions"]');
            if (el) el.click();
        },
    },
    {
        id: "switch-tab-plans",
        label: "Switch to Plans Tab",
        keywords: "tab plans switch",
        icon: "",
        action: () => {
            const el = document.querySelector('[data-tab="plans"]');
            if (el) el.click();
        },
    },
    {
        id: "switch-tab-memory",
        label: "Switch to Agent Files Tab",
        keywords: "tab memory agent files claude switch",
        icon: "",
        action: () => {
            const el = document.querySelector('[data-tab="memory"]');
            if (el) el.click();
        },
    },
    {
        id: "switch-tab-files",
        label: "Switch to Files Tab",
        keywords: "tab files switch",
        icon: "",
        action: () => {
            const el = document.querySelector('[data-tab="files"]');
            if (el) el.click();
        },
    },
    {
        id: "switch-tab-stats",
        label: "Switch to Stats Tab",
        keywords: "tab stats statistics usage switch",
        icon: "",
        action: () => {
            const el = document.querySelector('[data-tab="stats"]');
            if (el) el.click();
        },
    },
];

function basename(p) {
    if (!p) return "";
    const norm = String(p).replace(/[\\/]+$/, "");
    const idx = Math.max(norm.lastIndexOf("/"), norm.lastIndexOf("\\"));
    return idx >= 0 ? norm.slice(idx + 1) : norm;
}

function sessionLabel(session) {
    return session.name || session.summary || session.sessionId || "";
}

function sessionSearchHaystack(session) {
    const parts = [session.name || "", session.summary || "", session.firstPrompt || "", session.projectPath || ""];
    return parts.join(" ");
}

function scoreOrZero(query, target) {
    if (!query) return 0;
    if (typeof fuzzyScore !== "function") {
        return target && target.toLowerCase().includes(query.toLowerCase()) ? 1 : 0;
    }
    return fuzzyScore(query, target) || 0;
}

function defaultResults() {
    const results = [];
    const sessions = [];
    if (typeof sessionMap !== "undefined" && sessionMap && typeof sessionMap.values === "function") {
        for (const s of sessionMap.values()) sessions.push(s);
    }
    sessions.sort((a, b) => {
        const ta = new Date(a.modified || 0).getTime();
        const tb = new Date(b.modified || 0).getTime();
        return tb - ta;
    });
    const recent = sessions.slice(0, 5);
    for (const s of recent) {
        results.push({
            type: "session",
            label: sessionLabel(s),
            meta: basename(s.projectPath),
            icon: "●",
            iconRunning: typeof activePtyIds !== "undefined" && activePtyIds && activePtyIds.has(s.sessionId),
            score: 0,
            data: s,
            section: "Recent",
        });
    }
    for (const a of ACTIONS.slice(0, 5)) {
        results.push({
            type: "action",
            label: a.label,
            meta: "",
            icon: a.icon,
            score: 0,
            data: a,
            section: "Actions",
        });
    }
    return results;
}

function computeResults(query) {
    if (!query) return defaultResults();

    if (query.startsWith(">")) {
        const q = query.slice(1).trim();
        const scored = ACTIONS.map(a => {
            const target = `${a.label} ${a.keywords || ""}`;
            const score = q ? scoreOrZero(q, target) : 1;
            return { action: a, score };
        }).filter(r => r.score > 0);
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, 15).map(({ action, score }) => ({
            type: "action",
            label: action.label,
            meta: "",
            icon: action.icon,
            score,
            data: action,
            section: "Actions",
        }));
    }

    const out = [];

    if (typeof sessionMap !== "undefined" && sessionMap && typeof sessionMap.values === "function") {
        for (const s of sessionMap.values()) {
            const score = scoreOrZero(query, sessionSearchHaystack(s));
            if (score > 0) {
                out.push({
                    type: "session",
                    label: sessionLabel(s),
                    meta: basename(s.projectPath),
                    icon: "●",
                    iconRunning: typeof activePtyIds !== "undefined" && activePtyIds && activePtyIds.has(s.sessionId),
                    score,
                    data: s,
                    section: "Sessions",
                });
            }
        }
    }

    for (const a of ACTIONS) {
        const score = scoreOrZero(query, `${a.label} ${a.keywords || ""}`);
        if (score > 0) {
            out.push({
                type: "action",
                label: a.label,
                meta: "",
                icon: a.icon,
                score,
                data: a,
                section: "Actions",
            });
        }
    }

    out.sort((a, b) => b.score - a.score);
    return out.slice(0, 15);
}

function buildPaletteDom() {
    paletteOverlayEl = document.createElement("div");
    paletteOverlayEl.className = "command-palette-overlay";
    paletteOverlayEl.style.display = "none";

    paletteEl = document.createElement("div");
    paletteEl.className = "command-palette";

    paletteInputEl = document.createElement("input");
    paletteInputEl.className = "command-palette-input";
    paletteInputEl.type = "text";
    paletteInputEl.placeholder = "Search sessions, projects, actions...";
    paletteInputEl.autocomplete = "off";
    paletteInputEl.spellcheck = false;

    paletteResultsEl = document.createElement("div");
    paletteResultsEl.className = "command-palette-results";

    paletteEl.appendChild(paletteInputEl);
    paletteEl.appendChild(paletteResultsEl);
    paletteOverlayEl.appendChild(paletteEl);
    document.body.appendChild(paletteOverlayEl);

    paletteOverlayEl.addEventListener("mousedown", e => {
        if (e.target === paletteOverlayEl) hidePalette();
    });

    paletteInputEl.addEventListener("input", () => {
        paletteQuery = paletteInputEl.value;
        if (paletteDebounceTimer) clearTimeout(paletteDebounceTimer);
        paletteDebounceTimer = setTimeout(() => {
            selectedIndex = 0;
            updateResults(paletteQuery);
        }, 50);
    });

    paletteInputEl.addEventListener("keydown", e => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (paletteResults.length > 0) {
                selectedIndex = (selectedIndex + 1) % paletteResults.length;
                renderResults();
                scrollSelectedIntoView();
            }
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (paletteResults.length > 0) {
                selectedIndex = (selectedIndex - 1 + paletteResults.length) % paletteResults.length;
                renderResults();
                scrollSelectedIntoView();
            }
        } else if (e.key === "Enter") {
            e.preventDefault();
            executeSelected();
        } else if (e.key === "Escape") {
            e.preventDefault();
            hidePalette();
        }
    });
}

function scrollSelectedIntoView() {
    if (!paletteResultsEl) return;
    const sel = paletteResultsEl.querySelector(".command-palette-item.selected");
    if (sel && typeof sel.scrollIntoView === "function") {
        sel.scrollIntoView({ block: "nearest" });
    }
}

function renderResults() {
    if (!paletteResultsEl) return;
    while (paletteResultsEl.firstChild) paletteResultsEl.removeChild(paletteResultsEl.firstChild);

    let currentSection = null;
    paletteResults.forEach((r, idx) => {
        if (r.section && r.section !== currentSection) {
            currentSection = r.section;
            const header = document.createElement("div");
            header.className = "command-palette-section";
            header.textContent = currentSection;
            paletteResultsEl.appendChild(header);
        }

        const item = document.createElement("div");
        item.className = "command-palette-item" + (idx === selectedIndex ? " selected" : "");
        item.setAttribute("data-index", String(idx));

        const iconEl = document.createElement("span");
        iconEl.className = "palette-item-icon";
        if (r.type === "session" && r.iconRunning) {
            iconEl.classList.add("running");
        }
        iconEl.textContent = r.icon || "";

        const labelEl = document.createElement("span");
        labelEl.className = "palette-item-label";
        labelEl.textContent = r.label || "";

        const metaEl = document.createElement("span");
        metaEl.className = "palette-item-meta";
        metaEl.textContent = r.meta || "";

        item.appendChild(iconEl);
        item.appendChild(labelEl);
        item.appendChild(metaEl);

        item.addEventListener("mouseenter", () => {
            selectedIndex = idx;
            const prev = paletteResultsEl.querySelector(".command-palette-item.selected");
            if (prev) prev.classList.remove("selected");
            item.classList.add("selected");
        });
        item.addEventListener("mousedown", e => {
            e.preventDefault();
            selectedIndex = idx;
            executeSelected();
        });

        paletteResultsEl.appendChild(item);
    });
}

function updateResults(query) {
    paletteResults = computeResults(query);
    if (selectedIndex >= paletteResults.length) selectedIndex = 0;
    renderResults();
}

function executeSelected() {
    const r = paletteResults[selectedIndex];
    if (!r) return;
    hidePalette();
    if (r.type === "session") {
        if (typeof openSession === "function") openSession(r.data);
    } else if (r.type === "action") {
        try {
            r.data.action();
        } catch (err) {
            console.error("palette action failed", err);
        }
    }
}

function showPalette() {
    if (!paletteEl) buildPaletteDom();
    if (paletteVisible) {
        paletteInputEl.focus();
        paletteInputEl.select();
        return;
    }
    paletteVisible = true;
    lastFocusedTerminalEl =
        typeof activeSessionId !== "undefined" && activeSessionId
            ? document.querySelector(`[data-session-id="${activeSessionId}"] .xterm-helper-textarea`)
            : null;
    paletteQuery = "";
    selectedIndex = 0;
    paletteInputEl.value = "";
    paletteOverlayEl.style.display = "";
    updateResults("");
    setTimeout(() => paletteInputEl.focus(), 0);
}

function hidePalette() {
    if (!paletteVisible) return;
    paletteVisible = false;
    if (paletteOverlayEl) paletteOverlayEl.style.display = "none";
    if (lastFocusedTerminalEl && typeof lastFocusedTerminalEl.focus === "function") {
        lastFocusedTerminalEl.focus();
    }
    lastFocusedTerminalEl = null;
}

window.showPalette = showPalette;
window.hidePalette = hidePalette;
