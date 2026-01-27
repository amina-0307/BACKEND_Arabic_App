const { kv } = require("@vercel/kv");

const ALLOWED_ORIGINS = new Set([
    "https://frontendarabicapp.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000",
]);

function setCors(req, res) {
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.has(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
}

function readJson(req) {
    return new Promise((resolve, reject) => {
        let data = "";
        req.on("data", (chunk) => (data += chunk));
        req.on("end", () => {
            if (!data) return resolve({});
            try {
                resolve(JSON.parse(data));
            } catch (e) {
                reject (e);
            }
        });
        req.on("error", reject);
    });
}

function ensureSyncKey(syncKey) {
    if (!syncKey || typeof syncKey !== "string") return null;
    const key = syncKey.trim();
    if (key.length < 10) return null;
    return key;
}

function normalizePhrase(p) {
    return {
        arabic: (p.arabic || "").trim(),
        english: (p.english || "").trim(),
        transliteration: (p.transliteration || "").trim(),
        category: (p.category || "Saved").trim(),
        createdAt: p.createdAt || new Date().toISOString(),
        source: p.source || "unknown",
    };
}

function phraseKey(p) {
    return `${(p.arabic || "").trim()}||${(p.english || "")
        .trim()
        .toLowerCase()}||${(p.category || "Saved").trim()}`;
}

module.exports = async (req, res) => {
    setCors(req, res);

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    try {
        const body = await readJson(req);

        const syncKey = ensureSyncKey(body?.syncKey);
        if (!syncKey) return res.status(400).json({ error: "Missing/invalid syncKey" });

        const incoming = Array.isArray(body?.phrases) ? body.phrases : [];
        const incomingNorm = incoming.map(normalizePhrase);

        const kvKey = `phrases:${syncKey}`;
        const existing = (await kv.get(kvKey)) || [];

        const map = new Map();

        for (const p of existing) {
            const norm = normalizePhrase(p);
            map.set(phraseKey(norm), norm);
        }

        for (const p of incomingNorm) {
            map.set(phraseKey(p), p);
        }

        const merged = Array.from(map.values()).sort((a, b) =>
            (b.createdAt || "").localeCompare(a.createdAt || "")
        );

        await kv.set(kvKey, merged);

        return res.status(200).json({ ok: true, count: merged.length });
    } catch (err) {
        console.error("sync push error:", err);
        return res.status(500).json({ error: "Sync push failed" });
    }
};
