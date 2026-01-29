export default async function handler(req, res) {
    // CORS //
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Conent-Type,Authorization");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const { text, direction } = req.body || {};
        if (!text || !direction) {
            return res.status(400).json({ error: "Missing text or direction" });
        }

        // replace this part with OpenAI logic once confirmation this works //
        return res.status(200).json({
            arabic: direction === "en_to_ar" ? "مرحبا" : "مساء الخير",
            english: direction === "ar_to_en" ? "Good afternoon" : text,
            transliteration: "Masaa al-khayr",
            source: "mock",
        });
    } catch (e) {
        return res.status(500).json({ error: "Trnaslate failed" });
    }
}
