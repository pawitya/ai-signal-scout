import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, Output } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway";

const InputSchema = z.object({
  businessName: z.string().min(1).max(200),
  website: z.string().url().optional().or(z.literal("")),
  facebook: z.string().url().optional().or(z.literal("")),
});

const SIGNAL_KEYS = [
  "customer_support",
  "service_24_7",
  "booking_system",
  "line_oa",
  "facebook_instagram",
  "mobile_application",
] as const;

const SignalSchema = z.object({
  level: z.enum(["High", "High-Medium", "Medium", "Low", "None"]),
  evidence: z.string(),
  source: z.string(),
});

const ResultSchema = z.object({
  summary: z.string(),
  ai_readiness_score: z.number().min(0).max(100),
  signals: z.object({
    customer_support: SignalSchema,
    service_24_7: SignalSchema,
    booking_system: SignalSchema,
    line_oa: SignalSchema,
    facebook_instagram: SignalSchema,
    mobile_application: SignalSchema,
  }),
  recommendations: z.array(z.string()).max(6),
});

export type AnalysisResult = z.infer<typeof ResultSchema>;

type FirecrawlScrape = {
  url: string;
  title?: string;
  markdown?: string;
  error?: string;
};

async function firecrawlScrape(url: string, apiKey: string): Promise<FirecrawlScrape> {
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: true,
      }),
    });
    if (!res.ok) {
      return { url, error: `HTTP ${res.status}` };
    }
    const data = await res.json() as { data?: { markdown?: string; metadata?: { title?: string } } };
    return {
      url,
      title: data?.data?.metadata?.title,
      markdown: (data?.data?.markdown ?? "").slice(0, 8000),
    };
  } catch (e) {
    return { url, error: e instanceof Error ? e.message : String(e) };
  }
}

async function firecrawlSearch(query: string, apiKey: string) {
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, limit: 8 }),
    });
    if (!res.ok) return { error: `HTTP ${res.status}`, results: [] as Array<{ url: string; title?: string; description?: string }> };
    const data = await res.json() as { data?: { web?: Array<{ url: string; title?: string; description?: string }> } | Array<{ url: string; title?: string; description?: string }> };
    const list = Array.isArray(data?.data)
      ? data.data
      : (data?.data as { web?: Array<{ url: string; title?: string; description?: string }> })?.web ?? [];
    return { results: list.slice(0, 8) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), results: [] };
  }
}

export const analyzeBusinessSignals = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    if (!FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY is not configured");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const sources: Array<{ source: string; url: string; title?: string; content: string }> = [];

    // 1) Official website
    if (data.website) {
      const w = await firecrawlScrape(data.website, FIRECRAWL_API_KEY);
      sources.push({
        source: "Official Website",
        url: w.url,
        title: w.title,
        content: w.markdown ?? `(scrape failed: ${w.error})`,
      });
    }

    // 2) Facebook
    if (data.facebook) {
      const f = await firecrawlScrape(data.facebook, FIRECRAWL_API_KEY);
      sources.push({
        source: "Facebook",
        url: f.url,
        title: f.title,
        content: f.markdown ?? `(scrape failed: ${f.error})`,
      });
    }

    // 3) Google Search via Firecrawl
    const searchQueries = [
      `${data.businessName}`,
      `${data.businessName} จองคิว booking`,
      `${data.businessName} LINE OA application app`,
    ];
    const searchResults: Array<{ query: string; url: string; title?: string; description?: string }> = [];
    for (const q of searchQueries) {
      const r = await firecrawlSearch(q, FIRECRAWL_API_KEY);
      for (const item of r.results ?? []) {
        searchResults.push({ query: q, ...item });
      }
    }
    if (searchResults.length > 0) {
      sources.push({
        source: "Google Search",
        url: "https://google.com",
        content: searchResults
          .map((s) => `[${s.query}] ${s.title ?? ""} — ${s.url}\n${s.description ?? ""}`)
          .join("\n\n"),
      });
    }

    if (sources.length === 0) {
      throw new Error("ไม่มีข้อมูลให้วิเคราะห์ กรุณาระบุ Website หรือ Facebook อย่างน้อย 1 อย่าง");
    }

    // 4) AI analysis
    const gateway = createLovableAiGatewayProvider(LOVABLE_API_KEY);
    const model = gateway("google/gemini-2.5-flash");

    const corpus = sources
      .map((s) => `=== ${s.source} (${s.url}) ===\n${s.content}`)
      .join("\n\n");

    const prompt = `คุณคือ AI Business Analyst วิเคราะห์ "AI Potential Usage Signals" ของธุรกิจ "${data.businessName}"
จากข้อมูลที่ scrape ได้ด้านล่าง ให้ประเมินแต่ละ signal เป็น High / High-Medium / Medium / Low / None

Signals ที่ต้องประเมิน:
1. customer_support — มีช่องทาง customer support หรือไม่
2. service_24_7 — บริการ 24/7 หรือไม่
3. booking_system — มีระบบจอง/นัดหมายหรือไม่
4. line_oa — มี LINE Official Account หรือไม่
5. facebook_instagram — active บน Facebook/Instagram หรือไม่
6. mobile_application — มี Mobile App หรือไม่

ระดับ default ที่คาดหวัง (ใช้เป็น guideline ถ้าเจอหลักฐานชัดเจน):
- customer_support: High
- service_24_7: High
- booking_system: High
- line_oa: High
- facebook_instagram: High-Medium
- mobile_application: High

ตอบเป็นภาษาไทยใน field summary, evidence และ recommendations
ให้ ai_readiness_score เป็น 0-100 (ยิ่ง signals สูง = score สูง)

=== DATA ===
${corpus.slice(0, 25000)}`;

    const { experimental_output } = await generateText({
      model,
      experimental_output: Output.object({ schema: ResultSchema }),
      prompt,
    });

    return {
      businessName: data.businessName,
      sources: sources.map((s) => ({ source: s.source, url: s.url, title: s.title })),
      analysis: experimental_output,
    };
  });