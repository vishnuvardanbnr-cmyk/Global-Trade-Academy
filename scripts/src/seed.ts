import { db } from "@workspace/db";
import {
  coursesTable,
  lessonsTable,
  liveClassesTable,
  postsTable,
  tradersTable,
  watchlistTable,
  activityTable,
} from "@workspace/db";

async function seed() {
  console.log("Seeding database...");

  // Courses
  const courses = await db.insert(coursesTable).values([
    {
      title: "Forex Fundamentals: Complete Beginner Guide",
      description: "Master the foundations of currency trading. Learn how the forex market works, key currency pairs, and how to read forex charts. Perfect for traders starting from zero.",
      instructorId: "instructor_seed_1",
      category: "forex",
      level: "beginner",
      status: "published",
      thumbnailUrl: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&auto=format&fit=crop",
      price: "0",
      duration: 480,
      isFeatured: true,
    },
    {
      title: "Advanced Technical Analysis: Price Action Mastery",
      description: "Deep dive into professional technical analysis. Learn to read price action, identify high-probability setups, and develop a consistent trading edge using pure chart analysis.",
      instructorId: "instructor_seed_1",
      category: "forex",
      level: "advanced",
      status: "published",
      thumbnailUrl: "https://images.unsplash.com/photo-1642790551116-18e4f98c8d82?w=800&auto=format&fit=crop",
      price: "49.99",
      duration: 720,
      isFeatured: true,
    },
    {
      title: "Crypto Trading: From Bitcoin to DeFi",
      description: "Navigate the crypto markets with confidence. Understand blockchain fundamentals, on-chain analysis, DeFi protocols, and how to identify macro crypto trends before they happen.",
      instructorId: "instructor_seed_2",
      category: "crypto",
      level: "intermediate",
      status: "published",
      thumbnailUrl: "https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=800&auto=format&fit=crop",
      price: "39.99",
      duration: 600,
      isFeatured: true,
    },
    {
      title: "Options Trading Strategies: Generate Income",
      description: "Learn how professional options traders generate consistent monthly income. Covers covered calls, cash-secured puts, spreads, and iron condors with real trade examples.",
      instructorId: "instructor_seed_2",
      category: "options",
      level: "intermediate",
      status: "published",
      thumbnailUrl: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&auto=format&fit=crop",
      price: "59.99",
      duration: 840,
      isFeatured: false,
    },
    {
      title: "Futures Trading: Commodities & Indices",
      description: "Master futures markets for commodities, indices, and currencies. Learn margin, leverage, and risk management specific to futures contracts.",
      instructorId: "instructor_seed_1",
      category: "futures",
      level: "advanced",
      status: "published",
      thumbnailUrl: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&auto=format&fit=crop",
      price: "69.99",
      duration: 960,
      isFeatured: false,
    },
    {
      title: "Stock Market Investing for Long-Term Wealth",
      description: "Build a solid foundation in stock market investing. Learn fundamental analysis, portfolio construction, dividend investing, and how to identify undervalued stocks.",
      instructorId: "instructor_seed_2",
      category: "stocks",
      level: "beginner",
      status: "published",
      thumbnailUrl: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&auto=format&fit=crop",
      price: "0",
      duration: 360,
      isFeatured: true,
    },
    {
      title: "Risk Management: The Trader's Edge",
      description: "The most important skill in trading is preserving capital. This course teaches professional risk management, position sizing, portfolio heat, and psychological discipline.",
      instructorId: "instructor_seed_1",
      category: "forex",
      level: "intermediate",
      status: "published",
      thumbnailUrl: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&auto=format&fit=crop",
      price: "29.99",
      duration: 300,
      isFeatured: false,
    },
    {
      title: "Algorithmic Trading with Python",
      description: "Build your own trading algorithms from scratch. Learn Python for finance, backtesting frameworks, automated execution, and live trading with broker APIs.",
      instructorId: "instructor_seed_2",
      category: "stocks",
      level: "advanced",
      status: "published",
      thumbnailUrl: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&auto=format&fit=crop",
      price: "89.99",
      duration: 1200,
      isFeatured: true,
    },
  ]).returning();

  console.log(`Inserted ${courses.length} courses`);

  // Lessons for first course
  await db.insert(lessonsTable).values([
    { courseId: courses[0].id, title: "What is Forex?", description: "Introduction to the foreign exchange market", type: "video", videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", duration: 12, order: 1, isFree: true },
    { courseId: courses[0].id, title: "Major Currency Pairs", description: "Learn the most traded pairs: EUR/USD, GBP/USD, USD/JPY", type: "video", duration: 18, order: 2, isFree: true },
    { courseId: courses[0].id, title: "Reading Forex Charts", description: "Candlestick patterns and chart types", type: "video", duration: 25, order: 3, isFree: false },
    { courseId: courses[0].id, title: "Pips, Lots, and Leverage", description: "Understanding forex market mechanics", type: "video", duration: 20, order: 4, isFree: false },
    { courseId: courses[0].id, title: "Your First Demo Trade", description: "Practice with a demo account", type: "video", duration: 30, order: 5, isFree: false },
  ]);

  // Lessons for second course
  await db.insert(lessonsTable).values([
    { courseId: courses[1].id, title: "What is Price Action?", description: "Pure price movement analysis", type: "video", duration: 22, order: 1, isFree: true },
    { courseId: courses[1].id, title: "Support & Resistance Mastery", description: "Identifying key levels that matter", type: "video", duration: 35, order: 2, isFree: false },
    { courseId: courses[1].id, title: "Candlestick Patterns Encyclopedia", description: "Every pattern you need to know", type: "video", duration: 45, order: 3, isFree: false },
    { courseId: courses[1].id, title: "Market Structure: Trends & Ranges", description: "Reading the macro picture", type: "video", duration: 40, order: 4, isFree: false },
    { courseId: courses[1].id, title: "High Probability Entry Setups", description: "Where and when to pull the trigger", type: "video", duration: 55, order: 5, isFree: false },
    { courseId: courses[1].id, title: "Live Trade Analysis Session", description: "Real trades with commentary", type: "video", duration: 60, order: 6, isFree: false },
  ]);

  // Live Classes
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  await db.insert(liveClassesTable).values([
    {
      title: "Live EUR/USD Analysis & Trade Setup",
      description: "Join our lead analyst for a deep dive into EUR/USD price action. We will identify key levels, review current positioning, and discuss potential trade setups for the week ahead.",
      instructorId: "instructor_seed_1",
      scheduledAt: tomorrow,
      duration: 90,
      status: "scheduled",
      meetingUrl: "https://zoom.us/j/example1",
      category: "forex",
      maxAttendees: 500,
      thumbnailUrl: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&auto=format&fit=crop",
    },
    {
      title: "Crypto Weekly Outlook: BTC, ETH, SOL",
      description: "Weekly cryptocurrency market analysis covering Bitcoin macro structure, Ethereum ecosystem updates, and top altcoin opportunities.",
      instructorId: "instructor_seed_2",
      scheduledAt: nextWeek,
      duration: 60,
      status: "scheduled",
      meetingUrl: "https://zoom.us/j/example2",
      category: "crypto",
      maxAttendees: 300,
      thumbnailUrl: "https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=800&auto=format&fit=crop",
    },
    {
      title: "Options Premium Selling Workshop",
      description: "Live walkthrough of options premium selling strategies in the current market environment. Real positions reviewed with risk analysis.",
      instructorId: "instructor_seed_2",
      scheduledAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
      duration: 120,
      status: "scheduled",
      meetingUrl: "https://zoom.us/j/example3",
      category: "options",
      maxAttendees: 200,
      thumbnailUrl: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&auto=format&fit=crop",
    },
    {
      title: "Q1 Forex Market Review",
      description: "Comprehensive review of major forex market movements in Q1. Key lessons learned and what to expect going forward.",
      instructorId: "instructor_seed_1",
      scheduledAt: yesterday,
      duration: 75,
      status: "completed",
      replayUrl: "https://youtube.com/example-replay",
      category: "forex",
      maxAttendees: 400,
      thumbnailUrl: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&auto=format&fit=crop",
    },
    {
      title: "Crypto Bear Market Survival Guide",
      description: "How professional traders navigate bear markets, protect capital, and identify accumulation zones.",
      instructorId: "instructor_seed_2",
      scheduledAt: lastWeek,
      duration: 90,
      status: "completed",
      replayUrl: "https://youtube.com/example-replay2",
      category: "crypto",
      maxAttendees: 350,
      thumbnailUrl: "https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=800&auto=format&fit=crop",
    },
  ]);

  console.log("Inserted live classes");

  // Community Posts
  await db.insert(postsTable).values([
    {
      authorId: "instructor_seed_1",
      title: "EUR/USD Analysis: Key Level to Watch This Week",
      content: "The EUR/USD has been consolidating around the 1.0850 area for three weeks now. This is a critical decision point. On the 4H chart, we can see a clear descending triangle forming. If bulls can hold above 1.0820, we could see a push back toward 1.0950. However, a break below 1.0800 would likely trigger stops and push us toward 1.0750. Watch the Friday NFP data as the potential catalyst.",
      category: "forex",
      likes: 47,
      isPinned: true,
    },
    {
      authorId: "instructor_seed_2",
      title: "Bitcoin's Monthly Close Was Significant - Here's Why",
      content: "The monthly close above the 200-week moving average is historically a very bullish signal. Looking at previous cycles, this setup has preceded 3-6 month bull runs. On-chain data supports this — exchange outflows are increasing while long-term holder supply is at multi-year highs. Risk management is still essential, but the macro setup is constructive.",
      category: "crypto",
      likes: 89,
      isPinned: true,
    },
    {
      authorId: "instructor_seed_1",
      title: "Why Most Traders Blow Their Account (and How to Avoid It)",
      content: "In 10 years of trading and mentoring, I have seen the same patterns over and over. Traders don't fail because they lack knowledge. They fail because of psychology and position sizing. Risk 1-2% max per trade. If you can't accept losing that amount, your position is too big. This is the single most important rule in trading.",
      category: "general",
      likes: 134,
      isPinned: false,
    },
    {
      authorId: "instructor_seed_2",
      title: "Ethereum's Upcoming Catalyst: What You Need to Know",
      content: "The next major Ethereum protocol upgrade is on the horizon. Based on the development timeline, we're looking at approximately 3-4 months away. Historically, major ETH upgrades have seen price appreciation 30-60 days before the event. Key resistance levels to monitor: $3,800, $4,200, and the previous ATH at $4,900.",
      category: "crypto",
      likes: 62,
      isPinned: false,
    },
    {
      authorId: "instructor_seed_1",
      title: "Gold Breaking Out? My Technical Take",
      content: "Gold's breakout above $2,100 is technically very significant. This was 3-year resistance. We're now in price discovery territory. The macro backdrop supports this move — rate cut expectations, central bank buying, and geopolitical uncertainty are all tailwinds. Next key levels: $2,150, $2,200, $2,300.",
      category: "analysis",
      likes: 55,
      isPinned: false,
    },
    {
      authorId: "instructor_seed_2",
      title: "Fed Decision Impact on Markets: Quick Analysis",
      content: "Today's Fed decision to hold rates steady was mostly expected by markets. The key was the updated dot plot showing 2-3 rate cuts for 2024. USD weakness following the announcement is logical. Watch EUR/USD for potential breakout and gold for continuation. Risk assets should benefit near-term.",
      category: "news",
      likes: 38,
      isPinned: false,
    },
  ]);

  console.log("Inserted community posts");

  // Traders for Copy Trading
  await db.insert(tradersTable).values([
    {
      userId: "trader_seed_1",
      displayName: "AlphaFX Pro",
      bio: "10+ years Forex & indices. Specializing in London/NY session breakouts. Consistent monthly returns with strict risk management. Max 2% risk per trade.",
      roi: "142.5",
      winRate: "68.3",
      maxDrawdown: "8.2",
      totalTrades: 847,
      followers: 1240,
      status: "active",
      verified: true,
      markets: ["forex", "indices"],
      strategy: "Breakout & momentum",
      monthlyReturn: "4.8",
      riskScore: 4,
    },
    {
      userId: "trader_seed_2",
      displayName: "CryptoWhale7",
      bio: "Full-time crypto trader since 2017. Survived multiple bull/bear cycles. Focuses on BTC, ETH, and top 20 altcoins. Uses on-chain data + TA hybrid approach.",
      roi: "287.3",
      winRate: "61.4",
      maxDrawdown: "22.1",
      totalTrades: 523,
      followers: 3820,
      status: "active",
      verified: true,
      markets: ["crypto"],
      strategy: "On-chain + TA hybrid",
      monthlyReturn: "8.2",
      riskScore: 7,
    },
    {
      userId: "trader_seed_3",
      displayName: "SteadyIncome",
      bio: "Options specialist focusing on premium collection. Consistent 3-5% monthly returns through iron condors and covered calls. Low volatility, steady growth.",
      roi: "89.4",
      winRate: "78.9",
      maxDrawdown: "5.1",
      totalTrades: 312,
      followers: 876,
      status: "active",
      verified: true,
      markets: ["options", "stocks"],
      strategy: "Options premium selling",
      monthlyReturn: "3.2",
      riskScore: 2,
    },
    {
      userId: "trader_seed_4",
      displayName: "TrendRider_K",
      bio: "Trend following across Forex majors and commodities. Low trade frequency, high conviction setups only. Perfect for set-and-forget copying.",
      roi: "198.7",
      winRate: "55.2",
      maxDrawdown: "14.3",
      totalTrades: 189,
      followers: 654,
      status: "active",
      verified: false,
      markets: ["forex", "commodities"],
      strategy: "Trend following",
      monthlyReturn: "5.9",
      riskScore: 5,
    },
    {
      userId: "trader_seed_5",
      displayName: "ScalpKing",
      bio: "High-frequency scalper on EUR/USD and GBP/USD. 15+ trades per day, very tight risk management. Best for experienced investors who understand scalping risk.",
      roi: "312.1",
      winRate: "71.8",
      maxDrawdown: "18.7",
      totalTrades: 4521,
      followers: 2100,
      status: "active",
      verified: true,
      markets: ["forex"],
      strategy: "Scalping",
      monthlyReturn: "11.4",
      riskScore: 8,
    },
    {
      userId: "trader_seed_6",
      displayName: "MacroMind",
      bio: "Macro-driven trader focusing on long-term trends. Combines fundamental analysis with technical timing. Positions held for weeks to months.",
      roi: "156.2",
      winRate: "63.7",
      maxDrawdown: "11.4",
      totalTrades: 98,
      followers: 445,
      status: "active",
      verified: false,
      markets: ["forex", "stocks", "commodities"],
      strategy: "Macro fundamental",
      monthlyReturn: "4.1",
      riskScore: 3,
    },
  ]);

  console.log("Inserted traders");

  // Activity feed
  await db.insert(activityTable).values([
    { type: "enrollment", description: "100 new students enrolled in Forex Fundamentals this week", createdAt: new Date() },
    { type: "live_class", description: "EUR/USD Analysis session completed with 342 attendees", createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    { type: "achievement", description: "AlphaFX Pro reached 1,000+ followers on copy trading", createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000) },
    { type: "post", description: "New analysis post: Bitcoin Monthly Close Discussion has 50+ comments", createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000) },
    { type: "enrollment", description: "Advanced Technical Analysis course crossed 500 enrollments", createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000) },
  ]);

  console.log("Seeding complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
