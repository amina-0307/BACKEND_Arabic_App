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

module.exports = async (req, res) => {
    setCors(req, res);

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    try {
        const body = await readJson(req);
        const syncKey = ensureSyncKey(body?.syncKey);
        if (!syncKey) return res.status(400).json({ error: "Missing/invalid syncKey" });

        const kvKey = `phrases:${syncKey}`;
        const phrases = (await kv.get(kvKey)) || [];

        return res.status(200).json({ phrases });
    } catch (err) {
        console.error("sync pull error:", err);
        return res.status(500).json({ error: "Sync pull failed" });
    }
};
