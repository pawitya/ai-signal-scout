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
    keywords: ["lin.ee", "line.me/ti/p", "line oa", "line official", "@line", "ไลน์ ออฟฟิเชียล", "ไลน์ official"],
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
        waitFor: 2500,
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
    // Strong "dead page" signals only — Facebook explicit error copy.
    // We deliberately do NOT mark a page dead just because the markdown is short:
    // Facebook often renders behind a login wall and returns minimal text even
    // when the page is perfectly accessible to real users.
    const deadHints = [
      "this content isn't available",
      "content isn't available right now",
      "this page isn't available",
      "page isn't available right now",
      "the link you followed may be broken",
      "the page may have been removed",
      "sorry, this page isn't available",
      "ลิงก์ที่คุณใช้อาจชำรุด",
      "เนื้อหานี้ไม่พร้อมใช้งาน",
      "ไม่พร้อมใช้งานในขณะนี้",
      "หน้านี้ไม่พร้อมใช้งาน",
    ];
    const httpDead = typeof status === "number" && status >= 400;
    const explicitDead = deadHints.some((h) => lower.includes(h));
    // Treat near-empty pages as inconclusive (not dead) so FB login-walled pages
    // are not falsely flagged. Only HTTP errors or explicit dead copy = dead.
    const looksDead = httpDead || explicitDead;
    const reason = httpDead
      ? `HTTP ${status}`
      : explicitDead
        ? "พบข้อความว่าหน้านี้ถูกลบ/ไม่พร้อมใช้งาน"
        : undefined;
    return {
      url,
      title: data?.data?.metadata?.title,
      markdown: md,
      httpStatus: status,
      reachable: !looksDead,
      unavailableReason: reason,
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
    let fbStatus: { url: string; reachable: boolean; reason?: string } | null = null;

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
      fbStatus = {
        url: f.url,
        reachable: !!f.reachable && !f.error,
        reason: f.error
          ? `Scrape failed: ${f.error}`
          : f.unavailableReason ?? (f.reachable ? undefined : "ไม่พบเนื้อหาที่ใช้งานได้บนเพจ"),
      };
      sources.push({
        source: fbStatus.reachable ? "Facebook (live)" : "Facebook (UNREACHABLE)",
        url: f.url,
        title: f.title,
        content: fbStatus.reachable
          ? (f.markdown ?? "")
          : `⚠️ FACEBOOK PAGE UNREACHABLE — ${fbStatus.reason}\n` +
            `อย่าใช้ข้อมูลจากเพจนี้เป็นหลักฐาน เพราะหน้านี้อาจถูกลบ/ปิดการมองเห็น\n\n` +
            (f.markdown ?? `(scrape failed: ${f.error ?? "unknown"})`),
      });
    }

    // 3) Google Search via Firecrawl
    const searchQueries = [
      `${data.businessName}`,
      `${data.businessName} จองคิว booking reservation`,
      `${data.businessName} LINE Official Account lin.ee line.me`,
      `${data.businessName} mobile app application download`,
      `${data.businessName} customer service contact 24 ชั่วโมง`,
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

    const fbWarning = fbStatus
      ? fbStatus.reachable
        ? `Facebook URL ที่ผู้ใช้ส่งมา (${fbStatus.url}) เข้าถึงได้ปกติ ใช้เป็นหลักฐานได้`
        : `⚠️ Facebook URL ที่ผู้ใช้ส่งมา (${fbStatus.url}) ไม่พร้อมใช้งาน (${fbStatus.reason}). ` +
          `ห้ามตั้ง facebook_instagram = true จากลิงก์นี้เพียงอย่างเดียว — ต้องมีหลักฐาน Facebook/IG อื่น (เช่นเพจที่ active จาก Google Search) ถึงจะ true ได้ และต้องอธิบายให้ชัดในช่อง evidence ว่าลิงก์ที่ส่งมา dead`
      : "ผู้ใช้ไม่ได้ระบุ Facebook URL";

    const prompt = `คุณคือ AI Business Analyst วิเคราะห์ "AI Potential Usage Signals" ของธุรกิจ "${data.businessName}"

กฎสำคัญ (ห้ามฝ่าฝืน):
- ตอบ true ก็ต่อเมื่อ "พบหลักฐานชัดเจน" จาก DATA ด้านล่าง ห้ามเดา ห้ามใช้ความรู้ภายนอก
- ทุก signal ต้องระบุ evidence_url (URL ของ source ที่พบหลักฐาน) และ evidence_snippet (ข้อความต้นฉบับ ≤200 ตัวอักษร ที่ยกมาจาก DATA ตรง ๆ)
- ถ้า evidence_snippet ว่าง = ต้องตอบ false
- confidence: high = หลักฐานชัดมาก (เช่น พบลิงก์ lin.ee/, line.me/ti/p/ ตรง ๆ), medium = พบกล่าวถึงแต่ไม่ใช่ลิงก์ตรง, low = พบสัญญาณอ้อม
- LINE OA: ต้องเจอลิงก์ lin.ee, line.me, @LINE ID หรือคำว่า "LINE Official" / "LINE OA" อย่างชัดเจน อย่าสับสนกับคำว่า "online" หรือ "line up"
- ${fbWarning}
- booking_system: ต้องมีระบบจอง/นัดหมายออนไลน์จริง ไม่ใช่แค่ "โทรมาจอง"
- service_24_7: ต้องเจอข้อความ "24 ชม.", "24/7", "ตลอด 24 ชั่วโมง" หรือเทียบเท่า
- mobile_application: ต้องเจอลิงก์ App Store / Google Play หรือชื่อแอปที่ดาวน์โหลดได้

Signals: customer_support, service_24_7, booking_system, line_oa, facebook_instagram, mobile_application

ตอบเป็นภาษาไทยใน summary / evidence / recommendations
ai_readiness_score = 0-100 (signals true เยอะ + confidence สูง = score สูง)

=== DATA ===
${corpus.slice(0, 25000)}`;

    let analysis: AnalysisResult;
    try {
      const { text } = await generateText({
        model,
        prompt:
          prompt +
          `\n\n=== OUTPUT FORMAT ===\nตอบกลับเป็น JSON object เท่านั้น (ไม่มีข้อความอื่น ไม่มี markdown code fence) ตาม schema นี้:\n` +
          `แต่ละ signal มี field: { "present": boolean, "evidence": string (เหตุผลภาษาไทย), "source": string (ชื่อ source เช่น "Official Website"), "evidence_url": string (URL ที่พบหลักฐาน), "evidence_snippet": string (ข้อความต้นฉบับยกมา ≤200 ตัวอักษร), "confidence": "high"|"medium"|"low" }\n` +
          `Top-level: { "summary": string, "ai_readiness_score": number(0-100), "signals": { customer_support, service_24_7, booking_system, line_oa, facebook_instagram, mobile_application }, "recommendations": string[] }`,
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
      facebookStatus: fbStatus,
      analysis,
    };
  });