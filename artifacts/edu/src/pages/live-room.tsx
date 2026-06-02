import { useEffect, useRef, useState, useCallback } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useUser } from "@clerk/react";
import {
  useGetLiveClass, useStartLiveClass, useEndLiveClass,
  getGetLiveClassQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Users, Clock, Video, VideoOff, Mic, MicOff,
  MonitorUp, MessageSquare, PhoneOff, Radio, Circle,
  BookOpen, Calendar, Wifi, WifiOff, Loader2, Play,
  ChevronRight,
} from "lucide-react";

/* ─── Jitsi IFrame API types ───────────────────────────────────── */
declare global {
  interface Window {
    JitsiMeetExternalAPI: new (
      domain: string,
      options: {
        roomName: string;
        width?: string | number;
        height?: string | number;
        parentNode?: HTMLElement;
        configOverwrite?: Record<string, unknown>;
        interfaceConfigOverwrite?: Record<string, unknown>;
        userInfo?: { displayName?: string; email?: string };
      }
    ) => JitsiAPI;
  }
}

interface JitsiAPI {
  on(event: string, handler: (data?: Record<string, unknown>) => void): void;
  dispose(): void;
  executeCommand(command: string, ...args: unknown[]): void;
  getParticipantsInfo(): Array<{ displayName: string; participantId: string }>;
  isAudioMuted(): Promise<boolean>;
  isVideoMuted(): Promise<boolean>;
}

/* ─── Jitsi script loader (singleton) ─────────────────────────── */
let _jitsiLoading = false;
let _jitsiReady = false;
const _jitsiCallbacks: Array<() => void> = [];

function loadJitsi(onReady: () => void) {
  if (_jitsiReady) { onReady(); return; }
  _jitsiCallbacks.push(onReady);
  if (_jitsiLoading) return;
  _jitsiLoading = true;
  const s = document.createElement("script");
  s.src = "https://meet.jit.si/external_api.js";
  s.onload = () => {
    _jitsiReady = true;
    _jitsiCallbacks.forEach((fn) => fn());
    _jitsiCallbacks.length = 0;
  };
  document.head.appendChild(s);
}

