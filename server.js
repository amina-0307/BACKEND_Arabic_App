const express = require("express");
const cors = require("cors");
require("dotenv").config();

const OpenAIImport = require("openai");
const OpenAI = OpenAIImport?.default || OpenAIImport;

// Vercel kv //
const { kv } = require("@vercel/kv");

const app = express();

const ALLOWED_ORIGINS = [
    "https://frontendarabicapp.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000",
];

app.use(
    cors({
        origin(origin, cb) {
            if (!origin) return cb(null, true); // curl / mobile / server-to-server //
            if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
            return cb(new Error("Not allowed by CORS: " + origin));
        },
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    })
);

app.use(express.json({ limit: "1mb" }));

// OpenAI client //
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// helpers //
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

function ensureSyncKey(syncKey) {
    if (!syncKey || typeof syncKey !== "string") return null;
    const key = syncKey.trim();
    if (key.length < 10) return null;
    return key;
}

// routes //
app.get("/api/health", (req, res) => {
    res.json({ ok: true, route: "/api/health" });
});

/**
* POST /api/translate 
* body: { text: String, direction: "en_to_ar" | "ar_to_en" }
* returns: { arabic, transliteration, english }
*/
app.post("/api/translate", async (req, res) => {
    try {
        const { text, direction } = req.body || {};
        const cleaned = (text || "").trim();

        if (!cleaned) {
            return res.status(400).json({ error: "Missing text" });
        }

        const dir = direction === "ar_to_en" ? "ar_to_en" : "en_to_ar";

        const system = `
    You are a careful Arabic/English translator.
    Return ONLY valid JSON with exactly these keys:
    arabic, transliteration, english
    No extra keys. No commentary.
    `.trim();

        const user =
            dir === "en_to_ar"
                ? `Translate this English into Arabic:
    "${cleaned}"

    Rules:
    - arabic: Modern Standard Arabic
    - transliteration: simple Latin transliteration (ā ī ū where appropriate if you can)
    - english: original English text (cleaned, normal casing)`
            : `Translate this Arabic into English:
    "${cleaned}"

    Rules:
    - arabic: original Arabic text (cleaned)
    - transliteration: Latin transliteration
    - english: natural English translation`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4.1-mini",
            temperature: 0.2,
            messages: [
                { role: "system", content: system },
                { role: "user", content: user },
            ],
            response_format: { type: "json_object" },
        });

        const content = completion.choices?.[0]?.message?.content || "{}";
        const data = JSON.parse(content);

        return res.json({
            arabic: (data.arabic || "").trim(),
            transliteration: (data.transliteration || "").trim(),
            english: (data.english || "").trim(),
        });
        } catch (err) {
            console.error("translate error:", err);
            return res.status(500).json({ error: "Translate failed" });
        }
    });

/**
* SYNC
* Store phrases under "syncKey" in KV
* Frontend generates + stores syncKey locally (like anonymous account)
*
* POST /api/sync/pull
* body: { syncKey: string }
* returns: { phrases: [...] }
*/

app.post("/api/sync/pull", async (req, res) => {
    try {
        const syncKey = ensureSyncKey(req.body?.syncKey);
        if (!syncKey) return res.status(400).json({ error: "Missing/invalid syncKey" });

        const kvKey = `phrases:${syncKey}`;
        const phrases = (await kv.get(kvKey)) || [];

        return res.json({ phrases });
    } catch (err) {
        console.error("sync pull error:", err);
        return res.status(500).json({ error: "Sync pull failed" });
    }
});

/**
* POST /api/sync/push
* body: { syncKey: string, phrases: [...] }
* Merges incoming phrases with KV phrases (deduped)
* returns: { ok: true, count: number }
*/

app.post("/api/sync/push", async (req, res) => {
    try {
        const syncKey = ensureSyncKey(req.body?.syncKey);
        if (!syncKey) return res.status(400).json({ error: "Missing/invalid syncKey" });

        const incoming = Array.isArray(req.body?.phrases) ? req.body.phrases : [];
        const incomingNorm = incoming.map(normalizePhrase);

        const kvKey = `phrases:${syncKey}`;
        const existing = (await kv.get(kvKey)) || [];

        const map = new Map();

        // existing first //
        for (const p of existing) {
            const norm = normalizePhrase(p);
            map.set(phraseKey(norm), norm);
        }

        // then overwrite/add incoming //
        for (const p of incomingNorm) {
            map.set(phraseKey(p), p);
        }

        // store newest first //
        const merged = Array.from(map.values()).sort((a, b) =>
            (b.createdAt || "").localeCompare(a.createdAt || "")
        );

        await kv.set(kvKey, merged);

        return res.json({ ok: true, count: merged.length });
    } catch (err) {
        console.error("sync push error:", err);
        return res.status(500).json({ error: "Sync push failed" });
    }
});

// Vercel severless export //
// IMPORTANT: on Vercel, typically export the app (no listen)
module.exports = app;
