const { parentPort, workerData } = require("worker_threads");
const fs = require("fs");
const path = require("path");
const { getFolderIndexMtimeMs } = require("../folder-index-state");
const { deriveProjectPath } = require("../derive-project-path");
const { readSessionFile } = require("../read-session-file");

const projectsDirs = Array.isArray(workerData.projectsDir) ? workerData.projectsDir : [workerData.projectsDir];

function readFolderFromFilesystem(folder, projectsDir) {
    const folderPath = path.join(projectsDir, folder);
    const projectPath = deriveProjectPath(folderPath, folder);
    if (!projectPath) return null;
    const sessions = [];
    const indexMtimeMs = getFolderIndexMtimeMs(folderPath);

    try {
        const jsonlFiles = fs.readdirSync(folderPath).filter(f => f.endsWith(".jsonl"));
        for (const file of jsonlFiles) {
            const s = readSessionFile(path.join(folderPath, file), folder, projectPath);
            if (s) sessions.push(s);
        }
    } catch {}

    return { folder, projectPath, sessions, indexMtimeMs };
}

try {
    const results = [];
    let totalFolders = 0;

    for (const projectsDir of projectsDirs) {
        try {
            totalFolders += fs
                .readdirSync(projectsDir, { withFileTypes: true })
                .filter(d => d.isDirectory() && d.name !== ".git").length;
        } catch {}
    }

    let processed = 0;
    for (const projectsDir of projectsDirs) {
        try {
            const folders = fs
                .readdirSync(projectsDir, { withFileTypes: true })
                .filter(d => d.isDirectory() && d.name !== ".git")
                .map(d => d.name);

            for (const folder of folders) {
                processed++;
                if (processed % 5 === 0 || processed === totalFolders) {
                    parentPort.postMessage({
                        type: "progress",
                        text: `Scanning projects (${processed}/${totalFolders})…`,
                    });
                }
                const result = readFolderFromFilesystem(folder, projectsDir);
                if (result) results.push(result);
            }
        } catch {}
    }
    parentPort.postMessage({ ok: true, results });
} catch (err) {
    parentPort.postMessage({ ok: false, error: err.message });
}
