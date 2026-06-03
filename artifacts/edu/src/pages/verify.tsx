import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { Award, CheckCircle2, GraduationCap, ExternalLink, XCircle, Loader2 } from "lucide-react";

interface CertData {
  serial: string;
  courseId: number;
  courseTitle?: string;
  userId: string;
  userName?: string;
  instructorName?: string;
  issuedAt: string;
}

export default function VerifyCertificate() {
  const { serial } = useParams<{ serial: string }>();
  const [cert, setCert] = useState<CertData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!serial) return;
    setLoading(true);
    fetch(`/api/certificates/${serial}`)
      .then((r) => {
        if (!r.ok) throw new Error("Certificate not found");
        return r.json();
      })
      .then((data) => { setCert(data); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [serial]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/">
            <span className="inline-flex items-center gap-2 cursor-pointer">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <GraduationCap className="h-4 w-4 text-white" />
              </div>
              <span className="font-bold text-foreground text-lg">Bright Insight</span>
            </span>
          </Link>
          <p className="text-sm text-muted-foreground mt-2">Certificate Verification</p>
        </div>

        {loading && (
          <div className="bg-white rounded-3xl shadow-xl p-10 text-center">
            <Loader2 className="h-10 w-10 text-primary animate-spin mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">Verifying certificate…</p>
          </div>
        )}

        {!loading && error && (
          <div className="bg-white rounded-3xl shadow-xl p-10 text-center">
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <XCircle className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">Certificate Not Found</h2>
            <p className="text-sm text-muted-foreground mb-6">
              The serial number <span className="font-mono font-medium text-foreground">{serial}</span> does not match any certificate in our records.
            </p>
            <Link href="/">
              <button className="px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity">
                Return to Platform
              </button>
            </Link>
          </div>
        )}

        {!loading && cert && (
          <div className="space-y-4">
            {/* Verified badge */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              <p className="text-sm font-semibold text-emerald-700">This certificate is authentic and verified.</p>
            </div>

            {/* Certificate card */}
            <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
              <div className="relative bg-gradient-to-br from-primary/90 via-primary to-blue-700 p-8 text-white">
                <div className="absolute top-4 right-4 opacity-15">
                  <Award className="h-20 w-20" />
                </div>
                <div className="flex items-center gap-2 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                    <GraduationCap className="h-5 w-5" />
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-widest text-white/80">
                    Certificate of Completion
                  </span>
                </div>
                <h2 className="text-2xl font-bold leading-snug mb-2">{cert.courseTitle ?? `Course #${cert.courseId}`}</h2>
                <p className="text-white/80 text-sm">Awarded to <span className="font-semibold text-white">{cert.userName ?? "—"}</span></p>
              </div>

              <div className="p-6 space-y-3">
                {[
                  { label: "Issued", value: new Date(cert.issuedAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) },
                  cert.instructorName ? { label: "Instructor", value: cert.instructorName } : null,
                  { label: "Serial Number", value: cert.serial },
                ].filter(Boolean).map(({ label, value }: any) => (
                  <div key={label} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className={label === "Serial Number" ? "font-mono text-xs font-medium text-foreground" : "font-medium text-foreground"}>{value}</span>
                  </div>
                ))}

                <div className="pt-3 border-t border-border flex gap-3">
                  <a
                    href={`https://brightinsight.app/courses/${cert.courseId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-xl bg-secondary text-foreground hover:bg-secondary/70 transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> View Course
                  </a>
                  <Link href="/dashboard" className="flex-1">
                    <button className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-xl bg-primary text-white hover:opacity-90 transition-opacity">
                      <GraduationCap className="h-3.5 w-3.5" /> Join Platform
                    </button>
                  </Link>
                </div>
              </div>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              Verified by Bright Insight · <span className="font-mono">{cert.serial}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
