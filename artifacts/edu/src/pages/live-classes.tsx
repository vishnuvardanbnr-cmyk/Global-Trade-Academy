import { useState } from "react";
import { Link } from "wouter";
import {
  useListMyLiveClasses, getListMyLiveClassesQueryKey,
  useRegisterLiveClass,
  type LiveClass,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Calendar, Clock, Users, Play, Radio, BookOpen,
  Video, Inbox, ExternalLink, Layers,
} from "lucide-react";

/* ─── Helpers ─────────────────────────────────────────────────── */
function formatDate(d: string | Date) {
  return new Date(d).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
function durStr(mins: number) {
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ""}` : `${m}m`;
}
function CountdownTimer({ scheduledAt }: { scheduledAt: string | Date }) {
  const diff = new Date(scheduledAt).getTime() - Date.now();
  if (diff <= 0) return <span className="text-[11px] text-amber-500 font-semibold">Starting soon</span>;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 48) return <span className="text-[11px] text-slate-400">In {Math.floor(h / 24)} days</span>;
  if (h > 0) return <span className="text-[11px] text-amber-500 font-semibold">In {h}h {m}m</span>;
  return <span className="text-[11px] text-red-500 font-semibold animate-pulse">In {m}m</span>;
}

/* ─── Group label (course or batch) ──────────────────────────── */
function GroupLabel({ cls }: { cls: LiveClass }) {
  if ((cls as any).batchName) {
    return (
      <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-2 py-0.5">
        <Layers className="h-2.5 w-2.5" />
        {(cls as any).batchName}
      </span>
    );
  }
  if (cls.courseName) {
    return (
      <Link href={`/courses/${cls.courseId}`}
        className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-blue-600/70 hover:text-blue-600 transition-colors">
        <BookOpen className="h-2.5 w-2.5" />
        {cls.courseName}
      </Link>
    );
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════
   Live Classes page — shows only classes for enrolled
   courses + the student's own batches
═══════════════════════════════════════════════════════════════ */
export default function LiveClasses() {
  const { toast } = useToast();
  const [registering, setRegistering] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "courses" | "batches">("all");

  const { data: allClasses = [], isLoading } = useListMyLiveClasses({
    query: { queryKey: getListMyLiveClassesQueryKey(), refetchInterval: 30_000 },
  });

  const register = useRegisterLiveClass({
    mutation: {
      onSuccess: () => {
        toast({ title: "Registered! You'll be notified when the session starts." });
        setRegistering(null);
      },
      onError: () => {
        toast({ title: "Registration failed", variant: "destructive" });
        setRegistering(null);
      },
    },
  });

  const hasBatches = allClasses.some((c) => (c as any).batchId != null);
  const hasCourses = allClasses.some((c) => c.courseId != null);

  const filtered = allClasses.filter((c) => {
    if (filter === "courses") return c.courseId != null && (c as any).batchId == null;
    if (filter === "batches") return (c as any).batchId != null;
    return true;
  });

  const live      = filtered.filter((c) => c.status === "live");
  const upcoming  = filtered.filter((c) => c.status === "scheduled");
  const completed = filtered.filter((c) => c.status === "completed");

  const isEmpty = !isLoading && live.length === 0 && upcoming.length === 0 && completed.length === 0;

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Live Classes</h1>
        <p className="text-slate-500 text-sm mt-1">Sessions from your enrolled courses and batches</p>
      </div>

      {/* ── Filter tabs (only when both types exist) ─────────── */}
      {hasBatches && hasCourses && (
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
          {(["all", "courses", "batches"] as const).map((t) => (
            <button key={t} onClick={() => setFilter(t)}
              className={cn(
                "px-4 py-1.5 rounded-lg text-[13px] font-medium transition-colors capitalize",
                filter === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
              )}>
              {t}
            </button>
          ))}
        </div>
      )}

      {/* ── Loading ─────────────────────────────────────────────── */}
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-52 rounded-2xl" />)}
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────── */}
      {isEmpty && allClasses.length === 0 && (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
            <Video className="h-7 w-7 text-slate-300" />
          </div>
          <p className="font-semibold text-slate-700">No live classes yet</p>
          <p className="text-slate-400 text-[13px]">Enrol in a course to see its live sessions here.</p>
        </div>
      )}
      {isEmpty && allClasses.length > 0 && (
        <p className="text-center text-slate-400 text-sm py-10">No sessions in this category.</p>
      )}

      {/* ── Currently LIVE ─────────────────────────────────────── */}
      {live.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <h2 className="text-[15px] font-bold text-slate-800">Happening Now</h2>
          </div>
          {live.map((cls) => (
            <div key={cls.id}
              className="flex flex-col sm:flex-row items-start sm:items-center gap-5 p-5 rounded-2xl bg-gradient-to-r from-red-50 to-rose-50 border border-red-200">
              <div className="w-14 h-14 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <Radio className="h-6 w-6 text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="mb-1"><GroupLabel cls={cls} /></div>
                <h3 className="text-[17px] font-bold text-slate-900 leading-snug truncate">{cls.title}</h3>
                {cls.description && <p className="text-[12.5px] text-slate-500 mt-0.5 line-clamp-1">{cls.description}</p>}
                <div className="flex items-center gap-3 mt-1.5 text-[12px] text-slate-500 flex-wrap">
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" />{cls.registrationCount} registered</span>
                  {cls.duration && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{durStr(cls.duration)}</span>}
                  {cls.instructorName && <span>by {cls.instructorName}</span>}
                </div>
              </div>
              {cls.meetingType === "zoom" && cls.meetingUrl ? (
                <a href={cls.meetingUrl} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-[13.5px] transition-colors shrink-0 shadow-lg shadow-blue-200">
                  <ExternalLink className="h-4 w-4" />Join Zoom
                </a>
              ) : (
                <Link href={`/live/${cls.id}/room`}
                  className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-[13.5px] transition-colors shrink-0 shadow-lg shadow-red-200">
                  <Play className="h-4 w-4 fill-white" />Join Now
                </Link>
              )}
            </div>
          ))}
        </section>
      )}

      {/* ── Upcoming ───────────────────────────────────────────── */}
      {!isLoading && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="h-4 w-4 text-slate-400" />
            <h2 className="text-[15px] font-bold text-slate-800">Upcoming Sessions</h2>
            {upcoming.length > 0 && (
              <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[11px] font-semibold rounded-full">{upcoming.length}</span>
            )}
          </div>
          {upcoming.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Inbox className="h-10 w-10 text-slate-200" />
              <p className="text-slate-400 text-[13.5px]">No upcoming sessions scheduled.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {upcoming.map((cls) => (
                <div key={cls.id}
                  className="flex flex-col bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-slate-200 transition-all overflow-hidden">
                  <div className="relative h-28 bg-gradient-to-br from-blue-900 via-indigo-900 to-slate-900 overflow-hidden">
                    {cls.thumbnailUrl
                      ? <img src={cls.thumbnailUrl} alt={cls.title} className="w-full h-full object-cover opacity-60" />
                      : <div className="absolute inset-0 flex items-center justify-center"><Video className="h-10 w-10 text-white/15" /></div>}
                    <div className="absolute top-3 left-3"><GroupLabel cls={cls} /></div>
                    <div className="absolute bottom-3 right-3"><CountdownTimer scheduledAt={cls.scheduledAt} /></div>
                  </div>
                  <div className="flex-1 flex flex-col p-4 gap-3">
                    <div className="flex-1">
                      <h3 className="text-[14px] font-bold text-slate-900 leading-snug line-clamp-2">{cls.title}</h3>
                      <div className="flex items-center gap-3 mt-1.5 text-[11.5px] text-slate-400 flex-wrap">
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(cls.scheduledAt)}</span>
                        {cls.duration && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{durStr(cls.duration)}</span>}
                      </div>
                      <div className="flex items-center justify-between mt-2 text-[11px] text-slate-400">
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{cls.registrationCount} registered</span>
                        {cls.maxAttendees && <span className="text-slate-300">Max {cls.maxAttendees}</span>}
                      </div>
                    </div>
                    <button
                      disabled={registering === cls.id}
                      onClick={() => { setRegistering(cls.id); register.mutate({ classId: cls.id }); }}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[13px] font-bold transition-colors disabled:opacity-60">
                      {registering === cls.id ? "Registering…" : "Register"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Completed / Replays ────────────────────────────────── */}
      {completed.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Play className="h-4 w-4 text-slate-400" />
            <h2 className="text-[15px] font-bold text-slate-800">Session Replays</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {completed.map((cls) => (
              <div key={cls.id}
                className="flex flex-col bg-white rounded-2xl border border-slate-100 overflow-hidden opacity-90 hover:opacity-100 transition-opacity">
                <div className="relative h-24 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 flex items-center justify-center">
                  {cls.thumbnailUrl
                    ? <img src={cls.thumbnailUrl} alt={cls.title} className="w-full h-full object-cover opacity-40" />
                    : <Play className="h-8 w-8 text-white/15" />}
                  <div className="absolute top-2 left-2 px-2 py-0.5 bg-slate-600/60 text-white/60 rounded-full text-[10px] font-semibold backdrop-blur-sm">Ended</div>
                  <div className="absolute top-2 right-2"><GroupLabel cls={cls} /></div>
                </div>
                <div className="flex-1 flex flex-col p-4 gap-3">
                  <div className="flex-1">
                    <h3 className="text-[14px] font-bold text-slate-700 leading-snug line-clamp-2">{cls.title}</h3>
                    <p className="text-[11.5px] text-slate-400 mt-1 flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(cls.scheduledAt)}</p>
                  </div>
                  {cls.replayUrl ? (
                    <a href={cls.replayUrl} target="_blank" rel="noopener noreferrer"
                      className="w-full flex items-center justify-center gap-1.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-[13px] font-bold transition-colors">
                      <Play className="h-3.5 w-3.5 fill-white" />Watch Replay
                    </a>
                  ) : (
                    <button disabled className="w-full py-2 bg-slate-100 text-slate-400 rounded-xl text-[13px] font-semibold cursor-not-allowed">
                      Replay not available
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
