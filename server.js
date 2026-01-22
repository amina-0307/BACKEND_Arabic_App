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
    origin: (origin, cb) => {
        if (!origin) return cb(null, true); // allow server-to-server //
        if (allowedOrigins.includes(origin)) return cb(null, true);
        return cb(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options("/.*/", cors(corsOptions)); // IMPORTANT: regex, not "*" //

/* OPENAI CLIENT */
let client;
function getClient() {
    if (!client) {
        if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");
        client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return client;
}

/* HEALTH CHECK */
app.get("/api/health", (req, res) => {
    res.json({ ok: true, route: req.originalUrl  });
});

/* TRANSLATE ENDPOINT */
app.post("/api/translate", async (req, res) => {
    try {
        const { text, direction = "en_to_ar" } = req.body || {};
        if (!text || !text.trim()) return res.status(400).json({ error: "Text is required" });

        const system = `You are a translation assistant for an Arabic phrasebook app.
        Return STRICT JSON only with exactly these keys: arabic, transliteration, english.`.trim();

        const user =
            direction === "ar_to_en"
                ? `Translate the following Arabic into English. Return Arabic, English, and transliteration. Text ${text}`
                : `Translate the following English into Arabic. Return Arabic, English, and transliteration. Text: ${text}`;

        const resp = await getClient().chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.2,
            messages: [
                { role: "system", content: system },
                { role: "user", content: user },
            ],
        });

        const  content = resp.choices?.[0]?.message?.content || "{}";
        const json = JSON.parse(content);
        return res.json(json);
    } catch (e) {
        console.error("TRANSLATE ERROR:", e);
        return res.status(500).json({ error: "Translation failed" });
    }
});

app.post("/api/translate-image", upload.single("image"), async (req, res) => {
    try {
        const direction = req.body.direction || "en_to_ar";
        if (!req.file) return res.status(400).json({ error: "Image is required" });

        const imageBase64 = req.file.buffer.toString("base64");

        const resp = await getClient().chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.2,
            messages: [
                { role: "user", content: "Translate. Return JSON with arabic, transliteration, english." },
            ],
        });
               
        const content = resp.choices?.[0]?.message?.content || "{}";
        const json = JSON.parse(content);
        return res.json(json);
    } catch (e) {
        console.error("IMAGE TRANSLATE ERROR:", e);
        return res.status(500).json({ error: "Translation failed" });
    }
});

/* SERVER START */
export default app;