/* ─── Format helpers ────────────────────────────────────────────── */
function formatTime(d: string | Date) {
  return new Date(d).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
function durStr(mins: number) {
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h}h ${m > 0 ? `${m}m` : ""}` : `${m}m`;
}

/* ─── Status badge ─────────────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  if (status === "live") return (
    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 text-[11px] font-bold uppercase tracking-wide">
      <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
      Live
    </span>
  );
  if (status === "scheduled") return (
    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 text-[11px] font-bold uppercase tracking-wide">
      <Clock className="h-3 w-3" />
      Scheduled
    </span>
  );
  return (
    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-500/20 border border-slate-500/40 text-slate-400 text-[11px] font-bold uppercase tracking-wide">
      Ended
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Main live room component
══════════════════════════════════════════════════════════════════ */
export default function LiveRoom() {
  const [, params] = useRoute<{ classId: string }>("/live/:classId/room");
  const classId = params?.classId ? parseInt(params.classId) : 0;
  const [, navigate] = useLocation();
  const { user } = useUser();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: cls, isLoading } = useGetLiveClass(classId, {
    query: {
      enabled: classId > 0,
      queryKey: getGetLiveClassQueryKey(classId),
      refetchInterval: 10_000,
    },
  });

  const { mutateAsync: startClass, isPending: starting } = useStartLiveClass();
  const { mutateAsync: endClass, isPending: ending } = useEndLiveClass();

  const isInstructor = !!user && cls?.instructorId === user.id;

  /* ─── Jitsi room state ─────────────────────────────────────── */
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiAPI | null>(null);
  const [jitsiReady, setJitsiReady] = useState(false);
  const [roomJoined, setRoomJoined] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [audioMuted, setAudioMuted] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  /* ─── Init Jitsi when room is live ────────────────────────── */
  const initJitsi = useCallback(() => {
    if (!containerRef.current || !cls?.roomName || apiRef.current) return;

    loadJitsi(() => {
      if (!containerRef.current || apiRef.current) return;
      try {
        const api = new window.JitsiMeetExternalAPI("meet.jit.si", {
          roomName: cls.roomName!,
          width: "100%",
          height: "100%",
          parentNode: containerRef.current,
          configOverwrite: {
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            prejoinPageEnabled: false,
            disableDeepLinking: true,
            enableClosePage: false,
            disableThirdPartyRequests: false,
            analytics: { disabled: true },
            toolbarButtons: [
              "microphone", "camera", "desktop", "fullscreen",
              "fodeviceselection", "hangup", "chat", "raisehand",
              "videoquality", "filmstrip", "participants-pane",
              "tileview", "select-background", "stats",
              ...(isInstructor ? ["recording", "mute-everyone", "kick"] : []),
            ],
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            DISABLE_JOIN_LEAVE_NOTIFICATIONS: false,
            SHOW_CHROME_EXTENSION_BANNER: false,
            DEFAULT_BACKGROUND: "#0f172a",
            ENFORCE_NOTIFICATION_AUTO_DISMISS_TIMEOUT: 5000,
            HIDE_INVITE_MORE_HEADER: true,
          },
          userInfo: {
            displayName: user?.fullName ?? user?.firstName ?? "Participant",
          },
        });

        apiRef.current = api;

        api.on("videoConferenceJoined", () => {
          setRoomJoined(true);
          setParticipantCount((c) => c + 1);
        });
        api.on("participantJoined", () => setParticipantCount((c) => c + 1));
        api.on("participantLeft", () => setParticipantCount((c) => Math.max(0, c - 1)));
        api.on("audioMuteStatusChanged", (d) => setAudioMuted(!!(d as { muted: boolean }).muted));
        api.on("videoMuteStatusChanged", (d) => setVideoMuted(!!(d as { muted: boolean }).muted));
        api.on("recordingStatusChanged", (d) => setIsRecording(!!(d as { on: boolean }).on));
        api.on("videoConferenceLeft", () => {
          setRoomJoined(false);
          if (!isInstructor) navigate("/live");
        });
      } catch (err) {
        console.error("Jitsi init failed", err);
        toast({ title: "Could not connect to room", variant: "destructive" });
      }
    });
  }, [cls?.roomName, isInstructor, user, navigate, toast]);

  useEffect(() => {
    if (cls?.status === "live" && cls.roomName) {
      setJitsiReady(true);
    }
  }, [cls?.status, cls?.roomName]);

  useEffect(() => {
    if (jitsiReady) initJitsi();
    return () => {
      if (apiRef.current) {
        apiRef.current.dispose();
        apiRef.current = null;
      }
    };
  }, [jitsiReady, initJitsi]);

  /* ─── Instructor controls ──────────────────────────────────── */
  const handleStart = async () => {
    try {
      await startClass({ classId });
      await qc.invalidateQueries({ queryKey: getGetLiveClassQueryKey(classId) });
      toast({ title: "Session started! Room is now live." });
    } catch {
      toast({ title: "Could not start session", variant: "destructive" });
    }
  };

  const handleEnd = async () => {
    if (!confirm("End this session for all participants?")) return;
    try {
      apiRef.current?.executeCommand("hangup");
      await endClass({ classId });
      await qc.invalidateQueries({ queryKey: getGetLiveClassQueryKey(classId) });
      toast({ title: "Session ended." });
      setTimeout(() => navigate("/live"), 1500);
    } catch {
      toast({ title: "Could not end session", variant: "destructive" });
    }
  };

  const toggleRecording = () => {
    if (!apiRef.current) return;
    if (isRecording) {
      apiRef.current.executeCommand("stopRecording", "file");
    } else {
      apiRef.current.executeCommand("startRecording", { mode: "file" });
    }
  };

  /* ─── Loading ──────────────────────────────────────────────── */
  if (isLoading || !cls) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  const isLive = cls.status === "live";
  const isCompleted = cls.status === "completed";
  const isScheduled = cls.status === "scheduled";

  return (
    <div className="h-screen bg-slate-950 flex flex-col overflow-hidden">
      {/* ── Top bar ──────────────────────────────────────────── */}
      <div className="shrink-0 bg-slate-900 border-b border-slate-700/50 px-4 py-2.5 flex items-center gap-3">
        <Link href="/live"
          className="flex items-center gap-1.5 text-white/40 hover:text-white text-[12px] font-medium transition-colors shrink-0">
          <ArrowLeft className="h-3.5 w-3.5" />
          Sessions
        </Link>
        <span className="text-white/20 shrink-0">/</span>

        {cls.courseName && (
          <>
            <Link href={`/courses/${cls.courseId}`}
              className="text-blue-400/70 hover:text-blue-400 text-[12px] font-medium transition-colors truncate max-w-[120px] shrink-0">
              {cls.courseName}
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-white/20 shrink-0" />
          </>
        )}

        <span className="text-white/70 text-[13px] font-semibold truncate flex-1">{cls.title}</span>

        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={cls.status} />

          {isLive && roomJoined && (
            <span className="flex items-center gap-1.5 text-[12px] text-white/50">
              <Users className="h-3.5 w-3.5" />
              {participantCount}
            </span>
          )}

          {isLive && isInstructor && isRecording && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-600/20 border border-red-600/40 text-red-400 text-[11px] font-semibold">
              <Circle className="h-2 w-2 fill-red-400 text-red-400 animate-pulse" />
              Recording
            </span>
          )}

          {/* Instructor toolbar */}
          {isInstructor && isLive && (
            <div className="flex items-center gap-1.5 border-l border-slate-700 pl-2.5">
              <button onClick={toggleRecording}
                title={isRecording ? "Stop recording" : "Start recording"}
                className={cn(
                  "p-2 rounded-lg text-[12px] font-medium transition-colors flex items-center gap-1.5",
                  isRecording
                    ? "bg-red-600/20 text-red-400 hover:bg-red-600/30"
                    : "text-white/40 hover:text-white hover:bg-white/10",
                )}>
                <Radio className="h-4 w-4" />
              </button>

              <button onClick={handleEnd} disabled={ending}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[12px] font-bold transition-colors disabled:opacity-60">
                <PhoneOff className="h-3.5 w-3.5" />
                End Session
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Main area ─────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 relative">

        {/* Jitsi iframe container */}
        {isLive && (
          <div ref={containerRef} className="w-full h-full" />
        )}

        {/* Pre-join / waiting states */}
        {!isLive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-gradient-to-br from-slate-950 via-blue-950/30 to-slate-950 p-8">
            {/* Decorative */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl" />
              <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-600/5 rounded-full blur-3xl" />
            </div>

            <div className="relative z-10 text-center max-w-lg space-y-6">
              {/* Session info card */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-left space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    {cls.courseName && (
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-blue-400/70 mb-1">
                        {cls.courseName}
                      </p>
                    )}
                    <h1 className="text-white font-bold text-[22px] leading-snug">{cls.title}</h1>
                    {cls.description && (
                      <p className="text-white/40 text-[13px] mt-1 leading-relaxed">{cls.description}</p>
                    )}
                  </div>
                  <StatusBadge status={cls.status} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { Icon: Calendar, label: formatTime(cls.scheduledAt) },
                    { Icon: Clock, label: cls.duration ? durStr(cls.duration) : "Duration TBD" },
                    { Icon: Users, label: `${cls.registrationCount} registered` },
                    { Icon: BookOpen, label: cls.instructorName ?? "Instructor" },
                  ].map(({ Icon, label }) => (
                    <div key={label} className="flex items-center gap-2 text-[12px] text-white/45">
                      <Icon className="h-3.5 w-3.5 shrink-0 text-white/25" />
                      {label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Action area */}
              {isCompleted ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 justify-center text-white/40 text-[14px]">
                    <WifiOff className="h-4 w-4" />
                    This session has ended
                  </div>
                  {cls.replayUrl ? (
                    <a href={cls.replayUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-[14px] transition-colors">
                      <Play className="h-4 w-4" />
                      Watch Replay
                    </a>
                  ) : (
                    <p className="text-white/30 text-[13px]">Replay not available yet</p>
                  )}
                </div>
              ) : isScheduled && isInstructor ? (
                <div className="space-y-3">
                  <p className="text-white/50 text-[13px]">
                    You're the instructor. Start the session when ready.
                  </p>
                  <button onClick={handleStart} disabled={starting}
                    className="inline-flex items-center gap-2.5 px-8 py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-[15px] transition-colors disabled:opacity-60 shadow-lg shadow-blue-900/30">
                    {starting
                      ? <><Loader2 className="h-5 w-5 animate-spin" />Starting…</>
                      : <><Video className="h-5 w-5" />Start Session</>}
                  </button>
                </div>
              ) : isScheduled ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 justify-center">
                    <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
                    <p className="text-white/50 text-[14px]">Waiting for the instructor to start…</p>
                  </div>
                  <p className="text-white/25 text-[12px]">The room will open automatically when the session begins.</p>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* Connecting overlay — show briefly while Jitsi loads */}
        {isLive && !roomJoined && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4 z-50">
            <div className="flex items-center gap-3">
              <Wifi className="h-5 w-5 text-blue-400 animate-pulse" />
              <span className="text-white/70 text-[14px] font-medium">Connecting to room…</span>
            </div>
            <p className="text-white/30 text-[12px]">Setting up your audio and video</p>
          </div>
        )}
      </div>

      {/* ── Bottom control hints when live ──────────────────── */}
      {isLive && roomJoined && (
        <div className="shrink-0 bg-slate-900/80 border-t border-slate-700/30 px-6 py-2 flex items-center justify-between text-[11px] text-white/25">
          <div className="flex items-center gap-4">
            <span className={cn("flex items-center gap-1.5", audioMuted && "text-red-400/60")}>
              {audioMuted ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
              {audioMuted ? "Muted" : "Mic on"}
            </span>
            <span className={cn("flex items-center gap-1.5", videoMuted && "text-red-400/60")}>
              {videoMuted ? <VideoOff className="h-3 w-3" /> : <Video className="h-3 w-3" />}
              {videoMuted ? "Camera off" : "Camera on"}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-white/20">
              <MonitorUp className="h-3 w-3" />
              Screen share in toolbar
            </span>
            <span className="flex items-center gap-1.5 text-white/20">
              <MessageSquare className="h-3 w-3" />
              Chat in toolbar
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
