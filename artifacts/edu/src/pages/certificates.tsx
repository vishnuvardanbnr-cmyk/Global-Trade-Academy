import { useListCertificates } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Award, Download, ExternalLink, GraduationCap } from "lucide-react";
import { Link } from "wouter";

function formatDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export default function Certificates() {
  const { data: certificates, isLoading } = useListCertificates();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Certificates</h1>
        <p className="text-sm text-muted-foreground">Credentials you've earned by completing courses.</p>
      </div>

      {isLoading ? (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-56 w-full rounded-2xl" />)}
        </div>
      ) : (certificates ?? []).length === 0 ? (
        <div className="text-center py-16">
          <Award className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">No certificates yet</p>
          <p className="text-xs text-muted-foreground mb-4">Complete a course end-to-end to earn your first certificate.</p>
          <Link href="/courses">
            <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity">
              Browse Courses
            </button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {(certificates ?? []).map((cert) => (
            <Card key={cert.serial} className="overflow-hidden border-border shadow-xs group">
              <div className="relative bg-gradient-to-br from-primary/90 via-primary to-blue-700 p-6 text-white">
                <div className="absolute top-3 right-3 opacity-20">
                  <Award className="h-16 w-16" />
                </div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center">
                    <GraduationCap className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-white/80">Certificate of Completion</span>
                </div>
                <h3 className="font-bold text-lg leading-snug line-clamp-2 mb-1">{cert.courseTitle ?? `Course #${cert.courseId}`}</h3>
                <p className="text-xs text-white/80">Awarded to {cert.userName ?? "you"}</p>
              </div>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Issued</span>
                  <span className="font-medium text-foreground">{formatDate(cert.issuedAt)}</span>
                </div>
                {cert.instructorName && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Instructor</span>
                    <span className="font-medium text-foreground">{cert.instructorName}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Serial</span>
                  <span className="font-mono text-[11px] text-foreground">{cert.serial}</span>
                </div>
                <div className="flex gap-2 pt-1">
                  <Link href={`/courses/${cert.courseId}`} className="flex-1">
                    <button className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-secondary text-foreground hover:bg-secondary/70 transition-colors">
                      <ExternalLink className="h-3.5 w-3.5" /> View Course
                    </button>
                  </Link>
                  <button
                    onClick={() => window.print()}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                  >
                    <Download className="h-3.5 w-3.5" /> Save
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
