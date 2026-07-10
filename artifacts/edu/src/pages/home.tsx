import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  ArrowRight, BarChart3, BookOpen, Globe2, ShieldCheck,
  TrendingUp, Star, Users, CheckCircle2, PlayCircle, Award,
} from "lucide-react";

interface StatItem { value: string; label: string; }
interface FeatureItem { title: string; desc: string; }
interface TestimonialItem { name: string; role: string; text: string; }

interface LandingContent {
  hero: {
    badge: string;
    headline1: string;
    headline2: string;
    subheadline: string;
    cta1: string;
    cta2: string;
    trustBadges: string[];
  };
  stats: StatItem[];
  features: {
    badge: string;
    title: string;
    subtitle: string;
    items: FeatureItem[];
  };
  testimonials: {
    title: string;
    subtitle: string;
    items: TestimonialItem[];
  };
  cta: {
    headline: string;
    subtitle: string;
    buttonText: string;
  };
}

const DEFAULT_CONTENT: LandingContent = {
  hero: {
    badge: "Join 50,000+ ambitious traders worldwide",
    headline1: "Master the markets",
    headline2: "with precision.",
    subheadline:
      "The professional education platform for serious traders. Structured courses, live market analysis, and real-time tools — all in one premium environment.",
    cta1: "Start Learning Free",
    cta2: "Watch Demo",
    trustBadges: ["No credit card required", "Free 14-day trial", "Cancel anytime"],
  },
  stats: [
    { value: "50,000+", label: "Active Students" },
    { value: "200+", label: "Expert Courses" },
    { value: "98%", label: "Satisfaction Rate" },
    { value: "$2.4B+", label: "Student Portfolio" },
  ],
  features: {
    badge: "Everything you need",
    title: "Built for serious traders",
    subtitle: "A complete ecosystem covering education, real-time trading tools, and community support.",
    items: [
      { title: "Structured Academy", desc: "Step-by-step curriculum from market fundamentals to advanced algorithmic trading, designed by verified professionals." },
      { title: "Live Market Sessions", desc: "Watch experts analyze live charts, execute trades, and manage risk in real-time across global sessions." },
      { title: "Verified Copy Trading", desc: "Learn by following. Analyze portfolios, risk metrics, and strategies of top-performing verified traders." },
      { title: "Real-Time Markets", desc: "Professional-grade charting tools, watchlists, and market data used by institutional traders worldwide." },
      { title: "Active Community", desc: "Collaborate, share trade ideas, and get feedback from a global community of serious traders." },
      { title: "XP & Certification", desc: "Earn XP, climb leaderboards, and collect verified certificates to showcase your trading expertise." },
    ],
  },
  testimonials: {
    title: "Trusted by traders globally",
    subtitle: "Real results from real students",
    items: [
      { name: "Sarah Chen", role: "Forex Trader", text: "The structured curriculum took me from zero to consistently profitable in 6 months. The live sessions are invaluable." },
      { name: "Marcus Adeyemi", role: "Crypto Analyst", text: "Copy trading helped me understand risk management hands-on. The transparency of trader metrics is unmatched." },
      { name: "Elena Petrova", role: "Options Trader", text: "Best investment education platform I've used. The community is incredibly supportive and knowledge-rich." },
    ],
  },
  cta: {
    headline: "Ready to trade smarter?",
    subtitle: "Join thousands of traders already using Bright Insight to sharpen their edge. Start free today.",
    buttonText: "Start Learning Free",
  },
};

const FEATURE_ICONS = [BookOpen, Globe2, ShieldCheck, TrendingUp, Users, Award];
const FEATURE_COLORS = [
  "bg-blue-50 text-blue-600",
  "bg-emerald-50 text-emerald-600",
  "bg-violet-50 text-violet-600",
  "bg-amber-50 text-amber-600",
  "bg-rose-50 text-rose-600",
  "bg-cyan-50 text-cyan-600",
];
const TESTIMONIAL_AVATARS = [
  { initials: "SC", bg: "bg-blue-500" },
  { initials: "MA", bg: "bg-emerald-500" },
  { initials: "EP", bg: "bg-violet-500" },
];

