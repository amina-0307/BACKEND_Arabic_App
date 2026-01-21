// api/translate.js //
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const { text, direction = "en_to_ar" } = req.body || {};
        if (!text || !text.trim()) {
            return res.status(400).json({ error: "Text is required" });
        }

        const system =
            "You are a translation assistant for a phrasebook app. Return JSON only with keys: arabic, transliteration, english.";

        const user =
            direction === "ar_to_en"
                ? `Translate this Arabic to English. Also return Arabic transliteration in Latin letters. \nText: ${text}`
                : `Translate this English to Arabic. Also return Arabic transliteration in Latin letters. \nText: ${text}`;

        const resp = await client.chat.completions.create({
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
                            english: { type: "string" }
                        },
                        required: ["arabic", "transliteration", "english"],
                    },
                },
            },
        });

        const json = JSON.parse(resp.choices[0].message.content);
        return res.status(200).json(json);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Translation failed" });
    }
}
