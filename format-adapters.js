// Normalize Codex and Copilot JSONL entries to Claude-compatible format
// so the existing jsonl-viewer.js can render them with minimal changes.

function adaptCodexEntries(rawEntries) {
    const entries = [];
    for (const raw of rawEntries) {
        const { type, payload, timestamp } = raw;
        if (!payload) continue;

        if (type === "response_item") {
            if (payload.type === "message") {
                const role = payload.role === "developer" ? "user" : "assistant";
                const content = (payload.content || []).map(block => {
                    if (block.type === "input_text" || block.type === "output_text") {
                        return { type: "text", text: block.text || "" };
                    }
                    return block;
                });
                if (payload.reasoningText) {
                    content.unshift({ type: "thinking", thinking: payload.reasoningText });
                }
                entries.push({ type: role, timestamp, message: { content } });
            } else if (payload.type === "function_call") {
                entries.push({
                    type: "assistant",
                    timestamp,
                    message: {
                        content: [
                            {
                                type: "tool_use",
                                id: payload.call_id,
                                name: payload.name || "unknown",
                                input:
                                    typeof payload.arguments === "string"
                                        ? safeJsonParse(payload.arguments)
                                        : payload.arguments || {},
                            },
                        ],
                    },
                });
            } else if (payload.type === "function_call_output") {
                const output = payload.output || "";
                entries.push({
                    type: "user",
                    timestamp,
                    message: {
                        content: [
                            {
                                type: "tool_result",
                                tool_use_id: payload.call_id,
                                content: typeof output === "string" ? output : JSON.stringify(output),
                            },
                        ],
                    },
                });
            }
        }
    }
    return entries;
}

function adaptCopilotEntries(rawEntries) {
    const entries = [];
    const toolResults = new Map();

    // Pre-index tool.execution_complete results by toolCallId
    for (const raw of rawEntries) {
        if (raw.type === "tool.execution_complete") {
            const d = raw.data || {};
            toolResults.set(d.toolCallId, d.result);
        }
    }

    for (const raw of rawEntries) {
        const { type, data, timestamp } = raw;
        if (!data && type !== "session.start") continue;

        if (type === "user.message") {
            const text = data.message || data.content || "";
            entries.push({ type: "user", timestamp, message: { content: [{ type: "text", text }] } });
        } else if (type === "assistant.message") {
            const content = [];
            if (data.reasoningText) {
                content.push({ type: "thinking", thinking: data.reasoningText });
            }
            if (data.content) {
                content.push({ type: "text", text: data.content });
            }
            if (data.toolRequests) {
                for (const tr of data.toolRequests) {
                    content.push({
                        type: "tool_use",
                        id: tr.toolCallId,
                        name: tr.name || "unknown",
                        input: tr.arguments || {},
                    });
                }
            }
            if (content.length > 0) {
                entries.push({ type: "assistant", timestamp, message: { content } });
            }
        } else if (type === "tool.execution_complete") {
            const result = data.result;
            const output = typeof result === "string" ? result : JSON.stringify(result || "");
            entries.push({
                type: "user",
                timestamp,
                message: {
                    content: [
                        {
                            type: "tool_result",
                            tool_use_id: data.toolCallId,
                            content: output,
                        },
                    ],
                },
            });
        } else if (type === "assistant.reasoning") {
            if (data.reasoningText) {
                entries.push({
                    type: "assistant",
                    timestamp,
                    message: { content: [{ type: "thinking", thinking: data.reasoningText }] },
                });
            }
        }
    }
    return entries;
}

function safeJsonParse(str) {
    try {
        return JSON.parse(str);
    } catch {
        return { raw: str };
    }
}

module.exports = { adaptCodexEntries, adaptCopilotEntries };
