import { useState } from "react";
import { useUser } from "@/lib/authContext";
import { useGetMe, useUpdateMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { User, Shield, Zap, Award, Target, BookOpen, Bell, Palette, ChevronRight, ImageIcon, Moon, Sun, Eye, EyeOff, X } from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import { cn } from "@/lib/utils";

const MARKET_OPTIONS = ["Forex", "Crypto", "Stocks", "Futures", "Options", "Indices"];
const SKILL_OPTIONS = ["beginner", "intermediate", "advanced", "expert"];
const SKILL_LABELS: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  expert: "Expert",
};

const XP_PER_LEVEL = 500;

export default function Settings() {
  const { data: me, isLoading } = useGetMe();
  const { mutateAsync: updateMe } = useUpdateMe();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isDark, toggle: toggleTheme } = useTheme();

  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [marketFocus, setMarketFocus] = useState("");
  const [skillLevel, setSkillLevel] = useState("");
  const [initialized, setInitialized] = useState(false);

  const [showChangePw, setShowChangePw] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  const handleChangePw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) {
      toast({ title: "Passwords don't match", variant: "destructive" }); return;
    }
    if (newPw.length < 8) {
      toast({ title: "New password must be at least 8 characters", variant: "destructive" }); return;
    }
    setPwSaving(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast({ title: "Password updated", description: "Your password has been changed successfully." });
      setShowChangePw(false);
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    } catch (err: any) {
      toast({ title: err.message ?? "Could not update password", variant: "destructive" });
    } finally {
      setPwSaving(false);
    }
  };

  if (me && !initialized) {
    setDisplayName(me.displayName ?? "");
    setBio((me as any).bio ?? "");
    setAvatarUrl((me as any).avatarUrl ?? "");
    setMarketFocus((me as any).marketFocus ?? "");
    setSkillLevel((me as any).skillLevel ?? "beginner");
    setInitialized(true);
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateMe({
        data: {
          displayName: displayName.trim() || undefined,
          bio: bio.trim() || undefined,
          marketFocus: marketFocus || undefined,
          skillLevel: skillLevel || undefined,
          avatarUrl: avatarUrl.trim() || undefined,
        },
      });
      await qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast({ title: "Settings saved", description: "Your profile has been updated." });
    } catch {
      toast({ title: "Could not save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const xp = me?.xp ?? 0;
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const xpIntoLevel = xp % XP_PER_LEVEL;
  const progressPct = Math.round((xpIntoLevel / XP_PER_LEVEL) * 100);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your profile and platform preferences.</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}
        </div>
      ) : (
        <div className="space-y-5">
          {/* XP / Level card */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md shrink-0">
                  <Zap className="h-7 w-7 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-foreground">Level {level} Trader</span>
                    <Badge variant="secondary" className="text-[10px]">{xp.toLocaleString()} XP total</Badge>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2 mb-1">
                    <div className="bg-amber-400 h-2 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground">{xpIntoLevel.toLocaleString()} / {XP_PER_LEVEL.toLocaleString()} XP to Level {level + 1}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border">
                {[
                  { label: "Role", value: me?.role ?? "student", icon: Shield },
                  { label: "Email", value: me?.email ?? "—", icon: User },
                  { label: "Member since", value: me?.createdAt ? new Date(me.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "—", icon: Award },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="text-center p-3 rounded-xl bg-secondary/50">
                    <Icon className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                    <p className="text-xs font-semibold text-foreground truncate mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Profile form */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4" /> Profile Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSave} className="space-y-4">
                {/* Avatar preview + URL */}
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-2xl shrink-0 overflow-hidden border-2 border-border bg-primary/10 flex items-center justify-center">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <User className="h-7 w-7 text-primary/50" />
                    )}
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      <ImageIcon className="inline h-3 w-3 mr-1" />Avatar URL
                    </label>
                    <input
                      value={avatarUrl}
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full h-10 px-3 rounded-lg border border-border text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all bg-background"
                    />
                    <p className="text-[10px] text-muted-foreground">Paste an image URL to set your profile picture.</p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Display Name</label>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your full name"
                    className="w-full h-10 px-3 rounded-lg border border-border text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all bg-background"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Bio</label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Tell others a bit about yourself and your trading journey…"
                    rows={3}
                    className="w-full px-3 py-2.5 rounded-lg border border-border text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all bg-background resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Email</label>
                  <input
                    value={me?.email ?? ""}
                    disabled
                    className="w-full h-10 px-3 rounded-lg border border-border text-sm bg-secondary text-muted-foreground cursor-not-allowed"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Email cannot be changed.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                    <Target className="inline h-3 w-3 mr-1" />Market Focus
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {MARKET_OPTIONS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMarketFocus(m === marketFocus ? "" : m)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                          marketFocus === m
                            ? "bg-primary text-white border-primary"
                            : "bg-background border-border text-foreground hover:border-primary/50"
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                {(me?.role === "instructor" || me?.role === "admin") && (
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                      <BookOpen className="inline h-3 w-3 mr-1" />Skill Level
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {SKILL_OPTIONS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setSkillLevel(s)}
                          className={cn(
                            "px-3 py-2 rounded-lg text-xs font-medium border transition-all",
                            skillLevel === s
                              ? "bg-primary text-white border-primary"
                              : "bg-background border-border text-foreground hover:border-primary/50"
                          )}
                        >
                          {SKILL_LABELS[s]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="h-10 px-6 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Appearance */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Palette className="h-4 w-4" /> Appearance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Dark mode</p>
                  <p className="text-xs text-muted-foreground">Switch between light and dark interface</p>
                </div>
                <button
                  onClick={toggleTheme}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                    isDark ? "bg-primary" : "bg-secondary border border-border"
                  )}
                >
                  <span className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform",
                    isDark ? "translate-x-6" : "translate-x-1"
                  )} />
                </button>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-border p-2.5 bg-secondary/50">
                {isDark
                  ? <Moon className="h-4 w-4 text-primary shrink-0" />
                  : <Sun className="h-4 w-4 text-amber-500 shrink-0" />}
                <span className="text-xs text-muted-foreground">
                  Currently using <strong className="text-foreground">{isDark ? "Dark" : "Light"}</strong> theme — preference saved automatically
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Account actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4" /> Account & Security
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {/* Change password row */}
              <div className="border-b border-border">
                <button
                  className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-secondary transition-colors text-left"
                  onClick={() => setShowChangePw(v => !v)}
                >
                  <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">Change password</p>
                    <p className="text-xs text-muted-foreground">Update your login credentials</p>
                  </div>
                  {showChangePw
                    ? <X className="h-4 w-4 text-muted-foreground shrink-0" />
                    : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                </button>

                {showChangePw && (
                  <form onSubmit={handleChangePw} className="px-5 pb-4 pt-1 space-y-3 bg-secondary/30">
                    <div className="relative">
                      <Input
                        type={showCurrentPw ? "text" : "password"}
                        placeholder="Current password"
                        value={currentPw}
                        onChange={e => setCurrentPw(e.target.value)}
                        className="pr-10 bg-white text-sm h-9"
                        required
                      />
                      <button type="button" tabIndex={-1} onClick={() => setShowCurrentPw(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <div className="relative">
                      <Input
                        type={showNewPw ? "text" : "password"}
                        placeholder="New password (min 8 chars)"
                        value={newPw}
                        onChange={e => setNewPw(e.target.value)}
                        className="pr-10 bg-white text-sm h-9"
                        required
                      />
                      <button type="button" tabIndex={-1} onClick={() => setShowNewPw(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <Input
                      type="password"
                      placeholder="Confirm new password"
                      value={confirmPw}
                      onChange={e => setConfirmPw(e.target.value)}
                      className="bg-white text-sm h-9"
                      required
                    />
                    <div className="flex gap-2 pt-1">
                      <button type="submit" disabled={pwSaving}
                        className="h-8 px-4 bg-primary text-primary-foreground rounded-md text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
                        {pwSaving ? "Saving…" : "Update password"}
                      </button>
                      <button type="button"
                        onClick={() => { setShowChangePw(false); setCurrentPw(""); setNewPw(""); setConfirmPw(""); }}
                        className="h-8 px-4 rounded-md text-xs font-medium border border-border hover:bg-secondary transition-colors">
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Notification preferences */}
              <button
                className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-secondary transition-colors text-left"
                onClick={() => toast({ title: "Coming soon", description: "Notification preferences will be available shortly." })}
              >
                <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                  <Bell className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">Notification preferences</p>
                  <p className="text-xs text-muted-foreground">Control which alerts you receive</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
