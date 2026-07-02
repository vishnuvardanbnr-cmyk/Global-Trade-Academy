import { useState, useEffect, useCallback } from "react";
import {
  LiveKitRoom, GridLayout, ParticipantTile, RoomAudioRenderer,
  useTracks, useParticipants, useLocalParticipant, useRoomContext, useStartAudio,
} from "@livekit/components-react";
import { Track, RoomEvent, VideoPresets, ConnectionState } from "livekit-client";
import "@livekit/components-styles";
import { Mic, MicOff, Video, VideoOff, Monitor, PhoneOff, Users, Loader2, AlertTriangle, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

const ROOM_OPTIONS = {
  adaptiveStream: true,
  dynacast: true,
  // Keep retrying indefinitely with exponential backoff capped at 15s
  reconnectPolicy: {
    nextRetryDelayInMs: (ctx: { retryCount: number }) =>
      Math.min(1000 * Math.pow(2, ctx.retryCount), 15_000),
  },
  publishDefaults: {
    simulcast: true,
    videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360, VideoPresets.h720],
    videoEncoding: VideoPresets.h720.encoding,
    videoCodec: "vp8" as const,
    dtx: true,
    red: false,
  },
  audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  videoCaptureDefaults: { resolution: VideoPresets.h720.resolution },
};

const CONNECT_OPTIONS = {
  rtcConfig: {
    iceServers: [
      { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
      { urls: ["stun:stun.cloudflare.com:3478"] },
    ],
    iceTransportPolicy: "all" as RTCIceTransportPolicy,
  },
  maxRetries: 10,
};

function Controls({ onLeave }: { onLeave: () => void }) {
  const room = useRoomContext();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const [micOpt, setMicOpt] = useState<boolean | null>(null);
  const [camOpt, setCamOpt] = useState<boolean | null>(null);
  const [sharing, setSharing] = useState(false);
  const micOn = micOpt ?? isMicrophoneEnabled;
  const camOn = camOpt ?? isCameraEnabled;

  const toggleMic = async () => {
    setMicOpt(!micOn);
    await localParticipant.setMicrophoneEnabled(!micOn).catch(() => setMicOpt(null));
  };
  const toggleCam = async () => {
    setCamOpt(!camOn);
    await localParticipant.setCameraEnabled(!camOn).catch(() => setCamOpt(null));
  };
  const toggleScreen = async () => {
    try {
      setSharing(!sharing);
      await localParticipant.setScreenShareEnabled(!sharing);
    } catch { setSharing(false); }
  };

  return (
    <div className="flex items-center gap-3">
      <button onClick={toggleMic}
        className={cn("p-3 rounded-full transition-colors",
          micOn ? "bg-white/15 hover:bg-white/25 text-white" : "bg-red-500 hover:bg-red-600 text-white")}>
        {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
      </button>
      <button onClick={toggleCam}
        className={cn("p-3 rounded-full transition-colors",
          camOn ? "bg-white/15 hover:bg-white/25 text-white" : "bg-white/10 hover:bg-white/20 text-white/50")}>
        {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
      </button>
      <button onClick={toggleScreen}
        className={cn("p-3 rounded-full transition-colors",
          sharing ? "bg-blue-500 hover:bg-blue-600 text-white" : "bg-white/10 hover:bg-white/20 text-white/50")}>
        <Monitor className="h-5 w-5" />
      </button>
      <button onClick={() => { room.disconnect(); onLeave(); }}
        className="p-3 rounded-full bg-red-500 hover:bg-red-600 text-white transition-colors">
        <PhoneOff className="h-5 w-5" />
      </button>
    </div>
  );
}

function RoomGrid() {
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ]);
  const participants = useParticipants();
  const room = useRoomContext();
  const { mergedProps: startAudioProps, canPlayAudio } = useStartAudio({ room, props: {} });

  return (
    <div className="relative w-full h-full">
      {canPlayAudio && (
        <button {...startAudioProps}
          className="absolute top-4 left-1/2 -translate-x-1/2 z-10 px-4 py-2 bg-blue-600 text-white text-sm rounded-full">
          Click to enable audio
        </button>
      )}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 bg-black/40 backdrop-blur px-2.5 py-1 rounded-full">
        <Users className="h-3.5 w-3.5 text-white/60" />
        <span className="text-white/80 text-xs font-medium">{participants.length}</span>
      </div>
      <GridLayout tracks={tracks} style={{ height: "100%" }}>
        <ParticipantTile />
      </GridLayout>
    </div>
  );
}

function ReconnectingOverlay() {
  return (
    <div className="absolute inset-0 z-20 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
      <WifiOff className="h-8 w-8 text-white/40 animate-pulse" />
      <p className="text-white/60 text-[14px] font-medium">Reconnecting…</p>
      <p className="text-white/30 text-[11px]">Hold on, we're restoring your connection</p>
    </div>
  );
}

function RoomWithState({ onLeave }: { onLeave: () => void }) {
  const room = useRoomContext();
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    const onStateChange = (state: ConnectionState) => {
      setReconnecting(state === ConnectionState.Reconnecting);
    };
    room.on(RoomEvent.ConnectionStateChanged, onStateChange);
    return () => { room.off(RoomEvent.ConnectionStateChanged, onStateChange); };
  }, [room]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 relative overflow-hidden">
        {reconnecting && <ReconnectingOverlay />}
        <RoomGrid />
      </div>
      <div className="h-16 flex items-center justify-center bg-slate-900/80 border-t border-white/10 shrink-0">
        <Controls onLeave={onLeave} />
      </div>
    </div>
  );
}

