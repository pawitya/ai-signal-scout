import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
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
  Upload,
  Download,
  FileJson,
  FileSpreadsheet,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  facebookStatus?: { url: string; reachable: boolean; reason?: string } | null;
  analysis: AnalysisResult;
};

type BatchRow = {
  businessName: string;
  website: string;
  facebook: string;
  status: "pending" | "scanning" | "done" | "error";
  error?: string;
  result?: ServerResult;
};

const SIGNAL_KEYS = [
  "customer_support",
  "service_24_7",
  "booking_system",
  "line_oa",
  "facebook_instagram",
  "mobile_application",
] as const;

function parseCsv(text: string): Array<Record<string, string>> {
  // Minimal CSV parser with quoted field support
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { cur.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (field.length || cur.length) { cur.push(field); rows.push(cur); cur = []; field = ""; }
        if (c === "\r" && text[i + 1] === "\n") i++;
      } else field += c;
    }
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).filter((r) => r.some((c) => c.trim())).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (r[i] ?? "").trim(); });
    return obj;
  });
}

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function resultsToCsv(results: ServerResult[]): string {
  const header = [
    "businessName", "summary", "ai_readiness_score", "signal_score_10",
    "facebook_url", "facebook_reachable", "facebook_reason",
    ...SIGNAL_KEYS.flatMap((k) => [
      `${k}__present`, `${k}__confidence`, `${k}__evidence`, `${k}__evidence_url`, `${k}__evidence_snippet`, `${k}__source`,
    ]),
    "recommendations",
  ];
  const lines = [header.join(",")];
  for (const r of results) {
    const a = r.analysis;
    const trueCount = SIGNAL_KEYS.filter((k) => a.signals[k]?.present).length;
    const score10 = Math.round((trueCount / SIGNAL_KEYS.length) * 10);
    const row: string[] = [
      r.businessName, a.summary, String(a.ai_readiness_score), String(score10),
      r.facebookStatus?.url ?? "",
      r.facebookStatus ? String(r.facebookStatus.reachable) : "",
      r.facebookStatus?.reason ?? "",
    ];
    for (const k of SIGNAL_KEYS) {
      const s = a.signals[k];
      row.push(
        String(s.present),
        s.confidence ?? "",
        s.evidence ?? "",
        s.evidence_url ?? "",
        s.evidence_snippet ?? "",
        s.source ?? "",
      );
    }
    row.push(a.recommendations.join(" | "));
    lines.push(row.map(csvEscape).join(","));
  }
  return lines.join("\n");
}

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

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
          <Tabs defaultValue="single">
            <TabsList className="mb-5">
              <TabsTrigger value="single">Single scan</TabsTrigger>
              <TabsTrigger value="batch">Batch (CSV upload)</TabsTrigger>
            </TabsList>
            <TabsContent value="single">
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
            </TabsContent>
            <TabsContent value="batch">
              <BatchScan analyze={analyze} />
            </TabsContent>
          </Tabs>
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
  const { analysis, sources, businessName, facebookStatus } = data;

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

          {facebookStatus && !facebookStatus.reachable && (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">Facebook URL ที่ส่งมาเข้าไม่ได้</p>
                <p className="mt-0.5 break-all">{facebookStatus.url}</p>
                <p className="mt-0.5">{facebookStatus.reason}</p>
              </div>
            </div>
          )}

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

          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadFile(
                `${businessName}-result.json`,
                JSON.stringify(data, null, 2),
                "application/json",
              )}
            >
              <FileJson className="h-4 w-4" /> Download JSON
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadFile(
                `${businessName}-result.csv`,
                resultsToCsv([data]),
                "text/csv;charset=utf-8",
              )}
            >
              <FileSpreadsheet className="h-4 w-4" /> Download CSV
            </Button>
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
                {sig.evidence_snippet && (
                  <p className="mt-2 rounded-md bg-muted/60 p-2 text-[11px] italic text-foreground/70">
                    “{sig.evidence_snippet}”
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                  {sig.confidence && (
                    <span className="rounded-sm border border-border px-1.5 py-0.5 uppercase tracking-wide">
                      conf: {sig.confidence}
                    </span>
                  )}
                  {sig.source && <span>📍 {sig.source}</span>}
                  {sig.evidence_url && (
                    <a
                      href={sig.evidence_url}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-primary hover:underline"
                    >
                      ↗ ดูแหล่งที่มา
                    </a>
                  )}
                </div>
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

function BatchScan({
  analyze,
}: {
  analyze: (args: { data: { businessName: string; website: string; facebook: string } }) => Promise<unknown>;
}) {
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [running, setRunning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const done = useMemo(() => rows.filter((r) => r.status === "done" || r.status === "error").length, [rows]);
  const completedResults = useMemo(
    () => rows.filter((r): r is BatchRow & { result: ServerResult } => r.status === "done" && !!r.result).map((r) => r.result),
    [rows],
  );

  const handleFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCsv(text);
    const mapped: BatchRow[] = parsed
      .map((r) => ({
        businessName: r["businessname"] || r["business_name"] || r["name"] || r["business"] || "",
        website: r["website"] || r["url"] || r["web"] || "",
        facebook: r["facebook"] || r["fb"] || r["facebook_url"] || "",
        status: "pending" as const,
      }))
      .filter((r) => r.businessName && (r.website || r.facebook));
    setRows(mapped);
  };

  const runAll = async () => {
    setRunning(true);
    for (let i = 0; i < rows.length; i++) {
      setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, status: "scanning" } : r)));
      try {
        const res = (await analyze({
          data: {
            businessName: rows[i].businessName,
            website: rows[i].website,
            facebook: rows[i].facebook,
          },
        })) as ServerResult;
        setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, status: "done", result: res } : r)));
      } catch (e) {
        setRows((prev) =>
          prev.map((r, idx) =>
            idx === i ? { ...r, status: "error", error: e instanceof Error ? e.message : String(e) } : r,
          ),
        );
      }
    }
    setRunning(false);
  };

  return (
    <div className="grid gap-4">
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm">
        <p className="font-medium">รูปแบบ CSV</p>
        <p className="mt-1 text-xs text-muted-foreground">
          ต้องมี header: <code className="rounded bg-muted px-1">businessName,website,facebook</code> —
          แต่ละแถวต้องมี businessName และอย่างน้อย 1 ใน website/facebook
        </p>
        <pre className="mt-2 overflow-x-auto rounded bg-background p-2 text-[11px]">
{`businessName,website,facebook
โรงพยาบาลกรุงเทพ,https://www.bangkokhospital.com,https://facebook.com/bangkokhospitalclub
Café Amazon,https://www.cafe-amazon.com,https://facebook.com/CafeAmazonOfficial`}
        </pre>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = "";
          }}
        />
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={running}>
          <Upload className="h-4 w-4" /> เลือกไฟล์ CSV
        </Button>
        <Button
          onClick={runAll}
          disabled={running || rows.length === 0}
          className="bg-[image:var(--gradient-primary)] shadow-[var(--shadow-elegant)] hover:opacity-95"
        >
          {running ? (<><Loader2 className="h-4 w-4 animate-spin" /> กำลัง scan {done}/{rows.length}</>) : (
            <>เริ่ม scan {rows.length} บริษัท <ArrowRight className="h-4 w-4" /></>
          )}
        </Button>
        {completedResults.length > 0 && (
          <>
            <Button
              variant="outline"
              onClick={() => downloadFile(
                `batch-results-${Date.now()}.json`,
                JSON.stringify(completedResults, null, 2),
                "application/json",
              )}
            >
              <FileJson className="h-4 w-4" /> Download JSON
            </Button>
            <Button
              variant="outline"
              onClick={() => downloadFile(
                `batch-results-${Date.now()}.csv`,
                resultsToCsv(completedResults),
                "text/csv;charset=utf-8",
              )}
            >
              <FileSpreadsheet className="h-4 w-4" /> Download CSV
            </Button>
          </>
        )}
      </div>

      {rows.length > 0 && (
        <>
          <Progress value={(done / rows.length) * 100} />
          <div className="max-h-80 overflow-y-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/80 text-left">
                <tr>
                  <th className="p-2">#</th>
                  <th className="p-2">Business</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Score</th>
                  <th className="p-2">Signals (T/F)</th>
                  <th className="p-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const sigs = r.result?.analysis.signals;
                  const tcount = sigs ? SIGNAL_KEYS.filter((k) => sigs[k]?.present).length : 0;
                  return (
                    <tr key={i} className="border-t border-border">
                      <td className="p-2 text-muted-foreground">{i + 1}</td>
                      <td className="p-2 font-medium">{r.businessName}</td>
                      <td className="p-2">
                        {r.status === "pending" && <span className="text-muted-foreground">รอ</span>}
                        {r.status === "scanning" && <span className="inline-flex items-center gap-1 text-primary"><Loader2 className="h-3 w-3 animate-spin" /> scanning</span>}
                        {r.status === "done" && <span className="text-[color:var(--success)]">✓ done</span>}
                        {r.status === "error" && <span className="text-destructive">✗ error</span>}
                      </td>
                      <td className="p-2 tabular-nums">{r.result ? `${Math.round((tcount / SIGNAL_KEYS.length) * 10)}/10` : "—"}</td>
                      <td className="p-2 tabular-nums">{r.result ? `${tcount}/${SIGNAL_KEYS.length}` : "—"}</td>
                      <td className="p-2 text-muted-foreground">
                        {r.error
                          ?? (r.result?.facebookStatus && !r.result.facebookStatus.reachable
                            ? "⚠ FB ลิงก์เข้าไม่ได้"
                            : "")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// Tag to keep Download icon imported even if unused above
const _keepDownload = Download;
void _keepDownload;
