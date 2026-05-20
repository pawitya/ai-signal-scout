import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  Sparkles,
  Globe,
  Facebook,
  Search,
  Loader2,
  Headphones,
  Clock,
  CalendarCheck,
  MessageCircle,
  Smartphone,
  ArrowRight,
  CheckCircle2,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { analyzeBusinessSignals, type AnalysisResult } from "@/lib/analyze.functions";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "AI Signal Scout — วิเคราะห์ AI Potential ของธุรกิจ" },
      {
        name: "description",
        content:
          "Scrape Website, Facebook และ Google Search เพื่อวิเคราะห์ AI usage signals ของธุรกิจอัตโนมัติ",
      },
    ],
  }),
});

const SIGNAL_META: Record<
  keyof AnalysisResult["signals"],
  { label: string; icon: typeof Headphones }
> = {
  customer_support: { label: "Customer Support", icon: Headphones },
  service_24_7: { label: "24/7 Service", icon: Clock },
  booking_system: { label: "Booking System", icon: CalendarCheck },
  line_oa: { label: "LINE OA", icon: MessageCircle },
  facebook_instagram: { label: "Facebook / Instagram", icon: Facebook },
  mobile_application: { label: "Mobile Application", icon: Smartphone },
};

type ServerResult = {
  businessName: string;
  sources: Array<{ source: string; url: string; title?: string }>;
  analysis: AnalysisResult;
};

function Index() {
  const analyze = useServerFn(analyzeBusinessSignals);
  const [businessName, setBusinessName] = useState("");
  const [website, setWebsite] = useState("");
  const [facebook, setFacebook] = useState("");

  const mutation = useMutation<ServerResult, Error, void>({
    mutationFn: async () => {
      const res = await analyze({
        data: {
          businessName: businessName.trim(),
          website: website.trim(),
          facebook: facebook.trim(),
        },
      });
      return res as ServerResult;
    },
  });

  const result = mutation.data;

  return (
    <div className="min-h-screen bg-background">
      <div className="absolute inset-x-0 top-0 -z-10 h-[520px] bg-[image:var(--gradient-surface)]" />

      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-elegant)]">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight">AI Signal Scout</p>
            <p className="text-xs text-muted-foreground">Business AI readiness scanner</p>
          </div>
        </div>
        <a
          href="#scan"
          className="hidden text-sm text-muted-foreground hover:text-foreground sm:block"
        >
          เริ่ม scan →
        </a>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24">
        <section className="pt-10 pb-14 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--success)]" />
            Powered by Firecrawl + Lovable AI
          </span>
          <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">
            วิเคราะห์ <span className="bg-[image:var(--gradient-primary)] bg-clip-text text-transparent">AI Potential</span>
            <br />ของธุรกิจในไม่กี่วินาที
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground">
            ใส่ชื่อธุรกิจ + URL — เรา scrape Website, Facebook และ Google Search
            แล้ววิเคราะห์ 6 signals สำคัญให้อัตโนมัติ
          </p>
        </section>

        <Card id="scan" className="mx-auto max-w-3xl border-border bg-card p-6 shadow-[var(--shadow-card)] sm:p-8">
          <div className="grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="biz">ชื่อธุรกิจ *</Label>
              <Input
                id="biz"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="เช่น โรงพยาบาลกรุงเทพ, Café Amazon"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="web" className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5" /> Website
                </Label>
                <Input
                  id="web"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://example.com"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="fb" className="flex items-center gap-1.5">
                  <Facebook className="h-3.5 w-3.5" /> Facebook Page
                </Label>
                <Input
                  id="fb"
                  value={facebook}
                  onChange={(e) => setFacebook(e.target.value)}
                  placeholder="https://facebook.com/yourpage"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 pt-2">
              <p className="text-xs text-muted-foreground">
                * ระบุ Website หรือ Facebook อย่างน้อย 1 อย่าง
              </p>
              <Button
                size="lg"
                disabled={
                  !businessName.trim() ||
                  (!website.trim() && !facebook.trim()) ||
                  mutation.isPending
                }
                onClick={() => mutation.mutate()}
                className="bg-[image:var(--gradient-primary)] shadow-[var(--shadow-elegant)] hover:opacity-95"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> กำลัง scan...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4" /> Scan signals <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>

        {mutation.isError && (
          <div className="mx-auto mt-6 max-w-3xl rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {(mutation.error as Error).message}
          </div>
        )}

        {mutation.isPending && (
          <div className="mx-auto mt-10 max-w-3xl space-y-3 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
            <p>กำลัง scrape sources และวิเคราะห์ด้วย AI...</p>
            <p className="text-xs">ใช้เวลา ~20-40 วินาที</p>
          </div>
        )}

        {result && <Results data={result} />}
      </main>
    </div>
  );
}

function Results({ data }: { data: ServerResult }) {
  const { analysis, sources, businessName } = data;

  const signalKeys = Object.keys(SIGNAL_META) as Array<keyof typeof SIGNAL_META>;
  const trueCount = signalKeys.filter((k) => analysis.signals[k]?.present).length;
  const totalCount = signalKeys.length;
  const signalScore = Math.round((trueCount / totalCount) * 10);

  return (
    <section className="mx-auto mt-12 max-w-5xl space-y-8">
      <Card className="overflow-hidden border-border bg-card p-0 shadow-[var(--shadow-card)]">
        <div className="bg-[image:var(--gradient-surface)] p-6 sm:p-8">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Analysis Report</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">{businessName}</h2>
          <p className="mt-3 text-sm text-muted-foreground">{analysis.summary}</p>

          <div className="mt-6">
            <p className="text-xs text-muted-foreground">
              Signal Score ({trueCount}/{totalCount} signals)
            </p>
            <p className="text-4xl font-bold tabular-nums text-primary">
              {signalScore}
              <span className="text-base font-normal text-muted-foreground">/10</span>
            </p>
            <Progress value={signalScore * 10} className="mt-2" />
          </div>
        </div>
      </Card>

      <div>
        <h3 className="mb-4 text-lg font-semibold">Signal Analysis</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(SIGNAL_META) as Array<keyof typeof SIGNAL_META>).map((key) => {
            const meta = SIGNAL_META[key];
            const sig = analysis.signals[key];
            const Icon = meta.icon;
            return (
              <Card key={key} className="border-border bg-card p-5 shadow-[var(--shadow-card)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                      sig.present
                        ? "bg-[color:var(--success)]/15 text-[color:var(--success)] border-[color:var(--success)]/30"
                        : "bg-destructive/10 text-destructive border-destructive/30"
                    }`}
                  >
                    {sig.present ? "True" : "False"}
                  </span>
                </div>
                <p className="mt-3 text-sm font-semibold">{meta.label}</p>
                <p className="mt-3 text-xs leading-relaxed text-foreground/80">{sig.evidence}</p>
                {sig.source && (
                  <p className="mt-2 text-[11px] text-muted-foreground">📍 {sig.source}</p>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {analysis.recommendations.length > 0 && (
        <Card className="border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <h3 className="text-lg font-semibold">Recommendations</h3>
          <ul className="mt-4 space-y-2.5">
            {analysis.recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {sources.length > 0 && (
        <Card className="border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <h3 className="text-sm font-semibold text-muted-foreground">Sources scraped</h3>
          <ul className="mt-3 space-y-1.5 text-sm">
            {sources.map((s, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs">{s.source}</span>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-primary hover:underline"
                >
                  {s.title || s.url}
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}
