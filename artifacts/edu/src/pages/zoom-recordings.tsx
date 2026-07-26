import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Video, Calendar, Play, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

type Recording = {
  id: number;
  title: string;
  description: string | null;
  videoUrl: string;
  thumbnailUrl: string | null;
  recordedAt: string | null;
  createdAt: string;
};

type Embed = { type: "iframe" | "video"; src: string; originalUrl: string };

function getEmbed(url: string): Embed | null {
  if (!url?.trim()) return null;
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (ytMatch)
    return { type: "iframe", src: `https://www.youtube.com/embed/${ytMatch[1]}?rel=0&modestbranding=1`, originalUrl: url };
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch)
    return { type: "iframe", src: `https://player.vimeo.com/video/${vimeoMatch[1]}`, originalUrl: url };
  if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(url))
    return { type: "video", src: url, originalUrl: url };
  // Generic iframe for any other URL (Zoom, Loom, etc.)
  return { type: "iframe", src: url, originalUrl: url };
}

function RecordingCard({ rec }: { rec: Recording }) {
  const [playing, setPlaying] = useState(false);
  const embed = getEmbed(rec.videoUrl);

  const formattedDate = rec.recordedAt
    ? new Date(rec.recordedAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : new Date(rec.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col">
      {/* Thumbnail / Player */}
      <div className="relative aspect-video bg-black">
        {playing && embed ? (
          embed.type === "iframe" ? (
            <iframe
              src={embed.src}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title={rec.title}
            />
          ) : (
            <video
              src={embed.src}
              controls
              autoPlay
              className="w-full h-full object-contain"
            />
          )
        ) : (
          <>
            {rec.thumbnailUrl ? (
              <img
                src={rec.thumbnailUrl}
                alt={rec.title}
                className="w-full h-full object-cover opacity-80"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                <Video className="h-12 w-12 text-primary/40" />
              </div>
            )}
            {/* Play button overlay */}
            <button
              onClick={() => setPlaying(true)}
              className="absolute inset-0 flex items-center justify-center group"
            >
              <div className="w-16 h-16 rounded-full bg-black/60 border-2 border-white/80 flex items-center justify-center group-hover:bg-black/80 transition-colors">
                <Play className="h-7 w-7 text-white ml-1" fill="white" />
              </div>
            </button>
          </>
        )}
      </div>

      {/* Info */}
      <div className="p-4 flex flex-col gap-2 flex-1">
        <h3 className="font-semibold text-sm leading-snug line-clamp-2">{rec.title}</h3>
        {rec.description && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{rec.description}</p>
        )}
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            {formattedDate}
          </span>
          <a
            href={rec.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            Open
          </a>
        </div>
      </div>
    </div>
  );
}

export default function ZoomRecordings() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/zoom-recordings")
      .then((r) => r.ok ? r.json() : [])
      .then((data: Recording[]) => setRecordings(data))
      .catch(() => setRecordings([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Video className="h-5 w-5 text-primary" />
            Zoom Recordings
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Watch past live sessions and class recordings
          </p>
        </div>
        {!loading && recordings.length > 0 && (
          <Badge variant="secondary">{recordings.length} recordings</Badge>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array(6).fill(0).map((_, i) => (
            <div key={i} className="rounded-xl border border-border overflow-hidden">
              <Skeleton className="aspect-video w-full" />
              <div className="p-4 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : recordings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <Video className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="text-sm font-medium text-muted-foreground">No recordings yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Class recordings will appear here once uploaded by your instructor.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {recordings.map((rec) => (
            <RecordingCard key={rec.id} rec={rec} />
          ))}
        </div>
      )}
    </div>
  );
}
