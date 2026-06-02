import { useListCourses } from "@workspace/api-client-react";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { useState } from "react";
import { Search, Star, Clock, Users, BookOpen, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORIES = ["All", "Forex", "Crypto", "Stocks", "Options", "Risk Management", "Technical Analysis"];
const LEVELS = ["All Levels", "Beginner", "Intermediate", "Advanced"];

const levelColors: Record<string, string> = {
  beginner: "bg-emerald-50 text-emerald-700 border-emerald-200",
  intermediate: "bg-amber-50 text-amber-700 border-amber-200",
  advanced: "bg-red-50 text-red-700 border-red-200",
};

export default function Courses() {
  const { data: courses, isLoading } = useListCourses({});
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeLevel, setActiveLevel] = useState("All Levels");

  const filtered = (courses ?? []).filter((c) => {
    const matchSearch = !search || c.title.toLowerCase().includes(search.toLowerCase());
    const matchCat = activeCategory === "All" || c.category === activeCategory;
    const matchLevel = activeLevel === "All Levels" || c.level?.toLowerCase() === activeLevel.toLowerCase();
    return matchSearch && matchCat && matchLevel;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Academy</h1>
        <p className="text-sm text-muted-foreground">Master trading from fundamentals to advanced strategies.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search courses…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
          <select
            className="h-9 text-sm border border-border rounded-lg px-3 bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            value={activeLevel}
            onChange={(e) => setActiveLevel(e.target.value)}
          >
            {LEVELS.map((l) => <option key={l}>{l}</option>)}
          </select>
        </div>
      </div>

      {/* Category pills */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm font-medium border transition-all",
              activeCategory === cat
                ? "bg-primary text-white border-primary shadow-sm"
                : "bg-white text-muted-foreground border-border hover:border-primary/30 hover:text-foreground"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Stats row */}
      {!isLoading && (
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <BookOpen className="h-4 w-4" />
          <span><strong className="text-foreground">{filtered.length}</strong> courses available</span>
        </div>
      )}

      {/* Grid */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {isLoading
          ? Array(6).fill(0).map((_, i) => (
            <Card key={i} className="overflow-hidden shadow-xs">
              <Skeleton className="h-44 w-full rounded-none" />
              <div className="p-4 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-9 w-full mt-3" />
              </div>
            </Card>
          ))
          : filtered.map((course) => (
            <Card key={course.id} className="overflow-hidden flex flex-col shadow-xs border-border hover:shadow-md hover:border-primary/20 transition-all group">
              {/* Thumbnail */}
              <div className="h-44 bg-gradient-to-br from-secondary to-secondary/50 relative overflow-hidden">
                {course.thumbnailUrl ? (
                  <img src={course.thumbnailUrl} alt={course.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                    <BookOpen className="h-10 w-10 text-muted-foreground/40" />
                    <span className="text-xs text-muted-foreground">{course.category}</span>
                  </div>
                )}
                {course.isFeatured && (
                  <div className="absolute top-3 left-3 bg-amber-400 text-amber-900 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Star className="h-2.5 w-2.5" /> Featured
                  </div>
                )}
                <div className="absolute top-3 right-3">
                  <Badge className={cn("text-[11px] border font-medium", levelColors[course.level?.toLowerCase() ?? ""] ?? "bg-secondary text-secondary-foreground")}>
                    {course.level}
                  </Badge>
                </div>
              </div>

              <CardHeader className="pb-2 pt-4">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Badge variant="outline" className="text-[11px] text-muted-foreground">{course.category}</Badge>
                </div>
                <h3 className="font-bold text-foreground leading-snug line-clamp-2">{course.title}</h3>
              </CardHeader>

              <CardContent className="flex-1 pb-3">
                <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{course.description}</p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <BookOpen className="h-3.5 w-3.5" />
                    <span>{course.lessonCount ?? 0} lessons</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    <span>{(course.enrollmentCount ?? 0).toLocaleString()} enrolled</span>
                  </div>
                  {course.duration && (
                    <div className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{course.duration}h</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 mt-2">
                  {(course.reviewCount ?? 0) > 0 ? (
                    <>
                      {[1,2,3,4,5].map((s) => (
                        <Star key={s} className={cn("h-3 w-3", s <= Math.round(course.rating ?? 0) ? "fill-amber-400 text-amber-400" : "fill-amber-200 text-amber-200")} />
                      ))}
                      <span className="text-xs text-muted-foreground ml-1">{(course.rating ?? 0).toFixed(1)} ({course.reviewCount})</span>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">No reviews yet</span>
                  )}
                </div>
              </CardContent>

              <CardFooter className="pt-0 gap-2">
                <div className="flex-1">
                  {course.price ? (
                    <span className="text-base font-bold text-foreground">${course.price}</span>
                  ) : (
                    <span className="text-sm font-semibold text-emerald-600">Free</span>
                  )}
                </div>
                <Link href={`/courses/${course.id}`}>
                  <Button size="sm" className="font-semibold">Enroll Now</Button>
                </Link>
              </CardFooter>
            </Card>
          ))}
      </div>

      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-16">
          <BookOpen className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground">No courses match your filters.</p>
          <button className="text-sm text-primary mt-2 hover:underline" onClick={() => { setSearch(""); setActiveCategory("All"); setActiveLevel("All Levels"); }}>
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
