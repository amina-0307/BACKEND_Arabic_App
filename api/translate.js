import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function setCors(res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
}

export default async function handler(req, res) {
    setCors(res);

    // pre-flight //
    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }
    // only allow POST //
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const { text, direction } = req.body || {};

        if (!text) {
            return res.status(400).json({ error: "Missing or invalid 'text'" });
        }

        const dir = direction === "ar_to_en" ? "ar_to_en" : "en_to_ar";

        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        if (!process.env.OPENAI_API_KEY) {
            return res.status(500).json({ error: "OPENAI_API_KEY is missing on the server" });
        }

        const system = `
    You are a translation engine for an Arabic phrasebook app.
    Return ONLY valid JSON with keys:
    arabic, english, transliteration.

    Rules:
    - If direction is "en_to_ar": translate English -> Arabic.
    - If direction is "ar_to_en": translate Arabic -> English.
    - Transliteration must use macrons when helpful (ā ī ū).
    - Keep it short and natural for travel phrases.
    - "source" must be "openai".
    `;

        const user = JSON.stringify({ text, direction: dir });

        const completion = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || "gpt-4o-mini",
            messages: [
                { role: "system", content: system.trim() },
                { role: "user", content: user },
            ],
            temperature: 0.2,
            response_format: { type: "json_object" },
        });

        const content = completion.choices?.[0]?.message?.content || "{}";
        const parsed = JSON.parse(content);

        const arabic = typeof parsed.arabic === "string" ? parsed.arabic : "";
        const english = typeof parsed.english === "string" ? parsed.english : "";
        const transliteration =
            typeof parsed.transliteration === "string" ? parsed.transliteration : "";

        return res.status(200).json({
            arabic,
            english,
            transliteration,
            source: "openai",
        });
    } catch (err) {
        console.error("translate error:", err);
        // response JSON so frontend can show useful message //
        return res.status(500).json({ error: "Translation failed" });
    }
}
