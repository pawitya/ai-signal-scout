import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
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

type SignalKey = (typeof SIGNAL_KEYS)[number];

const FALLBACK_SIGNAL_RULES: Record<SignalKey, { label: string; keywords: string[] }> = {
  customer_support: {
    label: "Customer Support",
    keywords: ["contact", "support", "customer service", "help", "call center", "ติดต่อ", "บริการลูกค้า", "สอบถาม", "ช่วยเหลือ"],
  },
  service_24_7: {
    label: "24/7 Service",
    keywords: ["24/7", "24 hours", "24 ชม", "ตลอด 24", "ทุกวัน", "always open"],
  },
  booking_system: {
    label: "Booking System",
    keywords: ["booking", "reservation", "appointment", "จอง", "นัดหมาย", "สำรอง", "book now"],
  },
  line_oa: {
    label: "LINE OA",
    keywords: ["line", "line oa", "line official", "@", "ไลน์"],
  },
  facebook_instagram: {
    label: "Facebook / Instagram",
    keywords: ["facebook", "instagram", "fb.com", "ig", "social", "เฟซบุ๊ก", "อินสตาแกรม"],
  },
  mobile_application: {
    label: "Mobile Application",
    keywords: ["mobile app", "application", "app store", "google play", "ios", "android", "แอป", "แอปพลิเคชัน"],
  },
};

const SignalSchema = z.object({
  present: z.boolean(),
  evidence: z.string(),
  source: z.string(),
  evidence_url: z.string().optional().default(""),
  evidence_snippet: z.string().optional().default(""),
  confidence: z.enum(["high", "medium", "low"]).optional().default("medium"),
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
  httpStatus?: number;
  reachable?: boolean;
  unavailableReason?: string;
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
    const data = await res.json() as {
      data?: { markdown?: string; metadata?: { title?: string; statusCode?: number } };
    };
    const md = (data?.data?.markdown ?? "").slice(0, 8000);
    const status = data?.data?.metadata?.statusCode;
    const lower = md.toLowerCase();
    const deadHints = [
      "this content isn't available",
      "content isn't available right now",
      "page isn't available",
      "page not found",
      "the link you followed may be broken",
      "ลิงก์ที่คุณใช้อาจชำรุด",
      "เนื้อหานี้ไม่พร้อมใช้งาน",
      "ไม่พร้อมใช้งานในขณะนี้",
    ];
    const looksDead = md.trim().length < 200 || deadHints.some((h) => lower.includes(h));
    return {
      url,
      title: data?.data?.metadata?.title,
      markdown: md,
      httpStatus: status,
      reachable: !looksDead && (status === undefined || status < 400),
      unavailableReason: looksDead ? "ตรวจพบหน้านี้ว่างเปล่า/ถูกลบ/ไม่พร้อมใช้งาน" : undefined,
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

function extractJsonFromResponse(response: string): unknown {
  let cleaned = response.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = cleaned.search(/[\{\[]/);
  if (start === -1) throw new Error("No JSON found in AI response");
  const opening = cleaned[start];
  const closing = opening === "[" ? "]" : "}";
  const end = cleaned.lastIndexOf(closing);
  if (end === -1 || end < start) throw new Error("Malformed JSON in AI response");
  cleaned = cleaned.substring(start, end + 1);
  try {
    return JSON.parse(cleaned);
  } catch {
    cleaned = cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]").replace(/[\x00-\x1F\x7F]/g, "");
    return JSON.parse(cleaned);
  }
}

function createFallbackAnalysis(corpus: string, businessName: string): AnalysisResult {
  const lowerCorpus = corpus.toLowerCase();
  const signals = Object.fromEntries(
    SIGNAL_KEYS.map((key) => {
      const rule = FALLBACK_SIGNAL_RULES[key];
      const matched = rule.keywords.filter((keyword) => lowerCorpus.includes(keyword.toLowerCase()));
      const present = matched.length >= 1;
      return [
        key,
        {
          present,
          evidence: matched.length
            ? `พบ signal ที่เกี่ยวข้องกับ ${rule.label}: ${matched.slice(0, 4).join(", ")}`
            : `ยังไม่พบหลักฐานชัดเจนเกี่ยวกับ ${rule.label} จากข้อมูลที่ scrape ได้`,
          source: matched.length ? "Scraped content" : "No clear source",
        },
      ];
    }),
  ) as AnalysisResult["signals"];

  const score = Math.round(
    (SIGNAL_KEYS.reduce((sum, key) => sum + (signals[key].present ? 100 : 0), 0) / SIGNAL_KEYS.length),
  );

  return {
    summary: `วิเคราะห์ ${businessName} จากข้อมูลที่ scrape ได้แล้ว แต่ AI ส่งรูปแบบข้อมูลไม่สมบูรณ์ ระบบจึงใช้ fallback analysis จาก keyword signals เพื่อให้รายงานไม่ล้ม`,
    ai_readiness_score: score,
    signals,
    recommendations: [
      "เพิ่มข้อมูลช่องทางติดต่อและ customer support ให้ชัดเจนบนหน้าเว็บไซต์",
      "ระบุเวลาทำการหรือบริการ 24/7 หากมี เพื่อเพิ่มความมั่นใจให้ลูกค้า",
      "เชื่อมระบบจอง/นัดหมายหรือ LINE OA ให้ค้นเจอได้ง่ายขึ้น",
    ],
  };
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
จากข้อมูลที่ scrape ได้ด้านล่าง ให้ประเมินแต่ละ signal เป็น true (มี/พบหลักฐาน) หรือ false (ไม่พบ)

Signals ที่ต้องประเมิน:
1. customer_support — มีช่องทาง customer support หรือไม่
2. service_24_7 — บริการ 24/7 หรือไม่
3. booking_system — มีระบบจอง/นัดหมายหรือไม่
4. line_oa — มี LINE Official Account หรือไม่
5. facebook_instagram — active บน Facebook/Instagram หรือไม่
6. mobile_application — มี Mobile App หรือไม่

ตอบเป็นภาษาไทยใน field summary, evidence และ recommendations
ให้ ai_readiness_score เป็น 0-100 (ยิ่ง signals true เยอะ = score สูง)

=== DATA ===
${corpus.slice(0, 25000)}`;

    let analysis: AnalysisResult;
    try {
      const { text } = await generateText({
        model,
        prompt:
          prompt +
          `\n\n=== OUTPUT FORMAT ===\nตอบกลับเป็น JSON object เท่านั้น (ไม่มีข้อความอื่น ไม่มี markdown code fence) ตาม schema นี้:\n` +
          `{\n  "summary": string,\n  "ai_readiness_score": number (0-100),\n  "signals": {\n    "customer_support": { "present": boolean, "evidence": string, "source": string },\n    "service_24_7": { "present": boolean, "evidence": string, "source": string },\n    "booking_system": { "present": boolean, "evidence": string, "source": string },\n    "line_oa": { "present": boolean, "evidence": string, "source": string },\n    "facebook_instagram": { "present": boolean, "evidence": string, "source": string },\n    "mobile_application": { "present": boolean, "evidence": string, "source": string }\n  },\n  "recommendations": string[]\n}`,
      });
      const parsed = extractJsonFromResponse(text);
      analysis = ResultSchema.parse(parsed);
    } catch (error) {
      console.error("AI analysis output failed, using fallback analysis", error);
      analysis = createFallbackAnalysis(corpus, data.businessName);
    }

    return {
      businessName: data.businessName,
      sources: sources.map((s) => ({ source: s.source, url: s.url, title: s.title })),
      analysis,
    };
  });