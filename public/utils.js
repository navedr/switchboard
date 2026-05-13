// --- Utility functions (shared across renderer modules) ---

function cleanDisplayName(name) {
    if (!name) return name;
    const prefix = "Implement the following plan:";
    if (name.startsWith(prefix)) name = name.slice(prefix.length).trim();
    // Strip XML/HTML-like tags (e.g. <command>, </message>, <system-reminder>)
    name = name.replace(/<\/?[a-zA-Z][a-zA-Z0-9_-]*(?:\s[^>]*)?\/?>/g, " ");
    // Collapse multiple spaces and trim
    name = name.replace(/\s+/g, " ").trim();
    return name;
}

function formatDate(date) {
    const now = new Date();
    const diff = now - date;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function shellEscape(path) {
    return "'" + path.replace(/'/g, "'\\''") + "'";
}

function fuzzyScore(query, target) {
    if (!query || !target) return 0;
    const q = query.toLowerCase();
    const t = target.toLowerCase();
    if (t.includes(q)) return 100 + (q.length / t.length) * 50;
    let qi = 0,
        score = 0,
        lastMatch = -1;
    for (let ti = 0; ti < t.length && qi < q.length; ti++) {
        if (t[ti] === q[qi]) {
            score += lastMatch >= 0 && ti - lastMatch === 1 ? 10 : 5;
            lastMatch = ti;
            qi++;
        }
    }
    return qi === q.length ? score : 0;
}

function createPopover(anchorEl, items, { onSelect, onClose, className = "" } = {}) {
    document.querySelectorAll(".tag-popover").forEach(el => el.remove());

    const pop = document.createElement("div");
    pop.className = "new-session-popover tag-popover " + className;

    let selectedIdx = 0;
    function render() {
        while (pop.firstChild) pop.removeChild(pop.firstChild);
        items.forEach((item, i) => {
            const btn = document.createElement("button");
            btn.className = "popover-option" + (i === selectedIdx ? " selected" : "");
            btn.dataset.index = i;
            if (item.color) btn.style.color = item.color;
            btn.textContent = item.label;
            pop.appendChild(btn);
        });
    }
    render();

    document.body.appendChild(pop);
    const rect = anchorEl.getBoundingClientRect();
    const popHeight = pop.offsetHeight;
    if (rect.bottom + 4 + popHeight > window.innerHeight) {
        pop.style.top = rect.top - popHeight - 4 + "px";
    } else {
        pop.style.top = rect.bottom + 4 + "px";
    }
    pop.style.left = rect.left + "px";

    pop.addEventListener("click", e => {
        const idx = e.target.closest(".popover-option")?.dataset.index;
        if (idx != null) {
            close();
            if (onSelect) onSelect(items[+idx], +idx);
        }
    });

    function close() {
        pop.remove();
        document.removeEventListener("mousedown", onClickOutside);
        document.removeEventListener("keydown", onKey, true);
        if (onClose) onClose();
    }
    function onClickOutside(e) {
        if (!pop.contains(e.target) && e.target !== anchorEl) close();
    }
    document.addEventListener("mousedown", onClickOutside);

    const onKey = e => {
        if (e.key === "Escape") {
            e.preventDefault();
            close();
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            selectedIdx = (selectedIdx + 1) % items.length;
            render();
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            selectedIdx = (selectedIdx - 1 + items.length) % items.length;
            render();
        } else if (e.key === "Enter") {
            e.preventDefault();
            close();
            if (onSelect) onSelect(items[selectedIdx], selectedIdx);
        }
    };
    document.addEventListener("keydown", onKey, true);

    return { close, overlay: pop };
}
