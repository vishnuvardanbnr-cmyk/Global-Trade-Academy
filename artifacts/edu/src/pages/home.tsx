import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  ArrowRight, BarChart3, BookOpen, Globe2, ShieldCheck,
  TrendingUp, Star, Users, CheckCircle2, PlayCircle, Award
} from "lucide-react";

const stats = [
  { value: "50,000+", label: "Active Students" },
  { value: "200+", label: "Expert Courses" },
  { value: "98%", label: "Satisfaction Rate" },
  { value: "$2.4B+", label: "Student Portfolio" },
];

const features = [
  {
    icon: BookOpen,
    color: "bg-blue-50 text-blue-600",
    title: "Structured Academy",
    desc: "Step-by-step curriculum from market fundamentals to advanced algorithmic trading, designed by verified professionals.",
  },
  {
    icon: Globe2,
    color: "bg-emerald-50 text-emerald-600",
    title: "Live Market Sessions",
    desc: "Watch experts analyze live charts, execute trades, and manage risk in real-time across global sessions.",
  },
  {
    icon: ShieldCheck,
    color: "bg-violet-50 text-violet-600",
    title: "Verified Copy Trading",
    desc: "Learn by following. Analyze portfolios, risk metrics, and strategies of top-performing verified traders.",
  },
  {
    icon: TrendingUp,
    color: "bg-amber-50 text-amber-600",
    title: "Real-Time Markets",
    desc: "Professional-grade charting tools, watchlists, and market data used by institutional traders worldwide.",
  },
  {
    icon: Users,
    color: "bg-rose-50 text-rose-600",
    title: "Active Community",
    desc: "Collaborate, share trade ideas, and get feedback from a global community of serious traders.",
  },
  {
    icon: Award,
    color: "bg-cyan-50 text-cyan-600",
    title: "XP & Certification",
    desc: "Earn XP, climb leaderboards, and collect verified certificates to showcase your trading expertise.",
  },
];

const testimonials = [
  {
    name: "Sarah Chen",
    role: "Forex Trader",
    avatar: "SC",
    avatarBg: "bg-blue-500",
    text: "The structured curriculum took me from zero to consistently profitable in 6 months. The live sessions are invaluable.",
    stars: 5,
  },
  {
    name: "Marcus Adeyemi",
    role: "Crypto Analyst",
    avatar: "MA",
    avatarBg: "bg-emerald-500",
    text: "Copy trading helped me understand risk management hands-on. The transparency of trader metrics is unmatched.",
    stars: 5,
  },
  {
    name: "Elena Petrova",
    role: "Options Trader",
    avatar: "EP",
    avatarBg: "bg-violet-500",
    text: "Best investment education platform I've used. The community is incredibly supportive and knowledge-rich.",
    stars: 5,
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-foreground flex flex-col font-sans">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <BarChart3 className="h-4 w-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-bold text-[15px] text-foreground tracking-tight">EDU <span className="font-medium text-muted-foreground">Trading</span></span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#testimonials" className="hover:text-foreground transition-colors">Testimonials</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/sign-in">
              <Button variant="ghost" size="sm" className="font-medium">Log In</Button>
            </Link>
            <Link href="/sign-up">
              <Button size="sm" className="font-semibold shadow-sm">Get Started Free</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden bg-white pt-20 pb-24">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,_rgba(37,99,235,0.08),_transparent)]" />
          <div className="absolute top-20 right-10 w-72 h-72 bg-blue-50 rounded-full blur-3xl opacity-60" />
          <div className="absolute bottom-0 left-10 w-56 h-56 bg-violet-50 rounded-full blur-3xl opacity-50" />

          <div className="relative max-w-4xl mx-auto px-4 sm:px-6 text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 border border-blue-100 px-4 py-1.5 text-sm font-medium text-blue-700 mb-8">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              Join 50,000+ ambitious traders worldwide
            </div>

            <h1 className="text-5xl md:text-[68px] font-extrabold tracking-tight text-foreground mb-6 leading-[1.05]">
              Master the markets<br />
              <span className="text-primary">with precision.</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
              The professional education platform for serious traders. Structured courses,
              live market analysis, and real-time tools — all in one premium environment.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-12">
              <Link href="/sign-up">
                <Button size="lg" className="h-12 px-8 text-base font-semibold shadow-md hover:shadow-lg transition-shadow">
                  Start Learning Free <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <button className="flex items-center gap-2 h-12 px-6 text-base font-medium text-muted-foreground hover:text-foreground transition-colors">
                <PlayCircle className="h-5 w-5 text-primary" />
                Watch Demo
              </button>
            </div>

            {/* Trust badges */}
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
              {["No credit card required", "Free 14-day trial", "Cancel anytime"].map((t) => (
                <div key={t} className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>{t}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Stats bar */}
        <section className="border-y border-border bg-secondary/50">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {stats.map((s) => (
                <div key={s.label} className="text-center">
                  <div className="text-3xl font-extrabold text-foreground">{s.value}</div>
                  <div className="text-sm text-muted-foreground mt-1">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="py-24 bg-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/8 border border-primary/12 px-4 py-1.5 text-sm font-medium text-primary mb-4">
                Everything you need
              </div>
              <h2 className="text-4xl font-extrabold text-foreground mb-4">
                Built for serious traders
              </h2>
              <p className="text-lg text-muted-foreground max-w-xl mx-auto">
                A complete ecosystem covering education, real-time trading tools, and community support.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((f) => (
                <div key={f.title} className="p-6 rounded-2xl bg-white border border-border hover:border-primary/20 hover:shadow-md transition-all group">
                  <div className={`inline-flex items-center justify-center w-11 h-11 rounded-xl mb-4 ${f.color}`}>
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-bold text-foreground mb-2">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section id="testimonials" className="py-24 bg-secondary/30">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-extrabold text-foreground mb-4">Trusted by traders globally</h2>
              <p className="text-lg text-muted-foreground">Real results from real students</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {testimonials.map((t) => (
                <div key={t.name} className="bg-white rounded-2xl p-6 border border-border shadow-sm">
                  <div className="flex gap-0.5 mb-4">
                    {Array(t.stars).fill(0).map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <p className="text-sm text-foreground mb-5 leading-relaxed">"{t.text}"</p>
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full ${t.avatarBg} flex items-center justify-center text-white text-xs font-bold`}>
                      {t.avatar}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.role}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 bg-primary">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
            <h2 className="text-4xl font-extrabold text-white mb-4">Ready to trade smarter?</h2>
            <p className="text-blue-100 text-lg mb-8 max-w-xl mx-auto">
              Join thousands of traders already using EDU to sharpen their edge. Start free today.
            </p>
            <Link href="/sign-up">
              <Button
                size="lg"
                className="h-12 px-10 bg-white text-primary hover:bg-blue-50 font-semibold shadow-lg transition-all"
              >
                Start Learning Free <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-white py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <BarChart3 className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-bold text-sm text-foreground">EDU Trading</span>
          </div>
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} EDU Trading Platform. All rights reserved.</p>
          <div className="flex gap-5 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
            <a href="#" className="hover:text-foreground transition-colors">Terms</a>
            <a href="#" className="hover:text-foreground transition-colors">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
