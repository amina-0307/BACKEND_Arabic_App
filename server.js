import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import multer from "multer";

dotenv.config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// IMPORTANT: must be before routes so req.body exists //
app.use(express.json());

// When deploying, replace this with real frontend URL (or allowList) //
const allowedOrigins = [
    "http://localhost:5173",
    "https://frontendarabicapp.vercel.app",
];

const corsOptions = {
    origin: allowedOrigins,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

/* OPENAI CLIENT */
let client;

function getClient() {
    if (!client) {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error("OPENAI_API_KEY missing");
        }
        client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return client;
}

/* HEALTH CHECK */
app.get("/api/health", (req, res) => res.json({ ok: true }));

/* TRANSLATE ENDPOINT */
app.post("/api/translate-image", upload.single("image"), async (req, res) => {
    try {
        const direction = req.body.direction || "en_to_ar";
        if (!req.file) return res.status(400).json({ error: "Image is required" });

        const imageBase64 = req.file.buffer.toString("base64");

        const system = `You are a translation assistant for a phrasebook app.
        Return JSON only. No markdowns.
        Schema: {"arabic": "...", "transliteration": "...", "english": "..."}
        Transliteration MUST use macrons: ā ī ū when applicable.`;

        const user =
            direction === "ar_to_en"
                ? "Translate the Arabic text in the image into English, and provide Arabic transliteration with macrons (ā ī ū)."
                : "Translate the English text in the image into Arabic, and provide Arabic transliteration with macrons (ā ī ū).";

        const resp = await getClient().chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.2,
            messages: [
                { role: "system", content: system },
                {
                    role: "user",
                    content: [
                        { type: "text", text: user },
                        {
                            type: "image_url",
                            image_url: { url: `data:image/jpeg;base64,${imageBase64}`},
                        },
                    ],
                },
            ],
        });

        const  content = resp.choices?.[0]?.message?.content || "{}";
        let json;
        try {
            json = JSON.parse(content);
        } catch {
            return res.status(500).json({ error: "Model did not return valid JSON" });
        }

        return res.json(json);
    } catch (e) {
        console.error("IMAGE TRANSLATE ERROR:", e);
        return res.status(500).json({ error: "Translation failed" });
    }
});

app.post("/api/translate", async (req, res) => {
    try {
        const { text, direction = "en_to_ar" } = req.body || {};

        if (!text || !text.trim()) {
            return res.status(400).json({ error: "Text is required" });
        }

        /* SYSTEM PROMPT - IMPORTANT - belongs here, inside request handler (before calling OenAI) */
        const system = `
    You are a translation assistant for an Arabic phrasebook app.

    Return STRICT JSON only with exactly these keys:
    - arabic
    - transliteration
    - english

    Transliteration rules (must follow):
    - Use macrons: ā, ī, ū
    - Use dotted consonants where appropriate: ḥ, ṣ, ḍ, ṭ, ẓ
    - Use: ʿ (ayn) and ʾ (hamza) when needed
    - Use "q" for ق (not k)
    - No extra commentary, no markdown, no additional keys.
    `.trim();

        const user =
            direction === "ar_to_en"
                ? `Translate the following Arabic into English. Return Arabic, English, and transliteration. Text: ${text}`
                : `Translate the following English into Arabic. Return Arabic, English, and transliteration.Text: ${text}`;

        // Structured Outputs (JSON schema) is the most reliable way to force shape [oai_citation: 0#OpenAI Platform](https://platform.openai.com/docs/api-reference/assistants?_clear=true&lang=node.js&utm_source=chatgpt.com) //
        const resp = await getClient().chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.2,
            messages: [
                { role: "system", content: system },
                { role: "user", content: user },
            ],
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "translation",
                    schema: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            arabic: { type: "string" },
                            transliteration: { type: "string" },
                            english: { type: "string" },
                        },
                        required: ["arabic", "transliteration", "english"],
                    },
                },
            },
        });

        const content = resp.choices?.[0]?.message?.content || "{}";
        const json = JSON.parse(content);
        return res.json(json);
    } catch (e) {
        console.error("TRANSLATE ERROR:", e);
        return res.status(500).json({ error: "Translation failed" });
    }
});

/* SERVER START */
export default app;
