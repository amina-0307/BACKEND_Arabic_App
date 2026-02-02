import OpenAI from "openai";
import multer from "multer";

function setCors(res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
}

// multer in-memory storage //
const upload = multer({ storage: multer.memoryStorage() });

// IMPORTANT for multer on vercel serverless //
export const config = {
    api: { bodyParser: false },
};

function runMiddleware(req, res, fn) {
    return new Promise((resolve, reject) => {
        fn(req, res, (result) => {
            if (result instanceof Error) return reject(result);
            return resolve(result);
        });
    });
}

export default async function handler(req, res) {
    setCors(res);

    // preflight //
    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        if (!process.env.OPENAI_API_KEY) {
            return res
                .status(500)
                .json({ error: "OPENAI_API_KEY is missing on the server" });
        }

        // parse multipart/form-data //
        await runMiddleware(req, res, upload.single("image"));
    
        const directionRaw = req.body?.direction;
        const direction = directionRaw === "ar_to_en" ? "ar_to_en" : "en_to_ar";

        const file = req.file;
        if (!file) {
            return res.status(400).json({
                error: "Missing image file (field name must be 'image')",
            });
        }

        // convert buffer to base 64 data URL //
        const mime = file.mimetype || "image/jpeg";
        const base64 = file.buffer.toString("base64");
        const dataUrl = `data:${mime};base64,${base64}`;

        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const system = `
    You are an Arabic phrasebook translator.
    The user provides an image containing text.
    Extract the text and translate it based on direction.

    Return ONLY valid JSON with exactly these keys:
    arabic, english, transliteration, source

    Rules:
    - If direction is "en_to_ar": translate extracted English -> Arabic.
    - If direction is "ar_to_en": translate extracted Arabic -> English.
    - Transliteration must use macrons when helpful (ā ī ū).
    - Kepp it short and natural for travel phrases.
    - "source" must be "openai".
    `.trim();

        const completion = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || "gpt-4o-mini",
            messages: [
                { role: "system", content: system },
                { role: "user",
                    content: [
                        { type: "text", text: `direction: ${direction}` },
                        { type: "image_url", image_url: { url: dataUrl } },
                    ],
                },
            ],
            temperature: 0.2,
            response_format: { type: "json_object" },
        });

        const content = completion.choices?.[0]?.message?.content || "{}";
        const parsed = JSON.parse(content);

        return res.status(200).json({
            arabic: typeof parsed.arabic === "string" ? parsed.arabic : "",
            english: typeof parsed.english === "string" ? parsed.english : "",
            transliteration:
                typeof parsed.transliteration === "string" ? parsed.transliteration : "",
            source: "openai",
        });
    } catch (err) {
        console.error("translate-image error:", err);
        return res.status(500).json({ error: "Image translation failed" });
    }
}
