import { useState, useRef, useEffect, useCallback } from "react";
import { useWS } from "@/hooks/useWS";
import {
  useListChannels, useListPosts, useCreatePost, useLikePost,
  useListComments, useCreateComment, useDeletePost,
  getListPostsQueryKey, getListCommentsQueryKey, getListChannelsQueryKey,
  type CommunityChannel, type Post,
} from "@workspace/api-client-react";
import { useGetMe } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Heart, MessageCircle, Plus, Hash, BookOpen, Users,
  Trash2, Send, ImageIcon, X,
} from "lucide-react";

function formatTime(d: string | Date) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function accessIcon(ch: CommunityChannel) {
  if (ch.accessType === "course") return <BookOpen className="h-3 w-3 shrink-0" />;
  if (ch.accessType === "batch") return <Users className="h-3 w-3 shrink-0" />;
  return null;
}

/* ── Channel Sidebar ──────────────────────────────────────────── */
function ChannelSidebar({
  channels, active, onSelect, loading,
}: {
  channels: CommunityChannel[];
  active: CommunityChannel | null;
  onSelect: (ch: CommunityChannel) => void;
  loading: boolean;
}) {
  return (
    <div className="w-56 shrink-0 flex flex-col bg-muted/40 border-r border-border rounded-l-xl overflow-hidden">
      <div className="px-3 py-3 border-b border-border/60">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Channels</p>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {loading
          ? Array(5).fill(0).map((_, i) => <div key={i} className="mx-2 my-1 h-7 rounded-md bg-muted animate-pulse" />)
          : channels.map((ch) => (
            <button
              key={ch.id}
              onClick={() => onSelect(ch)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md mx-1 my-0.5 transition-colors text-left",
                active?.id === ch.id
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <span className="text-base leading-none">{ch.emoji}</span>
              <span className="flex-1 truncate">{ch.name}</span>
              {accessIcon(ch)}
            </button>
          ))
        }
        {!loading && channels.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6 px-3">No channels available.</p>
        )}
      </div>
    </div>
  );
}

