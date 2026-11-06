import type { Express, Request, Response } from "express";
import { invokeLLM } from "../_core/llm";

/**
 * اللغات والترجمة — تحويل النص بين الفصحى واللهجات العربية واللغات الأخرى.
 * يعتمد على الخدمة الآمنة على الخادم فقط؛ لا يُرسل مفتاح النموذج إلى التطبيق.
 */

export const DIALECTS = {
  fusha: "العربية الفصحى",
  masri: "العامية المصرية",
  khaligi: "العامية الخليجية",
  shami: "العامية الشامية",
  en: "الإنجليزية",
  fr: "الفرنسية",
  es: "الإسبانية",
  de: "الألمانية",
  tr: "التركية",
  ur: "الأردية",
} as const;

type DialectKey = keyof typeof DIALECTS;

const MAX_CHARS = 1200;

function isDialect(value: unknown): value is DialectKey {
  return typeof value === "string" && value in DIALECTS;
}

function buildPrompt(text: string, target: DialectKey, source: DialectKey | "auto"): string {
  const targetLabel = DIALECTS[target];
  const sourceLine =
    source === "auto"
      ? "اكتشف لغة النص الأصلي بنفسك (عربي فصحى أو لهجة عربية أو أي لغة أجنبية)."
      : `النص الأصلي مكتوب بـ ${DIALECTS[source]}.`;
  return [
    "أنت مترجم محترف متعدد اللغات، متخصص في العربية الفصحى واللهجات العربية (المصرية والخليجية والشامية) واللغات العالمية.",
    `حوّل النص التالي إلى ${targetLabel}.`,
    sourceLine,
    "قواعد صارمة:",
    "1) حافظ على المعنى والإحساس والنبرة كما هي، بدون إضافة أو حذف معلومات.",
    "2) حافظ على الرموز التعبيرية والمنشن والهاشتاق والروابط والأسماء العلم كما هي دون تغيير.",
    "3) لا تكتب أي شرح أو مقدمة أو تعليق — النص المترجم فقط.",
    "4) إن كان النص بالفعل بنفس اللغة/اللهجة المطلوبة، أعده كما هو.",
    "",
    "النص:",
    text,
  ].join("\n");
}

export function registerDialectRoutes(app: Express) {
  app.post("/api/dialect/translate", async (req: Request, res: Response) => {
    try {
      const { text, target, source } = (req.body ?? {}) as {
        text?: unknown;
        target?: unknown;
        source?: unknown;
      };
      if (typeof text !== "string" || text.trim().length === 0) {
        return res.status(400).json({ ok: false, error: "النص فاضي" });
      }
      if (text.length > MAX_CHARS) {
        return res.status(400).json({ ok: false, error: `الحد الأقصى ${MAX_CHARS} حرف` });
      }
      if (!isDialect(target)) {
        return res.status(400).json({ ok: false, error: "لغة غير معروفة" });
      }
      const from = source === "auto" || source === undefined || source === null ? "auto" : source;
      if (from !== "auto" && !isDialect(from)) {
        return res.status(400).json({ ok: false, error: "لغة المصدر غير معروفة" });
      }

      const request = () =>
        invokeLLM({
          model: "gpt-5-mini",
          messages: [
            { role: "system", content: "أنت مترجم محترف متعدد اللغات، مخرجاتك النص المترجم فقط." },
            { role: "user", content: buildPrompt(text, target, from) },
          ],
          maxTokens: Math.min(4000, 1200 + text.length * 3),
        });

      const extract = (result: Awaited<ReturnType<typeof invokeLLM>>) => {
        const raw = result.choices?.[0]?.message?.content;
        const output =
          typeof raw === "string"
            ? raw
            : Array.isArray(raw)
              ? raw.map((part) => ("text" in part ? part.text : "")).join("")
              : "";
        return output.trim().replace(/^```[a-z]*\n?|```$/g, "").trim();
      };

      let cleaned = extract(await request());
      if (!cleaned) cleaned = extract(await request());
      if (!cleaned) {
        return res.status(502).json({ ok: false, error: "الخدمة رجّعت نص فاضي" });
      }
      return res.json({ ok: true, text: cleaned, target, source: from, dialectLabel: DIALECTS[target] });
    } catch (error) {
      console.error("[dialect] translation failed", error);
      return res.status(500).json({ ok: false, error: "مش قادر أحوّل النص دلوقتي" });
    }
  });

  app.get("/api/dialect/options", (_req: Request, res: Response) => {
    res.json({ ok: true, options: Object.entries(DIALECTS).map(([key, label]) => ({ key, label })) });
  });
}
