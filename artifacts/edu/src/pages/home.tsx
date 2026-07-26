import React, { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ArrowRight, BarChart3, BookOpen, Globe2, ShieldCheck,
  TrendingUp, Star, Users, CheckCircle2, PlayCircle, Award,
  Facebook, Instagram, Youtube, Twitter, Linkedin, X,
  Volume2, VolumeX,
} from "lucide-react";

type GalleryItem = { url: string; caption: string };

interface StatItem { value: string; label: string; }
interface FeatureItem { title: string; desc: string; }
interface TestimonialItem { name: string; role: string; text: string; }
interface MarketTab { id: string; label: string; content: string; imageUrl: string; }
type SocialPlatform = "facebook" | "instagram" | "youtube" | "twitter" | "linkedin" | "tiktok" | "whatsapp";
interface SocialLink { platform: SocialPlatform; enabled: boolean; url: string; }

interface LandingContent {
  hero: {
    badge: string;
    headline1: string;
    headline2: string;
    subheadline: string;
    cta1: string;
    cta2: string;
    trustBadges: string[];
    demoVideoUrl?: string;
  };
  markets: { tabs: MarketTab[] };
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
  social: { links: SocialLink[] };
  legal: {
    privacy: { title: string; content: string };
    terms:   { title: string; content: string };
    support: { title: string; content: string };
  };
}

const SOCIAL_ICON: Record<SocialPlatform, React.ReactNode> = {
  facebook:  <Facebook  className="h-4 w-4" />,
  instagram: <Instagram className="h-4 w-4" />,
  youtube:   <Youtube   className="h-4 w-4" />,
  twitter:   <Twitter   className="h-4 w-4" />,
  linkedin:  <Linkedin  className="h-4 w-4" />,
  tiktok: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.32 6.32 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.77a4.85 4.85 0 0 1-1.01-.08z"/>
    </svg>
  ),
  whatsapp: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
    </svg>
  ),
};

const DEFAULT_SOCIAL: SocialLink[] = [
  { platform: "facebook",  enabled: false, url: "" },
  { platform: "instagram", enabled: false, url: "" },
  { platform: "youtube",   enabled: false, url: "" },
  { platform: "twitter",   enabled: false, url: "" },
  { platform: "linkedin",  enabled: false, url: "" },
  { platform: "tiktok",   enabled: false, url: "" },
  { platform: "whatsapp", enabled: false, url: "" },
];

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
  markets: {
    tabs: [
      {
        id: "forex",
        label: "Forex",
        content: "The world's largest financial market with over $6.6 trillion traded daily. Learn currency pairs, chart reading, risk management, and how to profit in both rising and falling markets with guidance from professional traders.",
        imageUrl: "",
      },
      {
        id: "stocks",
        label: "Stocks",
        content: "Master equity markets with institutional-grade strategies. Understand fundamental analysis, technical setups, sector rotation, and how to build a diversified portfolio that consistently outperforms the market.",
        imageUrl: "",
      },
      {
        id: "crypto",
        label: "Crypto",
        content: "Navigate the 24/7 digital asset market with confidence. From blockchain fundamentals to DeFi protocols, futures trading, and on-chain analysis — stay ahead of every market cycle with expert education.",
        imageUrl: "",
      },
    ],
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
  social: { links: DEFAULT_SOCIAL },
  legal: {
    privacy: { title: "Privacy Policy",    content: "" },
    terms:   { title: "Terms of Service",  content: "" },
    support: { title: "Support",           content: "" },
  },
};