function GuestRoom({ token, serverUrl }: { token: string; serverUrl: string }) {
  const [joined, setJoined] = useState(false);
  const [left, setLeft] = useState(false);
  const [checkingPerms, setCheckingPerms] = useState(false);
  const [permError, setPermError] = useState<string | null>(null);

  const handleLeave = useCallback(() => setLeft(true), []);

  const handleJoin = async () => {
    setCheckingPerms(true);
    setPermError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch (err: unknown) {
      const name = (err as { name?: string }).name ?? "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setPermError("Microphone access denied. Allow it in browser settings and try again.");
        setCheckingPerms(false);
        return;
      }
      // NotFoundError (no mic device) or other — join as listener, mic will stay muted
      if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setPermError("No microphone found — you'll join as a listener. You can still hear audio.");
        // Don't return — fall through to join
      }
    }
    setCheckingPerms(false);
    setJoined(true);
  };

  if (left) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center">
          <PhoneOff className="h-7 w-7 text-white/40" />
        </div>
        <p className="text-white/60 text-[15px]">You've left the room.</p>
        <button onClick={() => { setLeft(false); setJoined(false); }}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-colors">
          Rejoin
        </button>
      </div>
    );
  }

  if (!joined) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6">
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-4">
            <Users className="h-8 w-8 text-white/40" />
          </div>
          <p className="text-white/80 text-[17px] font-semibold mb-1">Private Test Session</p>
          <p className="text-white/35 text-[13px]">Your mic will be on when you join. Camera starts off.</p>
        </div>
        {permError && (
          <div className={cn(
            "flex items-start gap-2 rounded-xl px-4 py-3 max-w-sm",
            permError.includes("listener")
              ? "bg-amber-500/15 border border-amber-500/30"
              : "bg-red-500/15 border border-red-500/30"
          )}>
            <AlertTriangle className={cn("h-4 w-4 shrink-0 mt-0.5",
              permError.includes("listener") ? "text-amber-400" : "text-red-400")} />
            <p className={cn("text-[12px] leading-snug",
              permError.includes("listener") ? "text-amber-300" : "text-red-300")}>{permError}</p>
          </div>
        )}
        <button onClick={handleJoin} disabled={checkingPerms}
          className="flex items-center gap-2 px-7 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl font-semibold text-[15px] transition-colors">
          {checkingPerms ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
          {checkingPerms ? "Checking permissions…" : "Join Room"}
        </button>
      </div>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={serverUrl}
      token={token}
      connect
      audio
      video={false}
      options={ROOM_OPTIONS}
      connectOptions={CONNECT_OPTIONS}
      style={{ height: "100%", background: "transparent" }}
    >
      <RoomWithState onLeave={handleLeave} />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

export default function LiveGuestPage() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  const serverUrl = params.get("url") ?? "wss://bicacademy.com/livekit-ws";

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-white/60 text-[15px] mb-2">No token provided.</p>
          <p className="text-white/30 text-[13px]">Use a valid invite link to join.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <div className="h-11 flex items-center px-4 bg-slate-900 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center">
            <span className="text-white text-[10px] font-black">BI</span>
          </div>
          <span className="text-white/80 text-[13px] font-semibold">Bright Insight · Live Session</span>
        </div>
        <span className="ml-3 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 text-[10px] font-bold uppercase tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
          Private
        </span>
      </div>
      <div className="flex-1">
        <GuestRoom token={token} serverUrl={serverUrl} />
      </div>
    </div>
  );
}
