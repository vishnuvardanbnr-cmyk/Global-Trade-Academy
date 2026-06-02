import { useListLiveClasses, useRegisterLiveClass, getListLiveClassesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Clock, Users, Play } from "lucide-react";
import { useState } from "react";

function formatDate(d: string | Date) {
  return new Date(d).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short",
  });
}

function CountdownTimer({ scheduledAt }: { scheduledAt: string | Date }) {
  const diff = new Date(scheduledAt).getTime() - Date.now();
  if (diff <= 0) return <span className="text-xs text-muted-foreground">Starting now</span>;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 24) return <span className="text-xs text-muted-foreground">In {Math.floor(h / 24)} days</span>;
  return <span className="text-xs text-yellow-400 font-medium">In {h}h {m}m</span>;
}

export default function LiveClasses() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [registering, setRegistering] = useState<number | null>(null);

  const { data: allClasses, isLoading } = useListLiveClasses({});

  const upcoming = allClasses?.filter((c) => c.status === "scheduled") ?? [];
  const past = allClasses?.filter((c) => c.status === "completed") ?? [];
  const live = allClasses?.filter((c) => c.status === "live") ?? [];

  const register = useRegisterLiveClass({
    mutation: {
      onSuccess: (_d, vars) => {
        qc.invalidateQueries({ queryKey: getListLiveClassesQueryKey() });
        toast({ title: "Registered successfully" });
        setRegistering(null);
      },
      onError: (_e, vars) => {
        toast({ title: "Failed to register", variant: "destructive" });
        setRegistering(null);
      },
    },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Live Sessions</h1>
        <p className="text-muted-foreground">Real-time market analysis and expert Q&A with top instructors.</p>
      </div>

      {/* Currently Live */}
      {live.length > 0 && (
        <div className="space-y-3">
          {live.map((cls) => (
            <Card key={cls.id} className="border-red-500/30 bg-red-500/5" data-testid={`card-live-${cls.id}`}>
              <CardContent className="p-6 flex flex-col md:flex-row items-center gap-6">
                <div className="flex-1 space-y-2">
                  <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-red-500/10 text-red-500 border-red-500/20">
                    <span className="flex h-2 w-2 rounded-full bg-red-500 mr-2 animate-pulse" />
                    Live Now
                  </div>
                  <h2 className="text-2xl font-bold">{cls.title}</h2>
                  <p className="text-muted-foreground text-sm">{cls.description}</p>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{cls.registrationCount} registered</span>
                    {cls.duration && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{cls.duration}min</span>}
                  </div>
                </div>
                {cls.meetingUrl && (
                  <a href={cls.meetingUrl} target="_blank" rel="noopener noreferrer">
                    <Button size="lg" data-testid={`button-join-${cls.id}`}>
                      <Play className="h-4 w-4 mr-2" />
                      Join Session
                    </Button>
                  </a>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Upcoming */}
      <div>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          Upcoming Sessions
        </h2>
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-48 w-full rounded-xl" />)}
          </div>
        ) : upcoming.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center">No upcoming sessions scheduled.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((cls) => (
              <Card key={cls.id} data-testid={`card-upcoming-${cls.id}`} className="flex flex-col">
                <div className="aspect-video bg-secondary/50 flex items-center justify-center rounded-t-xl overflow-hidden">
                  {cls.thumbnailUrl
                    ? <img src={cls.thumbnailUrl} alt={cls.title} className="w-full h-full object-cover" />
                    : <Calendar className="h-10 w-10 text-muted-foreground" />
                  }
                </div>
                <CardHeader className="pb-2">
                  {cls.category && (
                    <Badge variant="outline" className="w-fit capitalize text-xs">{cls.category}</Badge>
                  )}
                  <CardTitle className="text-base leading-snug">{cls.title}</CardTitle>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(cls.scheduledAt)}</span>
                  </div>
                  <CountdownTimer scheduledAt={cls.scheduledAt} />
                </CardHeader>
                <CardContent className="pt-0 mt-auto space-y-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" />{cls.registrationCount} registered</span>
                    {cls.maxAttendees && <span>Max {cls.maxAttendees}</span>}
                  </div>
                  <Button
                    className="w-full"
                    variant="outline"
                    data-testid={`button-register-${cls.id}`}
                    disabled={registering === cls.id}
                    onClick={() => {
                      setRegistering(cls.id);
                      register.mutate({ classId: cls.id });
                    }}
                  >
                    {registering === cls.id ? "Registering..." : "Register"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Past / Replays */}
      {past.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Play className="h-5 w-5 text-muted-foreground" />
            Session Replays
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {past.map((cls) => (
              <Card key={cls.id} data-testid={`card-replay-${cls.id}`} className="flex flex-col opacity-90">
                <div className="aspect-video bg-secondary/50 flex items-center justify-center rounded-t-xl overflow-hidden">
                  {cls.thumbnailUrl
                    ? <img src={cls.thumbnailUrl} alt={cls.title} className="w-full h-full object-cover" />
                    : <Play className="h-10 w-10 text-muted-foreground" />
                  }
                </div>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {cls.category && <Badge variant="outline" className="capitalize text-xs">{cls.category}</Badge>}
                    <Badge variant="secondary" className="text-xs">Replay</Badge>
                  </div>
                  <CardTitle className="text-base leading-snug">{cls.title}</CardTitle>
                  <p className="text-xs text-muted-foreground">{formatDate(cls.scheduledAt)}</p>
                </CardHeader>
                <CardContent className="pt-0 mt-auto">
                  {cls.replayUrl ? (
                    <a href={cls.replayUrl} target="_blank" rel="noopener noreferrer" className="w-full block">
                      <Button variant="outline" className="w-full" size="sm" data-testid={`button-replay-${cls.id}`}>
                        <Play className="h-3 w-3 mr-2" />
                        Watch Replay
                      </Button>
                    </a>
                  ) : (
                    <Button variant="outline" className="w-full" size="sm" disabled>Replay Not Available</Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
