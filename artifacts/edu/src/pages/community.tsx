import { useState } from "react";
import { useListPosts, useCreatePost, useLikePost, useListComments, useCreateComment, getListPostsQueryKey, getListCommentsQueryKey } from "@workspace/api-client-react";
import type { Post } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Heart, MessageCircle, Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CATEGORIES = ["all", "forex", "crypto", "analysis", "news", "general"];

function formatTime(dateStr: string | Date) {
  const date = new Date(dateStr);
  const diff = Date.now() - date.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function PostCard({ post }: { post: Post }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showComments, setShowComments] = useState(false);
  const [comment, setComment] = useState("");

  const like = useLikePost({ mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListPostsQueryKey() }) } });
  const { data: comments } = useListComments(post.id, { query: { enabled: showComments, queryKey: getListCommentsQueryKey(post.id) } });
  const addComment = useCreateComment({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["comments", post.id] });
        setComment("");
        toast({ title: "Comment posted" });
      },
    },
  });

  const categoryColor: { [key: string]: string } = {
    forex: "text-blue-400 border-blue-400/30 bg-blue-400/10",
    crypto: "text-orange-400 border-orange-400/30 bg-orange-400/10",
    analysis: "text-purple-400 border-purple-400/30 bg-purple-400/10",
    news: "text-red-400 border-red-400/30 bg-red-400/10",
    general: "text-muted-foreground",
  };

  return (
    <Card data-testid={`card-post-${post.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm shrink-0">
              {(post.authorName ?? "U").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm">{post.authorName ?? "Anonymous"}</p>
              <p className="text-xs text-muted-foreground">{post.createdAt ? formatTime(post.createdAt) : ""}</p>
            </div>
          </div>
          <Badge variant="outline" className={`text-[10px] shrink-0 ${categoryColor[post.category] ?? ""}`}>
            {post.category}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h3 className="font-semibold mb-1.5">{post.title}</h3>
          {post.content && <p className="text-sm text-muted-foreground leading-relaxed">{post.content}</p>}
        </div>
        <div className="flex items-center gap-4 pt-1">
          <button
            data-testid={`button-like-${post.id}`}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-red-400 transition-colors"
            onClick={() => like.mutate({ postId: post.id })}
          >
            <Heart className="h-4 w-4" />
            <span>{post.likes}</span>
          </button>
          <button
            data-testid={`button-comment-${post.id}`}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
            onClick={() => setShowComments(!showComments)}
          >
            <MessageCircle className="h-4 w-4" />
            <span>{post.commentCount}</span>
          </button>
        </div>

        {showComments && (
          <div className="space-y-3 pt-2 border-t border-border">
            {comments?.map((c) => (
              <div key={c.id} className="flex gap-2">
                <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-xs shrink-0">
                  {(c.authorName ?? "U").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 bg-secondary/50 rounded-lg px-3 py-2">
                  <p className="text-xs font-semibold">{c.authorName ?? "Anonymous"}</p>
                  <p className="text-sm">{c.content}</p>
                </div>
              </div>
            ))}
            <div className="flex gap-2">
              <Input
                data-testid="input-comment"
                placeholder="Add a comment..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && comment.trim()) {
                    addComment.mutate({ postId: post.id, data: { content: comment } });
                  }
                }}
              />
              <Button
                size="sm"
                data-testid="button-submit-comment"
                disabled={!comment.trim() || addComment.isPending}
                onClick={() => addComment.mutate({ postId: post.id, data: { content: comment } })}
              >
                Post
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CreatePostDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const createPost = useCreatePost({
    mutation: {
      onSuccess: () => {
        setOpen(false);
        onSuccess();
        toast({ title: "Post published" });
      },
    },
  });

  const form = useForm({ defaultValues: { title: "", content: "", category: "general" } });

  const onSubmit = (data: { title: string; content: string; category: string }) => {
    createPost.mutate({ data: { title: data.title, content: data.content, category: data.category } });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-new-post">
          <Plus className="h-4 w-4 mr-2" />
          New Post
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a Post</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="category" render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-category">
                      <SelectValue placeholder="Pick a category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {CATEGORIES.filter(c => c !== "all").map(c => (
                      <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="title" rules={{ required: "Title is required" }} render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input data-testid="input-post-title" placeholder="Your post headline" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="content" render={({ field }) => (
              <FormItem>
                <FormLabel>Content</FormLabel>
                <FormControl>
                  <Textarea data-testid="input-post-content" placeholder="Share your thoughts, analysis, or news..." rows={5} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <Button type="submit" className="w-full" data-testid="button-submit-post" disabled={createPost.isPending}>
              {createPost.isPending ? "Publishing..." : "Publish"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function Community() {
  const qc = useQueryClient();
  const [activeCategory, setActiveCategory] = useState("all");

  const { data: posts, isLoading } = useListPosts(
    activeCategory !== "all" ? { category: activeCategory } : {},
    { query: { queryKey: getListPostsQueryKey(activeCategory !== "all" ? { category: activeCategory } : {}) } }
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Community</h1>
          <p className="text-muted-foreground">Discuss markets, share analysis, and connect with traders.</p>
        </div>
        <CreatePostDialog onSuccess={() => qc.invalidateQueries({ queryKey: getListPostsQueryKey() })} />
      </div>

      {/* Category Filter */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map((cat) => (
          <Button
            key={cat}
            variant={activeCategory === cat ? "default" : "outline"}
            size="sm"
            data-testid={`filter-${cat}`}
            onClick={() => setActiveCategory(cat)}
            className="capitalize"
          >
            {cat}
          </Button>
        ))}
      </div>

      {/* Posts */}
      <div className="space-y-4">
        {isLoading
          ? Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)
          : posts?.map((post) => <PostCard key={post.id} post={post} />)
        }
        {posts?.length === 0 && !isLoading && (
          <div className="py-16 text-center text-muted-foreground">
            No posts yet in this category. Be the first to share.
          </div>
        )}
      </div>
    </div>
  );
}