function getEmbedUrl(url: string): { type: "iframe" | "video"; src: string } | null {
  if (!url || !url.trim()) return null;
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (ytMatch) return { type: "iframe", src: `https://www.youtube.com/embed/${ytMatch[1]}?rel=0&modestbranding=1&mute=1&autoplay=1` };
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return { type: "iframe", src: `https://player.vimeo.com/video/${vimeoMatch[1]}?muted=1&autoplay=1` };
  if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(url)) return { type: "video", src: url };
  return { type: "iframe", src: url };
}

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
  const [marketTab, setMarketTab] = useState<string>("forex");
  const [legalModal, setLegalModal] = useState<"privacy" | "terms" | "support" | null>(null);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [lightbox, setLightbox] = useState<GalleryItem | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [galleryIdx, setGalleryIdx] = useState(0);

  useEffect(() => {
    fetch("/api/site-settings/landing_page")
      .then((r) => r.json())
      .then((data) => {
        if (data.value) setLp(deepMerge(DEFAULT_CONTENT, data.value));
      })
      .catch(() => {});
    fetch("/api/gallery")
      .then((r) => r.ok ? r.json() : [])
      .then((data: GalleryItem[]) => setGallery(data))
      .catch(() => {});
  }, []);

  // Imperatively mute on mount — React's `muted` JSX prop is unreliable
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = true;
  }, []);

  const hero = lp.hero;
  const markets = lp.markets ?? DEFAULT_CONTENT.markets;
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

            {/* Demo Video — shown above heading when set by admin */}
            {hero.demoVideoUrl && (() => {
              const embed = getEmbedUrl(hero.demoVideoUrl!);
              if (!embed) return null;
              return (
                <div id="demo-video" className="mb-10 rounded-2xl overflow-hidden shadow-2xl border border-border/60 max-w-3xl mx-auto aspect-video bg-black relative">
                  {embed.type === "video" ? (
                    <>
                      <video
                        ref={videoRef}
                        src={embed.src}
                        autoPlay
                        playsInline
                        loop
                        onLoadedMetadata={(e) => { e.currentTarget.muted = true; setIsMuted(true); }}
                        className="w-full h-full object-contain"
                      />
                      {/* Mute / Unmute overlay — top-right corner, always visible */}
                      <button
                        onClick={() => {
                          const next = !isMuted;
                          if (videoRef.current) videoRef.current.muted = next;
                          setIsMuted(next);
                        }}
                        className="absolute top-3 right-3 z-10 flex items-center gap-1.5 bg-black/70 hover:bg-black/90 text-white text-xs font-medium rounded-full px-3 py-1.5 transition-colors backdrop-blur-sm"
                        title={isMuted ? "Unmute" : "Mute"}
                      >
                        {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                        {isMuted ? "Unmute" : "Mute"}
                      </button>
                    </>
                  ) : (
                    <iframe
                      src={embed.src}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      title="Demo Video"
                    />
                  )}
                </div>
              );
            })()}

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
              <button
                className="flex items-center gap-2 h-12 px-6 text-base font-medium text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => {
                  const el = document.getElementById("demo-video");
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
              >
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

        {/* Markets tabs */}
        <section className="bg-white py-16">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            {/* Tab pills */}
            <div className="flex justify-center gap-2 mb-10">
              {markets.tabs.map((tab) => {
                const isActive = marketTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setMarketTab(tab.id)}
                    className={`px-7 py-2.5 rounded-full text-sm font-semibold transition-all ${
                      isActive
                        ? "bg-primary text-white shadow-md"
                        : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Active tab content */}
            {markets.tabs.filter((t) => t.id === marketTab).map((tab) => (
              <div key={tab.id} className="grid md:grid-cols-2 gap-10 items-center">
                <div>
                  <h3 className="text-2xl font-bold text-foreground mb-4">{tab.label}</h3>
                  <p className="text-lg text-muted-foreground leading-relaxed">{tab.content}</p>
                </div>
                {tab.imageUrl ? (
                  <div className="rounded-2xl overflow-hidden border border-border shadow-lg">
                    <img src={tab.imageUrl} alt={tab.label} className="w-full h-auto object-cover" />
                  </div>
                ) : (
                  <div className="rounded-2xl border-2 border-dashed border-border h-64 flex items-center justify-center text-muted-foreground text-sm">
                    {tab.label} image
                  </div>
                )}
              </div>
            ))}
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



        {/* Gallery Slider */}
        {gallery.length > 0 && (
          <section className="py-24 bg-white">
            <div className="max-w-5xl mx-auto px-4 sm:px-6">
              <div className="text-center mb-10">
                <h2 className="text-4xl font-extrabold text-foreground mb-3">Gallery</h2>
                <p className="text-lg text-muted-foreground">A glimpse into our trading community and events.</p>
              </div>

              {/* Slider */}
              <div className="relative group">
                {/* Main image */}
                <div
                  className="overflow-hidden rounded-2xl border border-border shadow-xl bg-black cursor-pointer"
                  style={{ height: "clamp(260px, 52vw, 560px)" }}
                  onClick={() => setLightbox(gallery[galleryIdx])}
                >
                  <img
                    key={galleryIdx}
                    src={gallery[galleryIdx].url}
                    alt={gallery[galleryIdx].caption || `Gallery ${galleryIdx + 1}`}
                    className="w-full h-full object-contain transition-opacity duration-300"
                  />
                  {gallery[galleryIdx].caption && (
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-5 py-4 rounded-b-2xl">
                      <p className="text-white text-sm font-medium">{gallery[galleryIdx].caption}</p>
                    </div>
                  )}
                </div>

                {/* Prev button */}
                {gallery.length > 1 && (
                  <button
                    onClick={() => setGalleryIdx((i) => (i - 1 + gallery.length) % gallery.length)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 z-10 bg-black/60 hover:bg-black/80 text-white rounded-full p-2.5 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm"
                    aria-label="Previous"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
                  </button>
                )}

                {/* Next button */}
                {gallery.length > 1 && (
                  <button
                    onClick={() => setGalleryIdx((i) => (i + 1) % gallery.length)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 z-10 bg-black/60 hover:bg-black/80 text-white rounded-full p-2.5 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm"
                    aria-label="Next"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                  </button>
                )}

                {/* Counter badge */}
                <div className="absolute top-3 left-3 bg-black/60 text-white text-xs font-medium rounded-full px-2.5 py-1 backdrop-blur-sm">
                  {galleryIdx + 1} / {gallery.length}
                </div>
              </div>

              {/* Dot indicators */}
              {gallery.length > 1 && (
                <div className="flex justify-center gap-2 mt-5">
                  {gallery.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setGalleryIdx(i)}
                      className={`rounded-full transition-all duration-200 ${
                        i === galleryIdx
                          ? "bg-primary w-6 h-2.5"
                          : "bg-border hover:bg-muted-foreground w-2.5 h-2.5"
                      }`}
                      aria-label={`Go to image ${i + 1}`}
                    />
                  ))}
                </div>
              )}

              {/* Thumbnail strip */}
              {gallery.length > 1 && (
                <div className="flex gap-2 mt-4 overflow-x-auto pb-1 justify-center flex-wrap">
                  {gallery.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => setGalleryIdx(i)}
                      className={`shrink-0 w-16 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                        i === galleryIdx ? "border-primary ring-2 ring-primary/30" : "border-transparent opacity-60 hover:opacity-100"
                      }`}
                    >
                      <img src={img.url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Lightbox */}
        {lightbox && (
          <div
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
            onClick={() => setLightbox(null)}
          >
            <button
              className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
              onClick={() => setLightbox(null)}
            >
              <X className="h-7 w-7" />
            </button>
            <div className="max-w-5xl max-h-[90vh] flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
              <img
                src={lightbox.url}
                alt={lightbox.caption}
                className="max-h-[80vh] max-w-full rounded-xl object-contain shadow-2xl"
              />
              {lightbox.caption && (
                <p className="text-white/80 text-sm text-center">{lightbox.caption}</p>
              )}
            </div>
          </div>
        )}

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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-6">
          {/* Social icons row — only shown when at least one is enabled */}
          {(() => {
            const active = (lp.social?.links ?? DEFAULT_SOCIAL).filter((s) => s.enabled && s.url);
            if (!active.length) return null;
            return (
              <div className="flex items-center justify-center gap-3">
                {active.map((s) => (
                  <a
                    key={s.platform}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary transition-colors"
                    aria-label={s.platform}
                  >
                    {SOCIAL_ICON[s.platform]}
                  </a>
                ))}
              </div>
            );
          })()}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                <BarChart3 className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
              </div>
              <span className="font-bold text-sm text-foreground">Bright Insight</span>
            </div>
            <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} Bright Insight. All rights reserved.</p>
            <div className="flex gap-5 text-sm text-muted-foreground">
              {(["privacy", "terms", "support"] as const).map((key) => {
                const item = lp.legal?.[key];
                const label = key.charAt(0).toUpperCase() + key.slice(1);
                return (
                  <button
                    key={key}
                    onClick={() => setLegalModal(key)}
                    className="hover:text-foreground transition-colors"
                  >
                    {item?.title || label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </footer>

      {/* Legal modals */}
      {(["privacy", "terms", "support"] as const).map((key) => {
        const item = lp.legal?.[key];
        const label = key.charAt(0).toUpperCase() + key.slice(1);
        return (
          <Dialog key={key} open={legalModal === key} onOpenChange={(o) => { if (!o) setLegalModal(null); }}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{item?.title || label}</DialogTitle>
              </DialogHeader>
              {item?.content ? (
                <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap text-sm leading-relaxed">
                  {item.content}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm py-6 text-center">No content set yet. Add it in Admin → Landing Page → Legal.</p>
              )}
            </DialogContent>
          </Dialog>
        );
      })}
    </div>
  );
}
