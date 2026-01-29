import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
    // CORS //
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const { text, direction } = req.body || {};
        if (!text || !direction) {
            return res.status(400).json({ error: "Missing text or direction" });
        }

        const system = `
    You are a translation engine for an Arabic phrasebook app.
    Return ONLY valid JSON with keys:
    arabic, english, transliteration.
    Rules:
    - Transliteration should use macrons where appropriate (ā, ī, ū) if natural.
    - Keep output short and phrasebook-friendly.
    - If direction is en_to_ar: translate English -> Arabic, english should equal original input (cleaned).
    - if direction is ar_to_en: translate Arabic -> English, arabic should equal original input (cleaned).
    No extra text. No markdown. JSON only.
    `.trim();

        const user = JSON.stringify({ text, direction });

        const resp = await client.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.2;
            messages: [
                { role: "system", content: system },
                { role: "user", content: user },
            ],
        });

        const raw = resp.choices?.[0]?.message?.content?.trim() || "";
        let data;
        try {
            data = JSON.parse(raw);
        } catch {
            return res.status(502).json({ error: "Model returned non-JSON", raw });
        }

        // basic shape check //
        if (!data || typeof data !== "object") {
            return res.status(502).json({ error: "Bad response shape", raw });
        }

        return res.status(200).json({
            arabic: data.arabic || "",
            english: data.english || "",
            transliteration: data.transliteration || "",
            source: "openai",
        });
    } catch (e) {
        return res.status(500).json({ error: "Translate failed", detail: e?.message });
    }
}