/* ── New Post Dialog (admin/instructor only) ──────────────────── */
function NewPostDialog({
  channel, open, onOpenChange, onSuccess,
}: {
  channel: CommunityChannel;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [showImage, setShowImage] = useState(false);
  const { toast } = useToast();
  const createPost = useCreatePost({
    mutation: {
      onSuccess: () => {
        setTitle(""); setContent(""); setImageUrl(""); setShowImage(false);
        onOpenChange(false);
        onSuccess();
        toast({ title: "Post published" });
      },
    },
  });

  const submit = () => {
    if (!title.trim()) { toast({ title: "Title is required", variant: "destructive" }); return; }
    createPost.mutate({ data: { title: title.trim(), content, imageUrl: imageUrl || undefined, channelId: channel.id, category: channel.slug } });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-lg">{channel.emoji}</span>
            <span>Post in #{channel.name}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <Input placeholder="Title *" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          <Textarea
            placeholder="Share your analysis, insight, or update…"
            rows={5}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          {showImage && (
            <Input placeholder="Image URL (optional)" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
          )}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowImage(!showImage)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showImage ? <X className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
              {showImage ? "Remove image" : "Add image"}
            </button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button size="sm" onClick={submit} disabled={createPost.isPending}>
                {createPost.isPending ? "Publishing…" : "Publish"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Comments Thread ──────────────────────────────────────────── */
function CommentsSection({ postId }: { postId: number }) {
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const { data: comments, isLoading } = useListComments(postId, {
    query: { queryKey: getListCommentsQueryKey(postId) },
  });
  const { toast } = useToast();
  useWS(`community:post:${postId}:comments`, useCallback(() => {
    qc.invalidateQueries({ queryKey: getListCommentsQueryKey(postId) });
  }, [postId, qc]));
  const addComment = useCreateComment({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListCommentsQueryKey(postId) });
        setComment("");
      },
      onError: () => toast({ title: "Could not post comment", variant: "destructive" }),
    },
  });

  const submit = () => {
    if (!comment.trim()) return;
    addComment.mutate({ postId, data: { content: comment.trim() } });
  };

  return (
    <div className="pt-3 border-t border-border space-y-2.5">
      {isLoading ? (
        <div className="space-y-2">
          {Array(2).fill(0).map((_, i) => <div key={i} className="h-10 rounded-lg bg-secondary animate-pulse" />)}
        </div>
      ) : (
        (comments ?? []).map((c) => (
          <div key={c.id} className="flex gap-2.5">
            <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary shrink-0">
              {(c.authorName ?? "U").charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 bg-secondary/60 rounded-xl px-3 py-2">
              <p className="text-xs font-semibold text-foreground leading-none mb-0.5">{c.authorName ?? "User"}</p>
              <p className="text-sm text-foreground/90">{c.content}</p>
            </div>
          </div>
        ))
      )}
      <div className="flex gap-2 pt-1">
        <Input
          placeholder="Reply…"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="h-8 text-sm"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
        />
        <Button size="sm" className="h-8 px-3" onClick={submit} disabled={!comment.trim() || addComment.isPending}>
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/* ── Chat Message Bubble ──────────────────────────────────────── */
function ChatBubble({
  post, canDelete, onDelete, isOwn,
}: {
  post: Post;
  canDelete: boolean;
  onDelete: (id: number) => void;
  isOwn: boolean;
}) {
  return (
    <div className={cn("flex items-end gap-2 group", isOwn && "flex-row-reverse")}>
      <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary shrink-0 mb-0.5">
        {(post.authorName ?? "U").charAt(0).toUpperCase()}
      </div>
      <div className={cn("flex flex-col gap-0.5 max-w-[70%]", isOwn && "items-end")}>
        <span className={cn("text-[10px] text-muted-foreground px-1", isOwn && "text-right")}>
          {isOwn ? "You" : (post.authorName ?? "User")} · {post.createdAt ? formatTime(post.createdAt) : ""}
        </span>
        <div className={cn(
          "rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words",
          isOwn
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-muted text-foreground rounded-bl-sm",
        )}>
          {post.title}
          {post.imageUrl && (
            <img src={post.imageUrl} alt="" className="mt-2 rounded-lg max-h-48 object-cover" />
          )}
        </div>
      </div>
      {canDelete && (
        <button
          onClick={() => onDelete(post.id)}
          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-all self-center"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

/* ── Post Card (for instructor/admin posts) ───────────────────── */
function PostCard({
  post, canDelete, onDelete,
}: {
  post: Post;
  canDelete: boolean;
  onDelete: (id: number) => void;
}) {
  const qc = useQueryClient();
  const [showComments, setShowComments] = useState(false);
  const like = useLikePost({ mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListPostsQueryKey() }) } });

  return (
    <div className={cn(
      "rounded-xl border border-border bg-white p-4 space-y-3 transition-shadow hover:shadow-sm",
      post.isPinned && "border-amber-300 bg-amber-50/30",
    )}>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center text-primary font-bold text-sm shrink-0">
          {(post.authorName ?? "U").charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm text-foreground">{post.authorName ?? "User"}</p>
            {post.isPinned && (
              <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">📌 Pinned</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{post.createdAt ? formatTime(post.createdAt) : ""}</p>
        </div>
        {canDelete && (
          <button
            onClick={() => onDelete(post.id)}
            className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div>
        <h3 className="font-semibold text-base text-foreground mb-1">{post.title}</h3>
        {post.content && <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{post.content}</p>}
        {post.imageUrl && (
          <img src={post.imageUrl} alt="" className="mt-2 rounded-lg w-full max-h-64 object-cover" />
        )}
      </div>
      <div className="flex items-center gap-4">
        <button
          onClick={() => like.mutate({ postId: post.id })}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-rose-500 transition-colors"
        >
          <Heart className="h-4 w-4" />
          <span>{post.likes ?? 0}</span>
        </button>
        <button
          onClick={() => setShowComments(!showComments)}
          className={cn(
            "flex items-center gap-1.5 text-sm transition-colors",
            showComments ? "text-primary" : "text-muted-foreground hover:text-primary",
          )}
        >
          <MessageCircle className="h-4 w-4" />
          <span>{post.commentCount ?? 0}</span>
        </button>
      </div>
      {showComments && <CommentsSection postId={post.id} />}
    </div>
  );
}

/* ── Chat Bar ─────────────────────────────────────────────────── */
function ChatBar({ channel, onSent }: { channel: CommunityChannel; onSent: () => void }) {
  const [msg, setMsg] = useState("");
  const { toast } = useToast();
  const createPost = useCreatePost({
    mutation: {
      onSuccess: () => { setMsg(""); onSent(); },
      onError: () => toast({ title: "Could not send message", variant: "destructive" }),
    },
  });

  const send = () => {
    if (!msg.trim() || createPost.isPending) return;
    createPost.mutate({ data: { title: msg.trim(), channelId: channel.id, category: "chat" } });
  };

  return (
    <div className="px-4 py-3 border-t border-border bg-background shrink-0">
      <div className="flex items-center gap-2">
        <Input
          placeholder={`Message #${channel.name}…`}
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          className="flex-1 rounded-xl bg-muted/50 border-border"
          autoComplete="off"
        />
        <Button
          size="icon"
          className="h-9 w-9 rounded-xl shrink-0"
          onClick={send}
          disabled={!msg.trim() || createPost.isPending}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* ── Channel Feed ─────────────────────────────────────────────── */
function ChannelFeed({
  channel, canPost, userId, userRole,
}: {
  channel: CommunityChannel;
  canPost: boolean;
  userId: string;
  userRole: string;
}) {
  const qc = useQueryClient();
  const [composerOpen, setComposerOpen] = useState(false);
  const { toast } = useToast();
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: posts, isLoading } = useListPosts(
    { channelId: channel.id },
    { query: { queryKey: getListPostsQueryKey({ channelId: channel.id }) } },
  );

  const deletePost = useDeletePost({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListPostsQueryKey({ channelId: channel.id }) });
        toast({ title: "Deleted" });
      },
    },
  });

  const handleDelete = (id: number) => {
    if (!confirm("Delete this message?")) return;
    deletePost.mutate({ postId: id });
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: getListPostsQueryKey({ channelId: channel.id }) });

  useWS(`community:${channel.id}:posts`, useCallback(() => {
    qc.invalidateQueries({ queryKey: getListPostsQueryKey({ channelId: channel.id }) });
  }, [channel.id, qc]));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [posts?.length]);

  const allPosts = posts ?? [];

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Channel header */}
      <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-white/80 backdrop-blur shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">{channel.emoji}</span>
          <div>
            <h2 className="font-semibold text-base text-foreground leading-none">{channel.name}</h2>
            {channel.description && (
              <p className="text-xs text-muted-foreground mt-0.5">{channel.description}</p>
            )}
          </div>
          {channel.accessType !== "common" && (
            <span className={cn(
              "text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1",
              channel.accessType === "course" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700",
            )}>
              {channel.accessType === "course" ? <BookOpen className="h-2.5 w-2.5" /> : <Users className="h-2.5 w-2.5" />}
              {channel.accessType === "course" ? (channel.courseName ?? "Course") : (channel.batchName ?? "Batch")}
            </span>
          )}
        </div>
        {canPost && (
          <Button size="sm" onClick={() => setComposerOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> New Post
          </Button>
        )}
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {isLoading
          ? Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)
          : allPosts.length === 0
          ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <span className="text-4xl mb-3">{channel.emoji}</span>
              <p className="text-sm font-medium text-foreground mb-1">No messages yet in #{channel.name}</p>
              <p className="text-xs text-muted-foreground">Be the first to say something!</p>
            </div>
          )
          : allPosts.map((post) =>
            post.category === "chat" ? (
              <ChatBubble
                key={post.id}
                post={post}
                isOwn={post.authorId === userId}
                canDelete={userRole === "admin" || post.authorId === userId}
                onDelete={handleDelete}
              />
            ) : (
              <PostCard
                key={post.id}
                post={post}
                canDelete={userRole === "admin" || post.authorId === userId}
                onDelete={handleDelete}
              />
            )
          )
        }
        <div ref={bottomRef} />
      </div>

      {/* Chat bar — always visible for all users */}
      <ChatBar channel={channel} onSent={invalidate} />

      {canPost && (
        <NewPostDialog
          channel={channel}
          open={composerOpen}
          onOpenChange={setComposerOpen}
          onSuccess={invalidate}
        />
      )}
    </div>
  );
}

/* ── Main Community Page ──────────────────────────────────────── */
export default function Community() {
  const [activeChannel, setActiveChannel] = useState<CommunityChannel | null>(null);
  const { data: me } = useGetMe();
  const { data: channels, isLoading: channelsLoading } = useListChannels({
    query: { queryKey: getListChannelsQueryKey() },
  });

  const isAdminOrInstructor = me?.role === "admin" || me?.role === "instructor";
  const displayChannels = channels ?? [];
  const active = activeChannel ?? displayChannels[0] ?? null;

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 flex rounded-xl border border-border overflow-hidden bg-background min-h-0">
        <ChannelSidebar
          channels={displayChannels}
          active={active}
          onSelect={setActiveChannel}
          loading={channelsLoading}
        />
        {active ? (
          <ChannelFeed
            key={active.id}
            channel={active}
            canPost={isAdminOrInstructor}
            userId={me?.id ?? ""}
            userRole={me?.role ?? "student"}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Hash className="h-10 w-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm">Select a channel to start</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
