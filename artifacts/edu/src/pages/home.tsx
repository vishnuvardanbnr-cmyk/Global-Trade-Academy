import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, BarChart3, BookOpen, Globe2, ShieldCheck, Zap } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xl text-primary">
            <BarChart3 className="h-6 w-6" />
            <span>EDU Trading</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/sign-in">
              <Button variant="ghost">Log In</Button>
            </Link>
            <Link href="/sign-up">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-24 md:py-32 border-b border-border/40 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/20 via-background to-background" />
          <div className="container mx-auto px-4 relative z-10 text-center max-w-4xl">
            <div className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary mb-8">
              <span className="flex h-2 w-2 rounded-full bg-primary mr-2 animate-pulse"></span>
              Join 50,000+ ambitious traders
            </div>
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8">
              Master the markets with <span className="text-primary">precision.</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
              The professional education platform for serious traders. Structured courses, live market analysis, and real-time tools — all in one premium environment.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/sign-up">
                <Button size="lg" className="w-full sm:w-auto text-lg h-14 px-8">
                  Start Learning Now <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-24 bg-card/50">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="p-8 rounded-2xl bg-background border border-border">
                <BookOpen className="h-12 w-12 text-primary mb-6" />
                <h3 className="text-2xl font-bold mb-4">Structured Academy</h3>
                <p className="text-muted-foreground">From market fundamentals to advanced algorithmic trading. Step-by-step curriculum designed by verified professionals.</p>
              </div>
              <div className="p-8 rounded-2xl bg-background border border-border">
                <Globe2 className="h-12 w-12 text-primary mb-6" />
                <h3 className="text-2xl font-bold mb-4">Live Market Sessions</h3>
                <p className="text-muted-foreground">Watch experts analyze live charts, execute trades, and manage risk in real-time across global sessions.</p>
              </div>
              <div className="p-8 rounded-2xl bg-background border border-border">
                <ShieldCheck className="h-12 w-12 text-primary mb-6" />
                <h3 className="text-2xl font-bold mb-4">Verified Copy Trading</h3>
                <p className="text-muted-foreground">Learn by following. Analyze the portfolios, risk metrics, and strategies of top-performing traders.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/40 py-12 bg-card">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p>© {new Date().getFullYear()} EDU Trading Platform. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}