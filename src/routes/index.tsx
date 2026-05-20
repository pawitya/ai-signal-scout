import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
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
  Plus,
  Trash2,
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

type Company = { id: string; businessName: string; website: string; facebook: string };
type ScanItem = {
  id: string;
  businessName: string;
  status: "pending" | "scanning" | "done" | "error";
  error?: string;
  result?: ServerResult;
};

const SIGNAL_KEYS_ORDER: Array<keyof AnalysisResult["signals"]> = [
  "customer_support",
  "service_24_7",
  "booking_system",
  "line_oa",
  "facebook_instagram",
  "mobile_application",
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
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

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(items: ScanItem[]): string {
  const headers = [
    "business_name",
    "status",
    "signal_score_10",
    "true_count",
    "summary",
    ...SIGNAL_KEYS_ORDER.flatMap((k) => [`${k}__present`, `${k}__evidence`, `${k}__source`]),
    "recommendations",
    "sources",
  ];
  const rows = items.map((it) => {
    const a = it.result?.analysis;
    const trueCount = a ? SIGNAL_KEYS_ORDER.filter((k) => a.signals[k]?.present).length : 0;
    const score = a ? Math.round((trueCount / SIGNAL_KEYS_ORDER.length) * 10) : "";
    const sigCols = SIGNAL_KEYS_ORDER.flatMap((k) => {
      const s = a?.signals[k];
      return [s?.present ?? "", s?.evidence ?? "", s?.source ?? ""];
    });
    return [
      it.businessName,
      it.status === "error" ? `error: ${it.error ?? ""}` : it.status,
      score,
      a ? trueCount : "",
      a?.summary ?? "",
      ...sigCols,
      a?.recommendations?.join(" | ") ?? "",
      it.result?.sources?.map((s) => `${s.source}: ${s.url}`).join(" | ") ?? "",
    ].map(csvEscape).join(",");
  });
  return [headers.join(","), ...rows].join("\n");
}

function Index() {
  const analyze = useServerFn(analyzeBusinessSignals);
  const [companies, setCompanies] = useState<Company[]>([
    { id: uid(), businessName: "", website: "", facebook: "" },
  ]);
  const [scans, setScans] = useState<ScanItem[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  const updateCompany = (id: string, patch: Partial<Company>) =>
    setCompanies((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const addCompany = () =>
    setCompanies((cs) => [...cs, { id: uid(), businessName: "", website: "", facebook: "" }]);
  const removeCompany = (id: string) =>
    setCompanies((cs) => (cs.length === 1 ? cs : cs.filter((c) => c.id !== id)));

  const valid = companies.filter(
    (c) => c.businessName.trim() && (c.website.trim() || c.facebook.trim()),
  );
  const canScan = valid.length > 0 && !isScanning;

  const runScan = async () => {
    setIsScanning(true);
    const initial: ScanItem[] = valid.map((c) => ({
      id: c.id,
      businessName: c.businessName.trim(),
      status: "pending",
    }));
    setScans(initial);

    for (const c of valid) {
      setScans((prev) =>
        prev.map((s) => (s.id === c.id ? { ...s, status: "scanning" } : s)),
      );
      try {
        const res = (await analyze({
          data: {
            businessName: c.businessName.trim(),
            website: c.website.trim(),
            facebook: c.facebook.trim(),
          },
        })) as ServerResult;
        setScans((prev) =>
          prev.map((s) => (s.id === c.id ? { ...s, status: "done", result: res } : s)),
        );
      } catch (e) {
        setScans((prev) =>
          prev.map((s) =>
            s.id === c.id
              ? { ...s, status: "error", error: e instanceof Error ? e.message : String(e) }
              : s,
          ),
        );
      }
    }
    setIsScanning(false);
  };

  const doneScans = scans.filter((s) => s.status === "done");

  const handleDownloadJson = () => {
    const payload = scans.map((s) => ({
      businessName: s.businessName,
      status: s.status,
      error: s.error,
      result: s.result,
    }));
    downloadFile(
      `ai-signal-scan-${new Date().toISOString().slice(0, 19)}.json`,
      JSON.stringify(payload, null, 2),
      "application/json",
    );
  };

  const handleDownloadCsv = () => {
    downloadFile(
      `ai-signal-scan-${new Date().toISOString().slice(0, 19)}.csv`,
      buildCsv(scans),
      "text/csv",
    );
  };

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
            <br />ของหลายธุรกิจในไม่กี่วินาที
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground">
            เพิ่มได้หลายบริษัท — scan ทีละรายการแล้ว export ผลลัพธ์เป็น JSON / CSV
          </p>
        </section>

        <Card id="scan" className="mx-auto max-w-4xl border-border bg-card p-6 shadow-[var(--shadow-card)] sm:p-8">
          <div className="space-y-5">
            {companies.map((c, idx) => (
              <div key={c.id} className="rounded-lg border border-border/60 bg-background/40 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    บริษัท #{idx + 1}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={companies.length === 1 || isScanning}
                    onClick={() => removeCompany(c.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid gap-3">
                  <div className="grid gap-2">
                    <Label>ชื่อธุรกิจ *</Label>
                    <Input
                      value={c.businessName}
                      disabled={isScanning}
                      onChange={(e) => updateCompany(c.id, { businessName: e.target.value })}
                      placeholder="เช่น โรงพยาบาลกรุงเทพ"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label className="flex items-center gap-1.5">
                        <Globe className="h-3.5 w-3.5" /> Website
                      </Label>
                      <Input
                        value={c.website}
                        disabled={isScanning}
                        onChange={(e) => updateCompany(c.id, { website: e.target.value })}
                        placeholder="https://example.com"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label className="flex items-center gap-1.5">
                        <Facebook className="h-3.5 w-3.5" /> Facebook
                      </Label>
                      <Input
                        value={c.facebook}
                        disabled={isScanning}
                        onChange={(e) => updateCompany(c.id, { facebook: e.target.value })}
                        placeholder="https://facebook.com/yourpage"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button type="button" variant="outline" onClick={addCompany} disabled={isScanning}>
                <Plus className="h-4 w-4" /> เพิ่มบริษัท
              </Button>
              <div className="flex items-center gap-3">
                <p className="text-xs text-muted-foreground">
                  พร้อม scan: <span className="font-semibold text-foreground">{valid.length}</span>
                </p>
                <Button
                  size="lg"
                  disabled={!canScan}
                  onClick={runScan}
                  className="bg-[image:var(--gradient-primary)] shadow-[var(--shadow-elegant)] hover:opacity-95"
                >
                  {isScanning ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> กำลัง scan...
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4" /> Scan all <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {scans.length > 0 && (
          <section className="mx-auto mt-10 max-w-5xl space-y-6">
            <Card className="border-border bg-card p-5 shadow-[var(--shadow-card)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">Scan Progress</h3>
                  <p className="text-xs text-muted-foreground">
                    เสร็จแล้ว {doneScans.length}/{scans.length} บริษัท
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={doneScans.length === 0}
                    onClick={handleDownloadJson}
                  >
                    <Download className="h-4 w-4" /> JSON
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={doneScans.length === 0}
                    onClick={handleDownloadCsv}
                  >
                    <Download className="h-4 w-4" /> CSV
                  </Button>
                </div>
              </div>
              <ul className="mt-4 space-y-2">
                {scans.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/40 px-3 py-2 text-sm"
                  >
                    <span className="truncate font-medium">{s.businessName}</span>
                    <StatusBadge item={s} />
                  </li>
                ))}
              </ul>
            </Card>

            {doneScans.map((s) => s.result && <Results key={s.id} data={s.result} />)}
          </section>
        )}
      </main>
    </div>
  );
}

function StatusBadge({ item }: { item: ScanItem }) {
  if (item.status === "done") {
    return (
      <span className="rounded-full border border-[color:var(--success)]/30 bg-[color:var(--success)]/15 px-2.5 py-0.5 text-xs font-semibold text-[color:var(--success)]">
        Done
      </span>
    );
  }
  if (item.status === "scanning") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-primary">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Scanning…
      </span>
    );
  }
  if (item.status === "error") {
    return (
      <span
        title={item.error}
        className="truncate rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive"
      >
        Error
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">Pending</span>;
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