function deepMerge<T>(defaults: T, overrides: Partial<T>): T {
  if (!overrides || typeof overrides !== "object") return defaults;
  const result = { ...defaults } as Record<string, unknown>;
  for (const key of Object.keys(overrides as object)) {
    const dv = (defaults as Record<string, unknown>)[key];
    const ov = (overrides as Record<string, unknown>)[key];
    if (Array.isArray(dv) && Array.isArray(ov)) {
      result[key] = ov;
    } else if (dv && typeof dv === "object" && ov && typeof ov === "object") {
      result[key] = deepMerge(dv, ov as Partial<typeof dv>);
    } else if (ov !== undefined) {
      result[key] = ov;
    }
  }
  return result as T;
}

export default function Home() {
  const [lp, setLp] = useState<LandingContent>(DEFAULT_CONTENT);

  useEffect(() => {
    fetch("/api/site-settings/landing_page")
      .then((r) => r.json())
      .then((data) => {
        if (data.value) setLp(deepMerge(DEFAULT_CONTENT, data.value));
      })
      .catch(() => {});
  }, []);

  const hero = lp.hero;
  const stats = lp.stats;
  const features = lp.features;
  const testimonials = lp.testimonials;
  const cta = lp.cta;

  return (
    <div className="min-h-screen bg-white text-foreground flex flex-col font-sans">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <BarChart3 className="h-4 w-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-bold text-[15px] text-foreground tracking-tight">Bright Insight</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#testimonials" className="hover:text-foreground transition-colors">Testimonials</a>
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
              {hero.badge}
            </div>

            <h1 className="text-5xl md:text-[68px] font-extrabold tracking-tight text-foreground mb-6 leading-[1.05]">
              {hero.headline1}<br />
              <span className="text-primary">{hero.headline2}</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
              {hero.subheadline}
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-12">
              <Link href="/sign-up">
                <Button size="lg" className="h-12 px-8 text-base font-semibold shadow-md hover:shadow-lg transition-shadow">
                  {hero.cta1} <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <button className="flex items-center gap-2 h-12 px-6 text-base font-medium text-muted-foreground hover:text-foreground transition-colors">
                <PlayCircle className="h-5 w-5 text-primary" />
                {hero.cta2}
              </button>
            </div>

            {/* Trust badges */}
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
              {hero.trustBadges.map((t) => (
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
                {features.badge}
              </div>
              <h2 className="text-4xl font-extrabold text-foreground mb-4">
                {features.title}
              </h2>
              <p className="text-lg text-muted-foreground max-w-xl mx-auto">
                {features.subtitle}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.items.slice(0, 6).map((f, i) => {
                const Icon = FEATURE_ICONS[i];
                const color = FEATURE_COLORS[i];
                return (
                  <div key={i} className="p-6 rounded-2xl bg-white border border-border hover:border-primary/20 hover:shadow-md transition-all group">
                    <div className={`inline-flex items-center justify-center w-11 h-11 rounded-xl mb-4 ${color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-base font-bold text-foreground mb-2">{f.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section id="testimonials" className="py-24 bg-secondary/30">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-extrabold text-foreground mb-4">{testimonials.title}</h2>
              <p className="text-lg text-muted-foreground">{testimonials.subtitle}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {testimonials.items.slice(0, 3).map((t, i) => {
                const av = TESTIMONIAL_AVATARS[i] ?? { initials: t.name.slice(0, 2).toUpperCase(), bg: "bg-slate-500" };
                return (
                  <div key={i} className="bg-white rounded-2xl p-6 border border-border shadow-sm">
                    <div className="flex gap-0.5 mb-4">
                      {Array(5).fill(0).map((_, si) => (
                        <Star key={si} className="h-4 w-4 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                    <p className="text-sm text-foreground mb-5 leading-relaxed">"{t.text}"</p>
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full ${av.bg} flex items-center justify-center text-white text-xs font-bold`}>
                        {av.initials}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{t.name}</p>
                        <p className="text-xs text-muted-foreground">{t.role}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>



        {/* CTA */}
        <section className="py-24 bg-primary">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
            <h2 className="text-4xl font-extrabold text-white mb-4">{cta.headline}</h2>
            <p className="text-blue-100 text-lg mb-8 max-w-xl mx-auto">
              {cta.subtitle}
            </p>
            <Link href="/sign-up">
              <Button
                size="lg"
                className="h-12 px-10 bg-white text-primary hover:bg-blue-50 font-semibold shadow-lg transition-all"
              >
                {cta.buttonText} <ArrowRight className="ml-2 h-4 w-4" />
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
            <span className="font-bold text-sm text-foreground">Bright Insight</span>
          </div>
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} Bright Insight. All rights reserved.</p>
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
