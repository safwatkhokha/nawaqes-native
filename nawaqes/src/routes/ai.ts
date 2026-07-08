// ─── AI Promotion Intelligence Routes ───────────────────────────────
// هذا الملف يحتوي على كل ما يتعلق بالذكاء الاصطناعي للترويج
import { Router, Request, Response } from 'express';
import database from '../database/index.js';
import ZAI from 'z-ai-web-dev-sdk';
import { authMiddleware, optionalAuth } from '../middleware/auth.js';

const router = Router();

// ─── Package name mapping: English ID → Arabic display name ───────────
const packageNameAr: Record<string, string> = {
  basic: 'أساسي',
  standard: 'قياسي',
  premium: 'مميز',
  vip: 'VIP',
  city_target: 'استهداف مدن',
  interest_target: 'استهداف اهتمامات',
};

/** Convert English package IDs to Arabic display names */
function arPkg(pkg: string): string {
  return packageNameAr[pkg] || pkg;
}

/** Replace any English package IDs found in a text string with Arabic names */
function replacePkgNamesInText(text: string): string {
  if (!text) return text;
  let result = text;
  // Replace each English ID with Arabic name, handling word boundaries
  for (const [eng, ar] of Object.entries(packageNameAr)) {
    // Match the English ID as a standalone word (not inside another word)
    const regex = new RegExp(`\\b${eng}\\b`, 'g');
    result = result.replace(regex, ar);
  }
  return result;
}

// ─── Package prices from frontend (source of truth) ──────────────────
const packagePrices: Record<string, { price: number; reach: number; days: number; notifications: number }> = {
  basic: { price: 50, reach: 900, days: 3, notifications: 30 },
  standard: { price: 120, reach: 3000, days: 5, notifications: 100 },
  premium: { price: 250, reach: 8000, days: 7, notifications: 250 },
  vip: { price: 500, reach: 25000, days: 10, notifications: 600 },
  city_target: { price: 120, reach: 4500, days: 5, notifications: 150 },
  interest_target: { price: 200, reach: 7000, days: 5, notifications: 200 },
};


// ─── Simple in-memory LRU cache for expensive AI calls ──────────────
const aiCache = new Map<string, { data: any; expires: number }>();
const AI_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached<T>(key: string): T | null {
  const entry = aiCache.get(key);
  if (entry && entry.expires > Date.now()) return entry.data as T;
  if (entry) aiCache.delete(key);
  return null;
}

function setCached(key: string, data: any, ttl: number = AI_CACHE_TTL) {
  aiCache.set(key, { data, expires: Date.now() + ttl });
  // Evict oldest entries if cache grows too large
  if (aiCache.size > 100) {
    const oldest = aiCache.keys().next().value;
    if (oldest) aiCache.delete(oldest);
  }
}

// ─── Initialize Z-AI SDK ────────────────────────────────────────────
let zaiInstance: any = null;
let aiAvailable: boolean | null = null; // null = not tested yet
let aiCheckTime: number = 0;

async function getAI() {
  // If AI was recently unavailable, skip trying for 5 minutes to avoid repeated timeouts
  if (aiAvailable === false && (Date.now() - aiCheckTime) < 5 * 60 * 1000) {
    return null;
  }
  try {
    if (!zaiInstance) {
      zaiInstance = await ZAI.create();
    }
    aiAvailable = true;
    return zaiInstance;
  } catch (error: any) {
    aiAvailable = false;
    aiCheckTime = Date.now();
    console.log('[AI] SDK unavailable - using fallback responses for 5 minutes');
    return null;
  }
}

/** Try AI completion with fallback - returns null if AI is unavailable */
async function tryAICompletion(messages: any[], options: { temperature?: number; max_tokens?: number } = {}): Promise<string | null> {
  const zai = await getAI();
  if (!zai) return null;

  try {
    // 25-second timeout — prevents indefinite hangs if the AI service is slow
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('AI_TIMEOUT')), 25_000)
    );
    const completion = await Promise.race([
      zai.chat.completions.create({
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens ?? 800,
      }),
      timeoutPromise,
    ]) as any;
    return completion.choices?.[0]?.message?.content || null;
  } catch (error: any) {
    // Mark AI as unavailable and suppress repeated error logs
    if (error.message !== 'AI_TIMEOUT') {
      aiAvailable = false;
      aiCheckTime = Date.now();
      zaiInstance = null; // Clear stale instance on persistent failure
    }
    console.log('[AI] API request failed (' + error.message + ') - using fallback');
    return null;
  }
}

// ─── Helper: Get post by ID ─────────────────────────────────────────
function getPostById(postId: string): any | null {
  const db = database;
  const row = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
  return row || null;
}

// ─── Helper: Get user by ID ─────────────────────────────────────────
function getUserById(userId: string): any | null {
  const db = database;
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  return row || null;
}

// ═══════════════════════════════════════════════════════════════════════
// 1. AI استهداف تلقائي ذكي - Auto-Targeting
// يحلل محتوى المنشور ويقترح أفضل استهداف (اهتمامات، مدن، فئة عمرية)
// ═══════════════════════════════════════════════════════════════════════
router.post('/auto-target', optionalAuth, async (req: Request, res: Response) => {
  try {
    const { postId, content, category, price, location } = req.body;
    const userId = (req as any).user?.userId;

    // If no specific post selected, return general targeting suggestions instead of error
    if (!content && !postId) {
      const categoryToInterests: Record<string, string[]> = {
        phones: ['phones', 'electronics'],
        electronics: ['electronics', 'phones'],
        cars: ['cars'],
        realEstate: ['realEstate'],
        games: ['games', 'electronics'],
        fashion: ['fashion', 'beauty'],
        beauty: ['beauty', 'fashion'],
        sports: ['sports'],
        food: ['food'],
        jobs: ['jobs', 'education'],
        services: ['services', 'jobs'],
        education: ['education', 'books'],
        books: ['books', 'education'],
        animals: ['animals'],
        travel: ['travel', 'photography'],
        photography: ['photography', 'travel'],
        health: ['health', 'beauty'],
      };

      // Try to get user's most recent post for context
      let userCategory = category || 'other';
      let userContent = '';
      if (userId) {
        try {
          const lastPost = database.prepare('SELECT category, content FROM posts WHERE author_id = ? ORDER BY created_at DESC LIMIT 1').get(userId) as any;
          if (lastPost) {
            userCategory = lastPost.category || userCategory;
            userContent = lastPost.content || '';
          }
        } catch { /* ignore */ }
      }

      // Try AI targeting based on user's recent posts
      const aiContent = await tryAICompletion([
        {
          role: 'system',
          content: `أنت خبير تسويق على منصة "نواقص". المستخدم لم يحدد منشوراً بعينه.
حلل نشاطه العام واقترح أفضل استهداف. أجب بـ JSON فقط:
{
  "suggestedInterests": ["interest1", "interest2"],
  "suggestedCities": ["مدينة1"],
  "suggestedAgeRange": {"min": 18, "max": 45},
  "suggestedPackage": "basic|standard|premium|vip|city_target|interest_target",
  "confidence": 0.4,
  "reasoning": "شرح بالعربي",
  "contentSuggestions": ["اقتراح1"],
  "estimatedReachMultiplier": 1.0
}`
        },
        {
          role: 'user',
          content: `لم أحدد منشوراً محدداً. تصنيف نشاطي: ${userCategory}. محتوى آخر منشور: ${userContent.slice(0, 200)}`
        }
      ]);

      if (aiContent) {
        try {
          const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
          const aiResult = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

          if (aiResult) {
            // Convert English package names to Arabic
            if (aiResult.suggestedPackage) {
              aiResult.suggestedPackage = arPkg(aiResult.suggestedPackage);
            }
            return res.json({ success: true, data: aiResult });
          }
        } catch { /* fallback below */ }
      }

      return res.json({
        success: true,
        data: {
          suggestedInterests: categoryToInterests[userCategory] || ['other'],
          suggestedCities: [location || 'القاهرة'],
          suggestedAgeRange: { min: 18, max: 45 },
          suggestedPackage: arPkg('standard'),
          confidence: 0.4,
          reasoning: 'لم يتم تحديد منشور محدد. هذه اقتراحات عامة بناءً على نشاطك. اختر منشوراً محدداً للحصول على استهداف أدق.',
          contentSuggestions: ['اختر منشوراً محدداً للحصول على استهداف أكثر دقة', 'أضف صورة عالية الجودة', 'حدد السعر والموقع بوضوح'],
          estimatedReachMultiplier: 1.0,
        },
      });
    }

    // Get post data if postId provided
    let postData: any = {};
    if (postId) {
      const post = getPostById(postId);
      if (post) {
        postData = {
          content: post.content || '',
          category: post.category || '',
          price: post.price || 0,
          location: post.location || '',
          type: post.type || '',
        };
      }
    }

    const postContent = content || postData.content || '';
    const postCategory = category || postData.category || '';
    const postPrice = price || postData.price || 0;
    const postLocation = location || postData.location || '';

    const aiContent = await tryAICompletion([
      {
        role: 'system',
        content: `أنت خبير تسويق وترويج على منصة إعلانات ذكية في مصر اسمها "نواقص".
تحلل المنشورات وتقترح أفضل استهداف للترويج.

الاهتمامات المتاحة: phones, electronics, games, cars, realEstate, fashion, beauty, sports, food, jobs, services, education, books, animals, travel, photography, health, other

المدن المصرية الرئيسية: القاهرة، الجيزة، الإسكندرية، المنصورة، طنطا، الزقازيق، بورسعيد، السويس، الإسماعيلية، الفيوم، أسيوط، المنيا، سوهاج، قنا، الأقصر، أسوان، دمياط، كفر الشيخ، بنها، شبين الكوم، مرسى مطروح، الغردقة، شرم الشيخ، دهب، العريش، التجمع الخامس، نصر

أجب دائماً بـ JSON فقط بالشكل التالي:
{
  "suggestedInterests": ["interest1", "interest2"],
  "suggestedCities": ["مدينة1", "مدينة2"],
  "suggestedAgeRange": {"min": 18, "max": 45},
  "suggestedPackage": "basic|standard|premium|vip|city_target|interest_target",
  "confidence": 0.85,
  "reasoning": "شرح بالعربي لماذا هذا الاستهداف مناسب",
  "contentSuggestions": ["اقتراح1 لتحسين المنشور", "اقتراح2"],
  "estimatedReachMultiplier": 1.5
}`
      },
      {
        role: 'user',
        content: `حلل هذا المنشور واقترح أفضل استهداف:
المحتوى: ${postContent}
التصنيف: ${postCategory}
السعر: ${postPrice} ج.م
الموقع: ${postLocation}
${userId ? `رقم المستخدم: ${userId}` : ''}`
      }
    ], { max_tokens: 1000 });

    let aiResult;
    try {
      const content = aiContent || '';
      // Extract JSON from AI response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      aiResult = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      // Convert suggestedPackage from English to Arabic
      if (aiResult.suggestedPackage) {
        aiResult.suggestedPackage = arPkg(aiResult.suggestedPackage);
      }
    } catch {
      aiResult = {
        suggestedInterests: [postCategory || 'other'],
        suggestedCities: [postLocation || 'القاهرة'],
        suggestedAgeRange: { min: 18, max: 45 },
        suggestedPackage: arPkg('standard'),
        confidence: 0.5,
        reasoning: 'تحليل أساسي بناءً على تصنيف المنشور',
        contentSuggestions: [],
        estimatedReachMultiplier: 1.0,
      };
    }

    res.json({ success: true, data: aiResult });
  } catch (error: any) {
    console.error('[AI] Auto-target error:', error.message);
    // Fallback with smart rule-based targeting
    const { content, category, price, location } = req.body;
    const categoryToInterests: Record<string, string[]> = {
      phones: ['phones', 'electronics'],
      electronics: ['electronics', 'phones'],
      cars: ['cars'],
      realEstate: ['realEstate'],
      games: ['games', 'electronics'],
      fashion: ['fashion', 'beauty'],
      beauty: ['beauty', 'fashion'],
      sports: ['sports'],
      food: ['food'],
      jobs: ['jobs', 'education'],
      services: ['services', 'jobs'],
      education: ['education', 'books'],
      books: ['books', 'education'],
      animals: ['animals'],
      travel: ['travel', 'photography'],
      photography: ['photography', 'travel'],
      health: ['health', 'beauty'],
    };
    const cat = category || 'other';
    res.json({
      success: true,
      data: {
        suggestedInterests: categoryToInterests[cat] || ['other'],
        suggestedCities: [location || 'القاهرة'],
        suggestedAgeRange: { min: 18, max: 45 },
        suggestedPackage: price && price > 5000 ? arPkg('premium') : arPkg('standard'),
        confidence: 0.6,
        reasoning: `اقتراح تلقائي بناءً على تصنيف المنشور (${cat})`,
        contentSuggestions: ['أضف صورة عالية الجودة', 'حدد السعر بوضوح', 'اذكر حالة المنتج'],
        estimatedReachMultiplier: 1.0,
      },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// 2. AI مراجعة تلقائية لطلبات الترويج - Auto Review
// يحلل المنشور ويقرر ما إذا كان مناسباً للترويج
// ═══════════════════════════════════════════════════════════════════════
router.post('/review-promotion', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { postId, content, category, price } = req.body;

    if (!content && !postId) {
      return res.status(400).json({ error: 'محتوى المنشور أو رقم المنشور مطلوب' });
    }

    let postContent = content || '';
    let postCategory = category || '';
    let postPrice = price || 0;

    if (postId) {
      const post = getPostById(postId);
      if (post) {
        postContent = post.content || postContent;
        postCategory = post.category || postCategory;
        postPrice = post.price || postPrice;
      }
    }

    const zai = await getAI();
    if (!zai) {
      const { content, category } = req.body;
      const hasInappropriate = /سب|لعن|حما|اقت|سلا|سكر/i.test(content || '');
      const hasPrice = /ج\.م|جنيه|EGP|سعر|\d{3,}/.test(content || '');
      const hasImage = /صور|image|img|صورة/i.test(content || '');

      return res.json({
        success: true,
        data: {
          approved: !hasInappropriate,
          score: hasInappropriate ? 20 : (hasPrice ? 75 : 55),
          issues: hasInappropriate ? ['المحتوى قد يحتوي على كلمات غير مناسبة'] : [],
          suggestions: [
            ...(hasPrice ? [] : ['أضف السعر لزيادة مصداقية الإعلان']),
            ...(hasImage ? [] : ['أضف صورة للمنتج لجذب المزيد']),
            'اجعل العنوان واضح ومباشر',
          ],
          riskLevel: hasInappropriate ? 'high' : 'low',
          category: category || 'other',
          summary: hasInappropriate
            ? 'المحتوى يحتاج مراجعة يدوية'
            : 'المحتوى يبدو مناسباً للترويج',
        },
      });
    }
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `أنت مراجع محتوى ذكي على منصة إعلانات مصرية اسمها "نواقص".
مهمتك مراجعة المنشورات المطلوب ترويجها والتأكد من:
1. المحتوى مناسب ولا يحتوي على شيء غير قانوني أو مسيء
2. المنشور واضح ويحتوي على معلومات كافية
3. السعر معقول ومنطقي
4. التصنيف صحيح
5. لا يوجد سبام أو إعلانات مضللة

أجب بـ JSON فقط:
{
  "approved": true/false,
  "score": 0-100,
  "issues": ["مشكلة1", "مشكلة2"],
  "suggestions": ["اقتراح1", "اقتراح2"],
  "riskLevel": "low|medium|high",
  "category": "التصنيف الصحيح",
  "summary": "ملخص المراجعة بالعربي"
}`
        },
        {
          role: 'user',
          content: `راجع هذا المنشور للترويج:
المحتوى: ${postContent}
التصنيف: ${postCategory}
السعر: ${postPrice} ج.م`
        }
      ],
      temperature: 0.3,
      max_tokens: 800,
    });

    let aiResult;
    try {
      const content = completion.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      aiResult = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      aiResult = {
        approved: true,
        score: 70,
        issues: [],
        suggestions: [],
        riskLevel: 'low',
        category: postCategory,
        summary: 'مراجعة تلقائية - المحتوى يبدو مناسباً',
      };
    }

    res.json({ success: true, data: aiResult });
  } catch (error: any) {
    console.error('[AI] Review error:', error.message);
    // Fallback rule-based review
    const { content, category } = req.body;
    const hasInappropriate = /سب|لعن|حما|اقت|سلا|سكر/i.test(content || '');
    const hasPrice = /ج\.م|جنيه|EGP|سعر|\d{3,}/.test(content || '');
    const hasImage = /صور|image|img|صورة/i.test(content || '');

    res.json({
      success: true,
      data: {
        approved: !hasInappropriate,
        score: hasInappropriate ? 20 : (hasPrice ? 75 : 55),
        issues: hasInappropriate ? ['المحتوى قد يحتوي على كلمات غير مناسبة'] : [],
        suggestions: [
          ...(hasPrice ? [] : ['أضف السعر لزيادة مصداقية الإعلان']),
          ...(hasImage ? [] : ['أضف صورة للمنتج لجذب المزيد']),
          'اجعل العنوان واضح ومباشر',
        ],
        riskLevel: hasInappropriate ? 'high' : 'low',
        category: category || 'other',
        summary: hasInappropriate
          ? 'المحتوى يحتاج مراجعة يدوية'
          : 'المحتوى يبدو مناسباً للترويج',
      },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// 3. AI مساعد ترويج ذكي - Promotion Assistant Chat
// يجاوب على أسئلة المستخدمين عن الترويج
// ═══════════════════════════════════════════════════════════════════════
router.post('/assistant', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { message, context, history } = req.body;
    const userId = (req as any).user?.userId || '';

    if (!message || typeof message !== 'string' || message.length > 2000) {
      return res.status(400).json({ error: 'الرسالة مطلوبة (بحد أقصى 2000 حرف)' });
    }

    // Gather user context
    let userInfo = '';
    if (userId) {
      const user = getUserById(userId);
      if (user) {
        const db = database;
        const userPosts = db.prepare('SELECT COUNT(*) as count FROM posts WHERE author_id = ?').get(userId) as any;
        const userPromos = db.prepare('SELECT COUNT(*) as count FROM posts WHERE author_id = ? AND is_promoted = 1').get(userId) as any;
        const walletBalance = user.wallet_balance || 0;
        userInfo = `
معلومات المستخدم:
- الاسم: ${user.name}
- رصيد المحفظة: ${walletBalance} ج.م
- عدد المنشورات: ${userPosts?.count || 0}
- عدد الترويجات: ${userPromos?.count || 0}
- الاهتمامات: ${user.interests || 'غير محدد'}
- الموقع: ${user.location || 'غير محدد'}`;

        // Fetch actual posts content for AI context
        const userPostsList = db.prepare('SELECT id, content, category, price, location, type, image, likes, comments, is_promoted, promotion_status, created_at FROM posts WHERE author_id = ? ORDER BY created_at DESC LIMIT 20').all(userId) as any[];
        const postsSummary = userPostsList.map((p: any, i: number) =>
          `${i+1}. [${p.is_promoted ? 'مروّج' : 'غير مروّج'}] "${p.content?.slice(0, 100)}..." | تصنيف: ${p.category || 'عام'} | سعر: ${p.price || 'غير محدد'} ج.م | إعجابات: ${p.likes || 0} | ${p.image ? '📸 صورة' : '❌ بدون صورة'}`
        ).join('\n');

        if (postsSummary) {
          userInfo += `\n\nمنشورات المستخدم:\n${postsSummary}`;
        }
      }
    }

    // ─── Build conversation messages (multi-turn) ──────────────
    // Sanitize and limit history to last 10 messages to keep context small
    const sanitizedHistory: Array<{ role: 'user' | 'assistant'; content: string }> = Array.isArray(history)
      ? history
          .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
          .slice(-10)
          .map((m: any) => ({ role: m.role, content: m.content.slice(0, 1000) }))
      : [];

    const zai = await getAI();
    if (!zai) {
      // ─── Enhanced rule-based fallback ──────────────────────────
      const reply = generateSmartFallback(message, userInfo);
      return res.json({ success: true, reply, fallback: true });
    }

    // Build messages array: system prompt + history + current message
    const messages: any[] = [
      {
        role: 'system',
        content: `أنت "نواقص" - مساعد ذكي للترويج على منصة الإعلانات الذكية في مصر.

مهمتك:
- مساعدة المستخدمين في اختيار أفضل باقة ترويج لميزانيتهم وأهدافهم
- تحسين محتوى إعلاناتهم
- شرح كيف يعمل الترويج بوضوح
- تقديم نصائح لزيادة الوصول والمبيعات
- حل مشاكل الترويج
- تحليل منشورات المستخدم واقتراح أفضلها للترويج

باقات الترويج المتاحة:
- أساسي (50 ج.م): 900 وصول، 3 أيام، 30 إشعار
- قياسي (120 ج.م): 3,000 وصول، 5 أيام، 100 إشعار
- مميز (250 ج.م): 8,000 وصول، 7 أيام، 250 إشعار (الأكثر طلباً)
- VIP (500 ج.م): 25,000 وصول، 10 أيام، 600 إشعار
- استهداف مدن (من 120 ج.م): اختيار 1-27 مدينة مصرية
- استهداف اهتمامات (200 ج.م): 7,000 وصول، 5 أيام، 200 إشعار

قواعد مهمة:
1. أجب بالعربي دائماً بشكل مختصر ومفيد (لا تتجاوز 200 كلمة)
2. استخدم الاسم العربي للباقات دائماً (أساسي، قياسي، مميز، VIP، استهداف مدن، استهداف اهتمامات) — لا تستخدم الاسم الإنجليزي أبداً
3. كن ودوداً ومحفزاً ومحترماً
4. استخدم الأرقام والأمثلة المحددة
5. عند ذكر أسعار، استخدم "ج.م" (جنيه مصري)
6. إذا كان السؤال خارج نطاق الترويج، وجّه المستخدم بأدب للمواضيع التي تستطيع مساعدته فيها
7. عند السؤال عن "أفضل باقة"، اسأل عن الميزانية والهدف أولاً إذا لم يذكرهما المستخدم

${userInfo || 'ملاحظة: المستخدم غير مسجل دخول - قدم إجابات عامة.'}`,
      },
      ...sanitizedHistory,
      { role: 'user' as const, content: message },
    ];

    const completion = await zai.chat.completions.create({
      messages,
      temperature: 0.7,
      max_tokens: 600,
    });

    const aiReply = completion.choices?.[0]?.message?.content
      || generateSmartFallback(message, userInfo);

    res.json({ success: true, reply: aiReply });
  } catch (error: any) {
    console.error('[AI] Assistant error:', error.message);
    // Fallback rule-based responses
    const reply = generateSmartFallback(req.body?.message || '', '');
    res.json({ success: true, reply, fallback: true });
  }
});

// ─── Smart fallback response generator ─────────────────────────
function generateSmartFallback(message: string, userInfo: string): string {
  const msg = (message || '').toLowerCase().trim();

  // Extract wallet balance from userInfo if available
  const walletMatch = userInfo.match(/رصيد المحفظة:\s*(\d+)/);
  const walletBalance = walletMatch ? parseInt(walletMatch[1], 10) : 0;

  // Package recommendation based on wallet balance
  if (msg.includes('باقة') || msg.includes('أفضل') || msg.includes('اقترح') || msg.includes('أنصح') || msg.includes('وش تنصح')) {
    if (walletBalance >= 500) {
      return `بناءً على رصيدك (${walletBalance} ج.م)، أنصحك بباقة "VIP" - 500 ج.م:\n\n✅ 25,000 وصول\n✅ 10 أيام ترويج\n✅ 600 إشعار مباشر\n\nأفضل خيار لزيادة وصول إعلانك بشكل كبير! 🚀`;
    } else if (walletBalance >= 250) {
      return `بناءً على رصيدك (${walletBalance} ج.م)، أنصحك بباقة "مميز" - 250 ج.م (الأكثر طلباً):\n\n✅ 8,000 وصول\n✅ 7 أيام ترويج\n✅ 250 إشعار مباشر\n\nخيار ممتاز لزيادة وصول إعلانك! 📈`;
    } else if (walletBalance >= 120) {
      return `بناءً على رصيدك (${walletBalance} ج.م)، أنصحك بباقة "قياسي" - 120 ج.م:\n\n✅ 3,000 وصول\n✅ 5 أيام ترويج\n✅ 100 إشعار مباشر\n\nبداية جيدة للترويج! يمكنك شحن محفظتك للاستفادة من باقات أعلى. 💪`;
    } else if (walletBalance >= 50) {
      return `بناءً على رصيدك (${walletBalance} ج.م)، أنصحك بباقة "أساسي" - 50 ج.م:\n\n✅ 900 وصول\n✅ 3 أيام ترويج\n✅ 30 إشعار مباشر\n\nابدأ تجربتك مع الترويج! يمكنك شحن محفظتك للاستفادة من باقات أعلى لاحقاً. ⭐`;
    }
    return `أقترح باقة "مميز" - الأكثر طلباً! 🌟\n\nبـ 250 ج.م تحصل على:\n✅ 8,000 وصول\n✅ 7 أيام ترويج\n✅ 250 إشعار مباشر\n\nإذا ميزانيتك أقل، ابدأ بباقة "قياسي" بـ 120 ج.م.\nشحن محفظتك الآن للاستفادة من باقة أعلى! 💰`;
  }

  if (msg.includes('سعر') || msg.includes('كم') || msg.includes('تكلفة') || msg.includes('بكام')) {
    return `💰 أسعار باقات الترويج:\n\n• أساسي: 50 ج.م (900 وصول، 3 أيام)\n• قياسي: 120 ج.م (3,000 وصول، 5 أيام)\n• مميز: 250 ج.م (8,000 وصول، 7 أيام) ⭐ الأكثر طلباً\n• VIP: 500 ج.م (25,000 وصول، 10 أيام)\n• استهداف مدن: من 120 ج.م\n• استهداف اهتمامات: 200 ج.م\n\nكلما زادت الباقة، زاد الوصول لإعلانك! 📈`;
  }

  if (msg.includes('كيف') || msg.includes('طريقة') || msg.includes('شرح') || msg.includes('ازاي')) {
    return `🚀 الترويج على نواقص سهل جداً!\n\n1️⃣ اختر إعلانك من منشوراتك\n2️⃣ اضغط زر "ترويج" 📣\n3️⃣ اختر الباقة المناسبة لميزانيتك\n4️⃣ ادفع من محفظتك الإلكترونية\n5️⃣ انتظر موافقة الإدارة (دقائق)\n6️⃣ يبدأ الترويج فوراً! 🎉\n\nلا تنسَ شحن محفظتك أولاً من صفحة المحفظة. 💰`;
  }

  if (msg.includes('تحسين') || msg.includes('نصيحة') || msg.includes('نصائح') || msg.includes('كيف ا')) {
    return `💡 نصائح لزيادة فعالية الترويج:\n\n1. 📸 أضف صورة واضحة عالية الجودة (تفضل 1200×800)\n2. ✍️ اكتب عنوان جذاب وأول 50 حرف هي الأهم\n3. 💵 حدد السعر بوضوح ولا تبالغ\n4. 🎯 اختر الاستهداف المناسب (مدن/اهتمامات)\n5. 💬 رد على التعليقات بسرعة\n6. 🔄 جدد الترويج إذا لاقى تفاعلاً جيداً\n7. ⏰ أفضل وقت للترويج: 7-10 مساءً\n\nحظ موفق! 🍀`;
  }

  if (msg.includes('وصول') || msg.includes('مشاهدات') || msg.includes('reach')) {
    return `📊 الوصول يعني عدد الأشخاص الذين شاهدوا إعلانك.\n\nكل باقة تقدم وصول مختلف:\n• أساسي: 900 وصول\n• قياسي: 3,000 وصول\n• مميز: 8,000 وصول ⭐\n• VIP: 25,000 وصول\n\nكلما زاد الوصول، زاد احتمال البيع! 🎯\nنصيحة: راقب "تحليلات الترويج" لمعرفة أي الباقات تجلب لك أفضل النتائج.`;
  }

  if (msg.includes('محفظة') || msg.includes('رصيد') || msg.includes('شحن')) {
    return `💰 المحفظة الإلكترونية:\n\n• شحن المحفظة متاح عبر: فودافون كاش، إنستاباي، تحويل بنكي\n• الحد الأدنى للشحن: 50 ج.م\n• استخدم رصيدك لدفع باقات الترويج\n• تابع معاملاتك من صفحة المحفظة\n\nشحن محفظتك الآن للاستفادة من باقات الترويج! 🚀`;
  }

  if (msg.includes('مراجعة') || msg.includes('موافقة') || msg.includes('انتظار')) {
    return `⏳ موافقة الإدارة على الترويج:\n\n• عادةً تتم المراجعة خلال 5-30 دقيقة\n• ستصل إشعار فور الموافقة\n• في حالة الرفض، يُعاد رصيدك للمحفظة\n• يمكنك مراجعة حالة الترويج من "تحليلات الترويج"\n\nللسرعة في الموافقة، تأكد من أن إعلانك: ✅ محتوى واضح ✅ سعر مناسب ✅ صورة حقيقية`;
  }

  if (msg.includes('شكرا') || msg.includes('شكراً') || msg.includes('تمام') || msg.includes('ok')) {
    return `العفو! 😊 أنا دائماً هنا لمساعدتك. إذا احتجت أي استفسار آخر عن الترويج أو الباقات، لا تتردد في السؤال. بالتوفيق في إعلاناتك! 🍀`;
  }

  if (msg.includes('مرحبا') || msg.includes('السلام') || msg.includes('هاي') || msg.includes('hello')) {
    return `أهلاً وسهلاً بك! 👋🎉\n\nأنا مساعد الترويج الذكي في منصة نواقص. يمكنني مساعدتك في:\n\n• 📦 اختيار الباقة المناسبة لميزانيتك\n• ✨ تحسين محتوى إعلانك\n• 💡 نصائح لزيادة الوصول\n• 📊 فهم إحصائيات الترويج\n• ❓ أي سؤال آخر عن الترويج\n\nكيف أقدر أساعدك اليوم؟ 😊`;
  }

  if (msg.includes('vip') || msg.includes('في اي بي')) {
    return `👑 باقة VIP - الأقوى على الإطلاق!\n\n💰 السعر: 500 ج.م\n📊 الوصول: 25,000 مشاهدة\n⏰ المدة: 10 أيام\n🔔 الإشعارات: 600 إشعار مباشر\n\nمثالية لـ:\n✅ الإعلانات المهمة والعاجلة\n✅ المنتجات الفاخرة\n✅ زيادة المبيعات بسرعة\n✅ الوصول لأكبر جمهور ممكن\n\nأنصحك بها إذا كان لديك منتج تريد بيعه بسرعة! 🚀`;
  }

  // Default fallback
  return `🤔 لم أفهم سؤالك تماماً. يمكنني مساعدتك في:\n\n• 📦 اختيار باقة الترويج المناسبة\n• 💰 معرفة الأسعار والتكاليف\n• ✨ تحسين محتوى إعلانك\n• 💡 نصائح لزيادة الوصول\n• 📊 شرح إحصائيات الترويج\n• ❓ كيف يعمل الترويج خطوة بخطوة\n\nاكتب سؤالك بشكل مختلف أو اختر من المواضيع أعلاه. 😊`;
}

// ═══════════════════════════════════════════════════════════════════════
// 4. AI اقتراح الميزانية والباقة - Budget Suggestion
// ═══════════════════════════════════════════════════════════════════════
router.post('/budget-suggestion', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { budget, category, price, goal } = req.body;
    const userId = (req as any).user?.userId;

    // Get user's wallet balance
    let walletBalance = 0;
    if (userId) {
      const user = getUserById(userId);
      walletBalance = user?.wallet_balance || 0;
    }

    const actualBudget = budget || walletBalance || 0;

    // Smart rule-based suggestion with AI enhancement
    const packages = [
      { id: 'basic', name: 'أساسي', price: 50, reach: 900, days: 3, notifications: 30 },
      { id: 'standard', name: 'قياسي', price: 120, reach: 3000, days: 5, notifications: 100 },
      { id: 'premium', name: 'مميز', price: 250, reach: 8000, days: 7, notifications: 250 },
      { id: 'vip', name: 'VIP', price: 500, reach: 25000, days: 10, notifications: 600 },
      { id: 'interest_target', name: 'استهداف اهتمامات', price: 200, reach: 7000, days: 5, notifications: 200 },
      { id: 'city_target', name: 'استهداف مدن', price: 120, reach: 4500, days: 5, notifications: 150 },
    ];

    // Find affordable packages
    const affordable = packages.filter(p => p.price <= actualBudget);
    const bestValue = affordable.length > 0
      ? affordable.reduce((best, p) => (p.reach / p.price > best.reach / best.price) ? p : best, affordable[0])
      : null;

    // Determine recommended based on budget
    let recommended: any = null;
    let reasoning = '';

    if (actualBudget >= 500) {
      recommended = packages.find(p => p.id === 'vip');
      reasoning = 'ميزانيتك تسمح بأفضل باقة VIP - وصول هائل لـ 25,000 مستخدم مهتم!';
    } else if (actualBudget >= 250) {
      recommended = packages.find(p => p.id === 'premium');
      reasoning = 'باقة مميزة ممتازة ليك - الأكثر طلباً! وصول 8,000 مستخدم مهتم';
    } else if (actualBudget >= 200) {
      recommended = packages.find(p => p.id === 'interest_target');
      reasoning = 'استهداف الاهتمامات مناسب لميزانيتك - يوصل إعلانك لـ 7,000 مهتم بالذكاء الاصطناعي';
    } else if (actualBudget >= 120) {
      recommended = packages.find(p => p.id === 'standard');
      reasoning = 'باقة قياسية جيدة - 3,000 وصول و5 أيام ترويج';
    } else if (actualBudget >= 50) {
      recommended = packages.find(p => p.id === 'basic');
      reasoning = 'باقة أساسية للبداية - 900 وصول و3 أيام';
    } else {
      reasoning = 'تحتاج شحن محفظتك أولاً. أقل باقة تبدأ من 50 ج.م';
    }

    // Try AI enhancement for richer suggestions
    let aiInsight = '';
    try {
      const zai = await getAI();
      if (!zai) {
        // AI unavailable - aiInsight stays empty, rule-based suggestion used
      } else {
        const completion = await zai.chat.completions.create({
          messages: [
            {
              role: 'system',
              content: 'أنت خبير تسويق. أجب بالعربي في جملة واحدة: ما أفضل نصيحة لميزانية ' + actualBudget + ' ج.م؟'
            },
            {
              role: 'user',
              content: `الميزانية: ${actualBudget} ج.م، التصنيف: ${category || 'عام'}، هدف المستخدم: ${goal || 'زيادة الوصول'}`
            }
          ],
          temperature: 0.7,
          max_tokens: 100,
        });
        aiInsight = completion.choices?.[0]?.message?.content || '';
      }
    } catch { /* ignore AI failure */ }

    res.json({
      success: true,
      data: {
        walletBalance: actualBudget,
        recommended,
        bestValue,
        affordable,
        needsCharging: actualBudget < 50,
        minimumRequired: 50,
        reasoning,
        aiInsight,
        tips: actualBudget < 50
          ? ['اشحن محفظتك بـ 50 ج.م على الأقل للبدء']
          : actualBudget < 150
            ? ['ابدأ بباقة أساسية واختبر النتائج', 'أضف صورة لزيادة التفاعل بنسبة 40%']
            : actualBudget < 350
              ? ['باقة قياسية توفر توازن جيد بين السعر والوصول', 'استهدف اهتمامات جمهورك بدقة']
              : ['الباقة المميزة/VIP تضمن أقصى وصول', 'استخدم استهداف الاهتمامات للوصول للمهتمين فعلاً'],
      },
    });
  } catch (error: any) {
    console.error('[AI] Budget suggestion error:', error.message);
    res.status(500).json({ error: 'حدث خطأ في اقتراح الميزانية' });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// 5. AI تحليلات وتوصيات ذكية - Smart Insights
// ═══════════════════════════════════════════════════════════════════════
router.get('/insights', authMiddleware, async (req: Request, res: Response) => {
  try {
    const payload = (req as any).user;
    const cacheKey = `insights_${payload.userId}`;
    const cached = getCached(cacheKey);
    if (cached) { return res.json({ success: true, data: cached, cached: true }); }
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ error: 'يجب تسجيل الدخول' });

    const db = database;

    // Gather user info
    const user = getUserById(userId);
    const walletBalance = user?.wallet_balance || 0;

    // Gather all user posts (promoted + non-promoted)
    let allUserPosts: any[] = [];
    try {
      allUserPosts = db.prepare('SELECT id, content, category, price, is_promoted, promotion_tier, likes, comments, reach_count, click_count, created_at FROM posts WHERE author_id = ? ORDER BY created_at DESC').all(userId) as any[];
    } catch (dbErr: any) {
      console.error('[AI] Insights posts query error:', dbErr.message);
    }

    const totalPosts = allUserPosts.length;
    const promotedPosts = allUserPosts.filter((p: any) => p.is_promoted === 1).length;
    const unpromotedPosts = totalPosts - promotedPosts;

    // Gather promotion data with correct column names
    let myPromotions: any[] = [];
    try {
      myPromotions = db.prepare(`
        SELECT p.*, pr.tier as promotion_tier, pr.status as promotion_status, pr.targeting, pr.target_city, pr.target_interests,
               pr.price as promotion_price, p.promotion_expires_at
        FROM posts p
        LEFT JOIN promotion_requests pr ON pr.post_id = p.id
        WHERE p.author_id = ? AND p.is_promoted = 1
        ORDER BY p.created_at DESC
      `).all(userId) as any[];
    } catch (dbErr: any) {
      console.error('[AI] Insights DB query error:', dbErr.message);
      myPromotions = [];
    }

    const totalSpent = myPromotions.reduce((sum: number, p: any) => sum + (p.promotion_price || 0), 0);
    const totalReach = myPromotions.reduce((sum: number, p: any) => sum + (p.reach_count || 0), 0);
    const totalClicks = myPromotions.reduce((sum: number, p: any) => sum + (p.click_count || 0), 0);
    const activePromotions = myPromotions.filter((p: any) => {
      try {
        return p.promotion_status === 'approved' && p.promotion_expires_at && new Date(p.promotion_expires_at) > new Date();
      } catch { return false; }
    }).length;

    // Category performance analysis
    const categoryPerformance: Record<string, { count: number; reach: number; clicks: number }> = {};
    myPromotions.forEach((p: any) => {
      const cat = p.category || 'other';
      if (!categoryPerformance[cat]) categoryPerformance[cat] = { count: 0, reach: 0, clicks: 0 };
      categoryPerformance[cat].count++;
      categoryPerformance[cat].reach += (p.reach_count || 0);
      categoryPerformance[cat].clicks += (p.click_count || 0);
    });

    // Find best performing category
    let bestCategory = '';
    let bestCTR = 0;
    Object.entries(categoryPerformance).forEach(([cat, data]) => {
      const ctr = data.reach > 0 ? data.clicks / data.reach : 0;
      if (ctr > bestCTR) {
        bestCTR = ctr;
        bestCategory = cat;
      }
    });

    // Tier performance
    const tierPerformance: Record<string, { count: number; reach: number; cost: number }> = {};
    myPromotions.forEach((p: any) => {
      const tier = p.promotion_tier || 'basic';
      if (!tierPerformance[tier]) tierPerformance[tier] = { count: 0, reach: 0, cost: 0 };
      tierPerformance[tier].count++;
      tierPerformance[tier].reach += (p.reach_count || 0);
      tierPerformance[tier].cost += (p.promotion_price || 0);
    });

    // Find best ROI tier
    let bestROITier = '';
    let bestROI = 0;
    Object.entries(tierPerformance).forEach(([tier, data]) => {
      const roi = data.cost > 0 ? data.reach / data.cost : 0;
      if (roi > bestROI) {
        bestROI = roi;
        bestROITier = tier;
      }
    });

    // AI-powered insights - include user's posts context for better recommendations
    let aiInsights: string[] = [];
    
    // Build a summary of user's posts for AI context
    const postsSummary = allUserPosts.slice(0, 10).map((p: any, i: number) => {
      const tier = p.promotion_tier || p.promotion_tier || 'غير مروّج';
      return `${i + 1}. [${p.is_promoted ? 'مروّج - ' + arPkg(tier) : 'غير مروّج'}] "${(p.content || '').slice(0, 60)}..." | تصنيف: ${p.category || 'عام'} | سعر: ${p.price || 'غير محدد'} ج.م | إعجابات: ${p.likes || 0}`;
    }).join('\n');

    try {
      const zai = await getAI();
      if (!zai) {
        // Rule-based fallback
        if (totalReach === 0) {
          aiInsights = ['ابدأ بترويج إعلانك أولاً لرؤية التحليلات', 'باقة قياسية هي نقطة بداية ممتازة', 'أضف صورة لإعلانك لزيادة النقرات'];
        } else {
          const ctr = totalReach > 0 ? (totalClicks / totalReach * 100).toFixed(1) : '0';
          aiInsights = [
            `نسبة النقر الحالية ${ctr}% - ${parseFloat(ctr) > 3 ? 'ممتازة!' : parseFloat(ctr) > 1 ? 'جيدة ويمكن تحسينها' : 'تحتاج تحسين - جرب تغيير الصورة أو العنوان'}`,
            bestCategory ? `تصنيف "${bestCategory}" يحقق أفضل نتائج - ركز عليه` : 'اختبر تصنيفات مختلفة لمعرفة الأفضل',
            bestROITier ? `باقة "${replacePkgNamesInText(arPkg(bestROITier))}" تعطي أفضل عائد - استثمر فيها أكثر` : 'جرب باقة "مميز" - الأكثر طلباً وأفضل عائد',
          ];
        }
      } else {
        const completion = await zai.chat.completions.create({
          messages: [
            {
              role: 'system',
              content: `أنت محلل بيانات ذكي لمنصة إعلانات مصرية اسمها "نواقص".
بناءً على البيانات التالية، أعطِ 3-5 توصيات قصيرة ومفيدة بالعربي لتحسين أداء الترويج.
كل توصية في سطر منفصل. كن محدداً وعملياً.
مهم: استخدم أسماء الباقات العربية (أساسي، قياسي، مميز، VIP، استهداف مدن، استهداف اهتمامات) ولا تستخدم الأسماء الإنجليزية أبداً.`
            },
            {
              role: 'user',
              content: `تحليلاتي:
- إجمالي الإنفاق: ${totalSpent} ج.م
- إجمالي الوصول: ${totalReach}
- إجمالي النقرات: ${totalClicks}
- الترويجات النشطة: ${activePromotions}
- أفضل تصنيف: ${bestCategory || 'لا يوجد'}
- أفضل باقة: ${bestROITier ? arPkg(bestROITier) : 'لا يوجد'}
- عدد الترويجات: ${myPromotions.length}
- رصيد المحفظة: ${walletBalance} ج.م
- إجمالي المنشورات: ${totalPosts} (مروّجة: ${promotedPosts}, غير مروّجة: ${unpromotedPosts})

منشوراتي:
${postsSummary || 'لا توجد منشورات بعد'}`
            }
          ],
          temperature: 0.7,
          max_tokens: 400,
        });

        const content = completion.choices?.[0]?.message?.content || '';
        aiInsights = content.split('\n').filter((l: string) => l.trim().length > 0).slice(0, 5);
      }
    } catch {
      // Rule-based fallback
      if (totalReach === 0) {
        aiInsights = ['ابدأ بترويج إعلانك أولاً لرؤية التحليلات', 'باقة قياسية هي نقطة بداية ممتازة', 'أضف صورة لإعلانك لزيادة النقرات'];
      } else {
        const ctr = totalReach > 0 ? (totalClicks / totalReach * 100).toFixed(1) : '0';
        aiInsights = [
          `نسبة النقر الحالية ${ctr}% - ${parseFloat(ctr) > 3 ? 'ممتازة!' : parseFloat(ctr) > 1 ? 'جيدة ويمكن تحسينها' : 'تحتاج تحسين - جرب تغيير الصورة أو العنوان'}`,
          bestCategory ? `تصنيف "${bestCategory}" يحقق أفضل نتائج - ركز عليه` : 'اختبر تصنيفات مختلفة لمعرفة الأفضل',
          bestROITier ? `باقة "${replacePkgNamesInText(arPkg(bestROITier))}" تعطي أفضل عائد - استثمر فيها أكثر` : 'جرب باقة "مميز" - الأكثر طلباً وأفضل عائد',
        ];
      }
    }

    res.json({
      success: true,
      data: {
        summary: {
          totalSpent,
          totalReach,
          totalClicks,
          activePromotions,
          totalPromotions: myPromotions.length,
          avgCTR: totalReach > 0 ? (totalClicks / totalReach * 100).toFixed(1) : '0',
          totalPosts,
          promotedPosts,
          unpromotedPosts,
          walletBalance,
        },
        categoryPerformance,
        tierPerformance,
        bestCategory,
        bestROITier: bestROITier ? arPkg(bestROITier) : '',
        aiInsights,
        posts: allUserPosts.slice(0, 10).map((p: any) => ({
          id: p.id,
          content: p.content,
          contentPreview: (p.content || '').slice(0, 80),
          category: p.category,
          price: p.price,
          isPromoted: !!p.is_promoted,
          promotionTier: p.is_promoted ? arPkg(p.promotion_tier || 'basic') : null,
          likes: p.likes || 0,
          comments: p.comments || 0,
          reachCount: p.reach_count || 0,
          clickCount: p.click_count || 0,
          createdAt: p.created_at,
        })),
        recommendations: {
          nextBestAction: activePromotions > 0
            ? 'راقب أداء ترويجاتك الحالية وقارن النتائج'
            : unpromotedPosts > 0
              ? `لديك ${unpromotedPosts} منشور غير مروّج - اختر الأفضل وابدأ الترويج!`
              : 'ابدأ بإنشاء منشور ثم روّجه - الباقة القياسية خيار ممتاز',
          suggestedBudget: totalSpent === 0 ? 150 : Math.max(150, Math.round(totalSpent * 0.3)),
        },
      },
    });
  } catch (error: any) {
    console.error('[AI] Insights error:', error.message);
    // Return empty data instead of 500 error so UI doesn't crash
    res.json({
      success: true,
      data: {
        summary: {
          totalSpent: 0,
          totalReach: 0,
          totalClicks: 0,
          activePromotions: 0,
          totalPromotions: 0,
          avgCTR: '0',
        },
        categoryPerformance: {},
        tierPerformance: {},
        bestCategory: '',
        bestROITier: '',
        aiInsights: ['ابدأ بترويج إعلانك أولاً لرؤية التحليلات', 'باقة قياسية هي نقطة بداية ممتازة', 'أضف صورة لإعلانك لزيادة النقرات'],
        recommendations: {
          nextBestAction: 'ابدأ بترويج إعلانك الآن - الباقة القياسية خيار ممتاز',
          suggestedBudget: 150,
        },
      },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// 6. AI تحسين المحتوى - Content Enhancement
// ═══════════════════════════════════════════════════════════════════════
router.post('/enhance-content', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { content, category, price } = req.body;
    if (!content) return res.status(400).json({ error: 'المحتوى مطلوب' });

    const zai = await getAI();
    if (!zai) {
      const { content } = req.body;
      return res.json({
        success: true,
        data: {
          enhancedContent: content,
          title: '',
          hashtags: [],
          callToAction: 'اطلب الآن!',
          scoreImprovement: 10,
          tips: ['أضف صورة واضحة للمنتج', 'حدد السعر والموقع', 'اذكر حالة المنتج', 'استخدم كلمات مفتاحية في الوصف'],
        },
      });
    }
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `أنت خبير كتابة إعلانات على منصة "نواقص" المصرية.
حسّن محتوى الإعلان لجعله أكثر جاذبية وفعالية.
أجب بـ JSON فقط:
{
  "enhancedContent": "المحتوى المحسن",
  "title": "عنوان جذاب",
  "hashtags": ["هاشتاق1", "هاشتاق2"],
  "callToAction": "عبارة تحفيزية للشراء",
  "scoreImprovement": 25,
  "tips": ["نصيحة1", "نصيحة2"]
}`
        },
        {
          role: 'user',
          content: `حسّن هذا الإعلان:
المحتوى: ${content}
التصنيف: ${category || 'عام'}
السعر: ${price || 'غير محدد'} ج.م`
        }
      ],
      temperature: 0.7,
      max_tokens: 800,
    });

    let aiResult;
    try {
      const content = completion.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      aiResult = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      aiResult = {
        enhancedContent: content,
        title: '',
        hashtags: [],
        callToAction: 'اطلب الآن!',
        scoreImprovement: 15,
        tips: ['أضف صورة واضحة', 'حدد السعر بوضوح'],
      };
    }

    res.json({ success: true, data: aiResult });
  } catch (error: any) {
    console.error('[AI] Content enhancement error:', error.message);
    const { content } = req.body;
    res.json({
      success: true,
      data: {
        enhancedContent: content,
        title: '',
        hashtags: [],
        callToAction: 'اطلب الآن!',
        scoreImprovement: 10,
        tips: ['أضف صورة واضحة للمنتج', 'حدد السعر والموقع', 'اذكر حالة المنتج', 'استخدم كلمات مفتاحية في الوصف'],
      },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// 7. AI تحديد موضع المنشورات المروجة - Smart Placement Engine
// الذكاء الاصطناعي يحدد أفضل مكان لكل منشور مروج في الصفحة
// ═══════════════════════════════════════════════════════════════════════
router.post('/smart-placement', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { promotedPosts, totalPosts, feedType, userInterests } = req.body;
    const userId = (req as any).user?.userId || null;

    if (!Array.isArray(promotedPosts) || promotedPosts.length === 0) {
      return res.json({ success: true, positions: [], strategy: 'none' });
    }

    const db = database;
    const promotedCount = promotedPosts.length;
    const regularCount = (totalPosts || 20) - promotedCount;

    // ─── Step 1: Gather historical engagement data ──────────────────
    let engagementData: any[] = [];
    try {
      engagementData = db.prepare(`
        SELECT feed_position, action, COUNT(*) as count,
               AVG(time_on_screen) as avg_time,
               AVG(scroll_depth) as avg_scroll_depth
        FROM promotion_engagement
        WHERE feed_type = ? AND created_at >= datetime('now', '-7 days')
        GROUP BY feed_position, action
        ORDER BY feed_position
      `).all(feedType || 'home') as any[];
    } catch { /* table might not exist yet */ }

    // ─── Step 2: Calculate CTR by position from engagement data ─────
    const positionStats: Record<number, { impressions: number; clicks: number; avgTime: number; avgScroll: number }> = {};
    for (const row of engagementData) {
      if (!positionStats[row.feed_position]) {
        positionStats[row.feed_position] = { impressions: 0, clicks: 0, avgTime: 0, avgScroll: 0 };
      }
      if (row.action === 'impression') positionStats[row.feed_position].impressions = row.count;
      if (row.action === 'click') positionStats[row.feed_position].clicks = row.count;
      positionStats[row.feed_position].avgTime = row.avg_time || 0;
      positionStats[row.feed_position].avgScroll = row.avg_scroll_depth || 0;
    }

    // ─── Step 3: Check for cached AI strategy ───────────────────────
    const hourKey = new Date().getHours();
    const interestsKey = Array.isArray(userInterests) ? userInterests.slice(0, 3).sort().join(',') : '';
    const cacheKey = `placement_${feedType || 'home'}_${hourKey}_${promotedCount}_${interestsKey}`;

    let cachedStrategy: any = null;
    try {
      const cached = db.prepare(
        'SELECT strategy FROM ai_placement_cache WHERE cache_key = ? AND expires_at > datetime("now")'
      ).get(cacheKey) as any;
      if (cached) {
        cachedStrategy = JSON.parse(cached.strategy);
        // Update hit count
        db.prepare('UPDATE ai_placement_cache SET hit_count = hit_count + 1 WHERE cache_key = ?').run(cacheKey);
      }
    } catch { /* ignore cache errors */ }

    if (cachedStrategy) {
      return res.json({ success: true, ...cachedStrategy, fromCache: true });
    }

    // ─── Step 4: Generate AI-powered placement strategy ─────────────
    // Build engagement summary for AI
    const engagementSummary = Object.entries(positionStats)
      .map(([pos, stats]) => `الموضع ${pos}: انطباعات=${stats.impressions}, نقرات=${stats.clicks}, معدل النقر=${stats.impressions > 0 ? ((stats.clicks / stats.impressions) * 100).toFixed(1) : 0}%, وقت_مشاهدة=${stats.avgTime.toFixed(1)}ث`)
      .join('\n');

    // Time of day context
    const currentHour = new Date().getHours();
    let timeContext = '';
    if (currentHour >= 5 && currentHour < 12) timeContext = 'صباحاً - مستخدمون أكثر نشاطاً واهتماماً بالتسوق';
    else if (currentHour >= 12 && currentHour < 17) timeContext = 'ظهراً - فترة راحة، تفاعل متوسط';
    else if (currentHour >= 17 && currentHour < 22) timeContext = 'مساءً - أعلى فترة تفاعل وتمضية وقت';
    else timeContext = 'ليلاً - تفاعل أقل لكن مستخدمون أكثر تركيزاً';

    // Build promoted posts summary for AI
    const promotedSummary = promotedPosts.slice(0, 10).map((p: any, i: number) => {
      const tier = p.promotionTier || p.promotion_tier || 'basic';
      const interests = p.targetInterests || p.target_interests || [];
      const category = p.category || '';
      return `${i + 1}. مستوى=${tier}, تصنيف=${category}, استهداف=${interests.join('/')}`;
    }).join('\n');

    let aiResult: any = null;

    try {
      const zai = await getAI();
      if (!zai) {
        // AI unavailable - aiResult stays null, rule-based fallback will be used
      } else {
        const completion = await zai.chat.completions.create({
          messages: [
            {
              role: 'system',
              content: `أنت محرك ذكاء اصطناعي لتحديد مواضع الإعلانات المروجة في صفحة منصة إعلانات مصرية "نواقص".
مهمتك تحديد أفضل المواضع لكل إعلان مروج بناءً على:
1. أداء المواضع السابقة (أي موضع حقق أعلى تفاعل)
2. مستوى الباقة (VIP يحتاج موضع أفضل من Basic)
3. ملاءمة المحتوى لاهتمامات المستخدم
4. وقت اليوم وأنماط الاستخدام
5. سياق المحتوى المحيط (المنشورات المشابهة قريبة)

قواعد:
- الموضع يبدأ من 0 (أول منشور)
- لا تضع إعلانين مروجين متجاورين
- أول إعلان مروج يظهر بعد الموضع 1 على الأقل
- إعلانات VIP تظهر في مواضع أكثر بروزاً
- إعلانات الأهمية المتطابقة تظهر أولاً
- الوزن بين المنشورات العادية والمروجة يجب أن يكون متوازناً

أجب بـ JSON فقط بالشكل التالي:
{
  "positions": [{"postIndex": 0, "feedPosition": 2, "reason": "السبب"}],
  "strategy": "وصف الاستراتيجية",
  "peakPositions": [2, 5, 8],
  "avoidPositions": [0, 1],
  "reasoning": "شرح عام بالعربي",
  "confidence": 0.85
}`
            },
            {
              role: 'user',
              content: `حدد مواضع الإعلانات المروجة:
عدد الإعلانات المروجة: ${promotedCount}
عدد المنشورات العادية: ${Math.max(regularCount, 0)}
نوع الصفحة: ${feedType === 'market' ? 'السوق الذكي' : feedType === 'matches' ? 'متوافق معي' : 'الرئيسية'}
وقت اليوم: ${timeContext}
اهتمامات المستخدم: ${interestsKey || 'عام'}

الإعلانات المروجة:
${promotedSummary}

أداء المواضع السابقة:
${engagementSummary || 'لا توجد بيانات سابقة - استخدم التوزيع المتوازن'}`
            }
          ],
          temperature: 0.5,
          max_tokens: 800,
        });

        const content = completion.choices?.[0]?.message?.content || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          aiResult = JSON.parse(jsonMatch[0]);
        }
      }
    } catch (aiError: any) {
      console.error('[AI] Smart placement AI error:', aiError.message);
    }

    // ─── Step 5: Build result with AI or rule-based fallback ────────
    let result: any;

    if (aiResult && Array.isArray(aiResult.positions) && aiResult.positions.length > 0) {
      result = {
        positions: aiResult.positions,
        strategy: aiResult.strategy || 'AI استراتيجية ذكية',
        peakPositions: aiResult.peakPositions || [2, 5, 8],
        avoidPositions: aiResult.avoidPositions || [0, 1],
        reasoning: aiResult.reasoning || 'تحليل ذكي بناءً على بيانات التفاعل والاهتمامات',
        confidence: aiResult.confidence || 0.7,
      };
    } else {
      // ─── Rule-based fallback (intelligent positioning) ────────────
      const positions: { postIndex: number; feedPosition: number; reason: string }[] = [];
      const tierOrder: Record<string, number> = { vip: 4, premium: 3, interest_target: 3, standard: 2, city_target: 2, basic: 1 };

      // Sort promoted posts by priority
      const sortedPromoted = promotedPosts
        .map((p: any, i: number) => ({
          index: i,
          tier: p.promotionTier || p.promotion_tier || 'basic',
          interests: p.targetInterests || p.target_interests || [],
          category: p.category || '',
        }))
        .sort((a: any, b: any) => (tierOrder[b.tier] || 0) - (tierOrder[a.tier] || 0));

      // Determine base frequency based on promoted/regular ratio
      let baseFrequency = Math.max(2, Math.floor(regularCount / (promotedCount || 1)));
      if (baseFrequency > 6) baseFrequency = 6;
      if (baseFrequency < 2) baseFrequency = 2;

      // Use engagement data to find best positions if available
      const bestPositions: number[] = [];
      const worstPositions: number[] = [];
      if (Object.keys(positionStats).length > 0) {
        const sortedPositions = Object.entries(positionStats)
          .map(([pos, stats]) => ({
            position: parseInt(pos),
            ctr: stats.impressions > 0 ? stats.clicks / stats.impressions : 0,
          }))
          .sort((a, b) => b.ctr - a.ctr);
        bestPositions.push(...sortedPositions.slice(0, 5).map(p => p.position));
        worstPositions.push(...sortedPositions.slice(-3).map(p => p.position));
      }

      // Time-based optimization
      let positionOffset = 1;
      if (currentHour >= 17 && currentHour < 22) {
        // Evening peak: users scroll more, can place promoted earlier
        positionOffset = 1;
      } else if (currentHour >= 5 && currentHour < 12) {
        // Morning: users are focused, place promoted slightly later
        positionOffset = 2;
      } else if (currentHour >= 22 || currentHour < 5) {
        // Late night: fewer posts viewed, place promoted more frequently
        baseFrequency = Math.max(2, baseFrequency - 1);
        positionOffset = 1;
      }

      // Calculate positions
      let nextPosition = positionOffset;
      for (let i = 0; i < sortedPromoted.length; i++) {
        const promo = sortedPromoted[i];
        const tier = promo.tier;

        // Adjust frequency by tier
        let tierFrequency = baseFrequency;
        if (tier === 'vip') tierFrequency = Math.max(2, baseFrequency - 1);
        else if (tier === 'premium' || tier === 'interest_target') tierFrequency = baseFrequency;
        else if (tier === 'basic') tierFrequency = baseFrequency + 1;

        // Try to use best historical positions
        let finalPosition = nextPosition;
        if (bestPositions.length > 0) {
          const bestPos = bestPositions.find(p => p >= nextPosition && !positions.some(pp => pp.feedPosition === p));
          if (bestPos !== undefined) finalPosition = bestPos;
        }
        // Avoid worst positions
        if (worstPositions.includes(finalPosition)) {
          finalPosition = worstPositions.includes(finalPosition + 1) ? finalPosition + 2 : finalPosition + 1;
        }

        positions.push({
          postIndex: promo.index,
          feedPosition: finalPosition,
          reason: `${tier === 'vip' ? 'موضع متميز لباقة VIP' : tier === 'premium' ? 'موضع مميز' : 'توزيع متوازن'}`,
        });

        nextPosition = finalPosition + tierFrequency;
      }

      result = {
        positions,
        strategy: 'توزيع ذكي مبني على القواعد والبيانات',
        peakPositions: bestPositions.length > 0 ? bestPositions : [2, 5, 8],
        avoidPositions: worstPositions.length > 0 ? worstPositions : [0, 1],
        reasoning: `توزيع ذكي: ${promotedCount} إعلان مروج بين ${regularCount} منشور عادي. فترة ${timeContext.split(' - ')[0]}. تكرار كل ${baseFrequency} منشورات.`,
        confidence: 0.6,
      };
    }

    // ─── Step 6: Cache the result ───────────────────────────────────
    try {
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // Cache for 30 minutes
      db.prepare(`
        INSERT OR REPLACE INTO ai_placement_cache (cache_key, strategy, feed_type, user_id, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(cacheKey, JSON.stringify(result), feedType || 'home', userId || null, expiresAt);
    } catch { /* ignore cache write errors */ }

    res.json({ success: true, ...result, fromCache: false });
  } catch (error: any) {
    console.error('[AI] Smart placement error:', error.message);

    // Ultimate fallback: simple rule-based positioning
    const { promotedPosts, totalPosts } = req.body;
    const promotedCount = Array.isArray(promotedPosts) ? promotedPosts.length : 0;
    const regularCount = (totalPosts || 20) - promotedCount;
    const frequency = Math.max(2, Math.floor(regularCount / (promotedCount || 1)));
    const positions = promotedPosts.map((_: any, i: number) => ({
      postIndex: i,
      feedPosition: 1 + i * frequency,
      reason: 'توزيع متساوٍ',
    }));

    res.json({
      success: true,
      positions,
      strategy: 'توزيع بسيط متساوٍ',
      peakPositions: [2, 5, 8],
      avoidPositions: [0, 1],
      reasoning: 'توزيع أساسي - الذكاء الاصطناعي غير متاح',
      confidence: 0.3,
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// 8. AI تتبع تفاعل المستخدم مع المنشورات المروجة - Engagement Tracking
// يسجل موضع المنشور والتفاعل معه لتحسين المواضع المستقبلية
// ═══════════════════════════════════════════════════════════════════════
router.post('/track-engagement', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId || null;
    if (!userId) return res.status(401).json({ error: 'يجب تسجيل الدخول' });

    const { events } = req.body;
    if (!Array.isArray(events) || events.length > 100) { res.status(400).json({ error: 'حد أقصى 100 حدث لكل طلب' }); return; }
    if (!Array.isArray(events) || events.length === 0) {
      return res.json({ tracked: 0 });
    }

    const db = database;
    const sessionId = req.headers['x-session-id'] as string || '';

    let trackedCount = 0;
    const insertStmt = db.prepare(`
      INSERT INTO promotion_engagement (post_id, user_id, feed_position, feed_type, action, time_on_screen, scroll_depth, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const event of events) {
      try {
        if (!event.postId || !event.action) continue;
        insertStmt.run(
          event.postId,
          userId,
          event.feedPosition || 0,
          event.feedType || 'home',
          event.action, // 'impression', 'click', 'view', 'scroll_past'
          event.timeOnScreen || 0,
          event.scrollDepth || 0,
          sessionId,
        );
        trackedCount++;
      } catch { /* ignore individual tracking errors */ }
    }

    // Update AI placement cache expiry if there's significant new data
    if (trackedCount > 5) {
      try {
        // Expire placement caches so they get regenerated with new data
        db.prepare("UPDATE ai_placement_cache SET expires_at = datetime('now') WHERE feed_type IN ('home', 'market')").run();
      } catch { /* ignore */ }
    }

    res.json({ tracked: trackedCount });
  } catch (error: any) {
    console.error('[AI] Engagement tracking error:', error.message);
    res.json({ tracked: 0 });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// 9. AI تحليلات المواضع - Placement Analytics
// يعرض أداء المواضع المختلفة للمنشورات المروجة
// ═══════════════════════════════════════════════════════════════════════
router.get('/placement-analytics', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ error: 'يجب تسجيل الدخول' });

    const db = database;
    const { feedType, days } = req.query;
    const feed = feedType || 'home';
    const daysBack = parseInt(days as string) || 7;

    // Position performance
    const positionPerformance = db.prepare(`
      SELECT
        feed_position,
        COUNT(CASE WHEN action = 'impression' THEN 1 END) as impressions,
        COUNT(CASE WHEN action = 'click' THEN 1 END) as clicks,
        COUNT(CASE WHEN action = 'view' THEN 1 END) as views,
        AVG(CASE WHEN action = 'impression' THEN time_on_screen END) as avg_time_on_screen,
        AVG(CASE WHEN action = 'impression' THEN scroll_depth END) as avg_scroll_depth
      FROM promotion_engagement
      WHERE feed_type = ? AND created_at >= datetime('now', '-' || ? || ' days')
      GROUP BY feed_position
      ORDER BY feed_position
    `).all(feed, daysBack) as any[];

    // Calculate CTR per position
    const analyzedPositions = positionPerformance.map(p => ({
      ...p,
      ctr: p.impressions > 0 ? ((p.clicks / p.impressions) * 100).toFixed(2) : '0',
      engagementScore: p.impressions > 0
        ? Math.round((p.clicks * 3 + p.views * 1 + p.avg_time_on_screen * 0.5) / p.impressions * 100) / 100
        : 0,
    }));

    // Find best and worst positions
    const bestPosition = analyzedPositions.length > 0
      ? analyzedPositions.reduce((best: any, p: any) => parseFloat(p.ctr) > parseFloat(best.ctr) ? p : best)
      : null;
    const worstPosition = analyzedPositions.length > 0
      ? analyzedPositions.reduce((worst: any, p: any) => parseFloat(p.ctr) < parseFloat(worst.ctr) ? p : worst)
      : null;

    // Time-based performance
    const timePerformance = db.prepare(`
      SELECT
        CAST(strftime('%H', created_at) AS INTEGER) as hour,
        COUNT(CASE WHEN action = 'impression' THEN 1 END) as impressions,
        COUNT(CASE WHEN action = 'click' THEN 1 END) as clicks
      FROM promotion_engagement
      WHERE feed_type = ? AND created_at >= datetime('now', '-' || ? || ' days')
      GROUP BY hour
      ORDER BY hour
    `).all(feed, daysBack) as any[];

    // Feed type comparison
    const feedComparison = db.prepare(`
      SELECT
        feed_type,
        COUNT(CASE WHEN action = 'impression' THEN 1 END) as impressions,
        COUNT(CASE WHEN action = 'click' THEN 1 END) as clicks
      FROM promotion_engagement
      WHERE created_at >= datetime('now', '-' || ? || ' days')
      GROUP BY feed_type
    `).all(daysBack) as any[];

    // AI recommendations
    let aiRecommendations: string[] = [];
    try {
      const bestPos = bestPosition?.feed_position || 3;
      const worstPos = worstPosition?.feed_position || 0;
      const bestHour = timePerformance.length > 0
        ? timePerformance.reduce((best: any, h: any) =>
          h.impressions > 0 && (h.clicks / h.impressions) > (best.impressions > 0 ? best.clicks / best.impressions : 0) ? h : best
        ).hour
        : null;

      if (bestPos !== undefined) aiRecommendations.push(`أفضل موضع للإعلانات هو الموضع ${bestPos} - حقق أعلى معدل نقر`);
      if (worstPos !== undefined) aiRecommendations.push(`تجنّب الموضع ${worstPos} - أقل معدل تفاعل`);
      if (bestHour !== null) aiRecommendations.push(`أفضل ساعة للتفاعل هي ${bestHour}:00 - فكّر في زيادة الترويج في هذا الوقت`);
      if (analyzedPositions.length === 0) aiRecommendations.push('لا توجد بيانات كافية بعد - استمر في الترويج لجمع البيانات');
    } catch { /* ignore */ }

    res.json({
      success: true,
      data: {
        positionPerformance: analyzedPositions,
        bestPosition,
        worstPosition,
        timePerformance,
        feedComparison,
        aiRecommendations,
        totalEvents: analyzedPositions.reduce((sum: number, p: any) => sum + p.impressions + p.clicks + p.views, 0),
      },
    });
  } catch (error: any) {
    console.error('[AI] Placement analytics error:', error.message);
    res.status(500).json({ error: 'حدث خطأ في تحليلات المواضع' });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// 8. AI تحليل شامل لمنشورات المستخدم - Analyze My Posts
// يقرأ كل منشورات المستخدم ويقترح أفضلها للترويج
// ═══════════════════════════════════════════════════════════════════════
router.post('/analyze-my-posts', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ error: 'يجب تسجيل الدخول' });

    const db = database;

    // Fetch ALL user's posts
    const userPosts = db.prepare(
      'SELECT id, content, category, price, location, type, image, likes, comments, shares, is_promoted, promotion_status, promotion_tier, created_at FROM posts WHERE author_id = ? ORDER BY created_at DESC'
    ).all(userId) as any[];

    // Fetch user info
    const user = getUserById(userId);
    const walletBalance = user?.wallet_balance || 0;
    const userInterests = user?.interests || '';
    const userLocation = user?.location || '';

    const totalPosts = userPosts.length;
    const promotedPosts = userPosts.filter((p: any) => p.is_promoted === 1).length;
    const unpromotedPosts = totalPosts - promotedPosts;

    if (totalPosts === 0) {
      return res.json({
        success: true,
        data: {
          totalPosts: 0,
          promotedPosts: 0,
          unpromotedPosts: 0,
          posts: [],
          topPick: null,
          overallStrategy: 'ليس لديك منشورات بعد. أنشئ منشور أولاً ثم عد لتحليلها!',
          budgetRecommendation: { totalNeeded: 0, suggestedPackages: [] },
          aiTips: ['أنشئ إعلان بتصنيف واضح وصورة عالية الجودة', 'حدد السعر والموقع في الإعلان', 'بعد الإنشاء، استخدم تحليل منشوراتي لمعرفة أفضلها للترويج'],
        },
      });
    }

    // Build posts summary for AI
    const postsSummary = userPosts.map((p: any, i: number) => {
      const daysAgo = Math.floor((Date.now() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24));
      return `${i + 1}. [${p.is_promoted ? 'مروّج' : 'غير مروّج'}] "${p.content?.slice(0, 150) || ''}" | تصنيف: ${p.category || 'عام'} | سعر: ${p.price || 'غير محدد'} ج.م | موقع: ${p.location || 'غير محدد'} | إعجابات: ${p.likes || 0} | تعليقات: ${p.comments || 0} | مشاركات: ${p.shares || 0} | ${p.image ? '📸 لديه صورة' : '❌ بدون صورة'} | قبل ${daysAgo} يوم${p.is_promoted ? ` | باقة: ${p.promotion_tier || 'غير محدد'}` : ''}`;
    }).join('\n');

    // Try AI analysis
    let aiResult: any = null;
    try {
      const zai = await getAI();
      if (!zai) {
        // AI unavailable - aiResult stays null, rule-based fallback will be used
      } else {
        const completion = await zai.chat.completions.create({
          messages: [
            {
              role: 'system',
              content: `أنت خبير تسويق وترويج على منصة إعلانات ذكية في مصر اسمها "نواقص".
مهمتك تحليل كل منشورات المستخدم وتقديم توصيات شاملة للترويج.

باقات الترويج المتاحة:
- أساسي (50 ج.م): 900 وصول، 3 أيام، 30 إشعار
- قياسي (120 ج.م): 3,000 وصول، 5 أيام، 100 إشعار
- مميز (250 ج.م): 8,000 وصول، 7 أيام، 250 إشعار (الأكثر طلباً)
- VIP (500 ج.م): 25,000 وصول، 10 أيام، 600 إشعار
- استهداف مدن (من 120 ج.م): اختيار 1-27 مدينة مصرية
- استهداف اهتمامات (200 ج.م): 7,000 وصول، 5 أيام، 200 إشعار

مهم: عندما تذكر اسم باقة في النص، استخدم الاسم العربي دائماً (أساسي، قياسي، مميز، VIP، استهداف مدن، استهداف اهتمامات) ولا تستخدم الاسم الإنجليزي أبداً.

الاهتمامات المتاحة: phones, electronics, games, cars, realEstate, fashion, beauty, sports, food, jobs, services, education, books, animals, travel, photography, health, other

المدن المصرية: القاهرة، الجيزة، الإسكندرية، المنصورة، طنطا، الزقازيق، بورسعيد، السويس، الإسماعيلية، الفيوم، أسيوط، المنيا، سوهاج، قنا، الأقصر، أسوان، دمياط، كفر الشيخ، بنها، شبين الكوم، مرسى مطروح، الغردقة، شرم الشيخ

حلل كل منشور وقيّم إمكانية الترويج. أجب بـ JSON فقط بالشكل التالي:
{
  "posts": [
    {
      "promotionScore": 85,
      "promotionPotential": "high|medium|low",
      "suggestedPackage": "premium|standard|basic|vip|city_target|interest_target",
      "suggestedInterests": ["interest1", "interest2"],
      "suggestedCities": ["مدينة1", "مدينة2"],
      "contentTips": ["نصيحة1", "نصيحة2"]
    }
  ],
  "topPickIndex": 0,
  "topPickReason": "سبب اختيار هذا المنشور كأفضل خيار",
  "overallStrategy": "استراتيجية شاملة بالعربي",
  "budgetRecommendation": {
    "totalNeeded": 500,
    "suggestedPackages": [
      {"priority": 1, "postId": "id", "package": "premium", "price": 350, "reason": "السبب"},
      {"priority": 2, "postId": "id", "package": "standard", "price": 150, "reason": "السبب"}
    ]
  },
  "aiTips": ["نصيحة1", "نصيحة2", "نصيحة3"]
}`
            },
            {
              role: 'user',
              content: `حلل منشوراتي واقترح أفضلها للترويج:

معلومات المستخدم:
- رصيد المحفظة: ${walletBalance} ج.م
- الاهتمامات: ${userInterests || 'غير محدد'}
- الموقع: ${userLocation || 'غير محدد'}
- إجمالي المنشورات: ${totalPosts}
- مروّجة: ${promotedPosts} | غير مروّجة: ${unpromotedPosts}

المنشورات:
${postsSummary}`
            }
          ],
          temperature: 0.7,
          max_tokens: 2000,
        });

        const content = completion.choices?.[0]?.message?.content || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          aiResult = JSON.parse(jsonMatch[0]);
        }
      }
    } catch (aiError: any) {
      console.error('[AI] Analyze my posts AI error:', aiError.message);
    }

    // Build response with AI or rule-based fallback
    const categoryToInterests: Record<string, string[]> = {
      phones: ['phones', 'electronics'],
      electronics: ['electronics', 'phones'],
      cars: ['cars'],
      realEstate: ['realEstate'],
      games: ['games', 'electronics'],
      fashion: ['fashion', 'beauty'],
      beauty: ['beauty', 'fashion'],
      sports: ['sports'],
      food: ['food'],
      jobs: ['jobs', 'education'],
      services: ['services', 'jobs'],
      education: ['education', 'books'],
      books: ['books', 'education'],
      animals: ['animals'],
      travel: ['travel', 'photography'],
      photography: ['photography', 'travel'],
      health: ['health', 'beauty'],
    };

    const postsAnalysis = userPosts.map((p: any, i: number) => {
      const daysAgo = Math.floor((Date.now() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24));
      const aiPost = aiResult?.posts?.[i] || null;

      // Rule-based scoring fallback
      let score = 50;
      if (p.image) score += 15;
      if (p.price && p.price > 0) score += 10;
      if (p.category) score += 5;
      if (p.content && p.content.length > 50) score += 5;
      if (p.likes > 5) score += 5;
      if (p.comments > 2) score += 5;
      if (daysAgo <= 3) score += 5;
      if (p.is_promoted) score -= 20; // already promoted, less need
      if (!p.image) score -= 10;
      if (!p.price) score -= 5;
      score = Math.max(0, Math.min(100, score));

      const cat = p.category || 'other';
      const suggestedInterests = aiPost?.suggestedInterests || categoryToInterests[cat] || ['other'];
      const suggestedCities = aiPost?.suggestedCities || [p.location || userLocation || 'القاهرة'];
      let suggestedPackageId = aiPost?.suggestedPackage || 'standard';
      // Normalize: if AI returns Arabic name, try to map back to English ID
      const arToEngMap: Record<string, string> = { 'أساسي': 'basic', 'قياسي': 'standard', 'مميز': 'premium', 'VIP': 'vip', 'استهداف مدن': 'city_target', 'استهداف اهتمامات': 'interest_target' };
      if (arToEngMap[suggestedPackageId]) suggestedPackageId = arToEngMap[suggestedPackageId];
      if (p.price && p.price > 10000 && !aiPost) suggestedPackageId = 'premium';
      const suggestedPackageAr = arPkg(suggestedPackageId);

      return {
        postId: p.id,
        contentPreview: (p.content || '').slice(0, 80),
        category: p.category || 'عام',
        price: p.price || 0,
        promotionScore: aiPost?.promotionScore || score,
        promotionPotential: aiPost?.promotionPotential || (score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low'),
        suggestedPackage: suggestedPackageAr,
        suggestedPackageId,
        suggestedInterests,
        suggestedCities,
        contentTips: aiPost?.contentTips || [
          ...(p.image ? [] : ['أضف صورة عالية الجودة - تزيد التفاعل 40%']),
          ...(p.price ? [] : ['حدد السعر بوضوح لجذب المشترين الجادين']),
          ...(p.content?.length > 30 ? [] : ['أضف تفاصيل أكثر عن المنتج']),
          'اذكر حالة المنتج وطريقة التواصل',
        ],
        hasImage: !!p.image,
        likes: p.likes || 0,
        isPromoted: !!p.is_promoted,
        daysAgo,
      };
    });

    // Sort by promotion score to find top pick
    const sortedByScore = [...postsAnalysis].filter(p => !p.isPromoted).sort((a, b) => b.promotionScore - a.promotionScore);
    const topPickPost = sortedByScore[0] || postsAnalysis[0];

    const topPick = {
      postId: topPickPost.postId,
      reason: replacePkgNamesInText(aiResult?.topPickReason || `هذا المنشور حصل على أعلى نقاط ترويج (${topPickPost.promotionScore}/100) - ${topPickPost.hasImage ? 'لديه صورة' : 'ينصح بإضافة صورة'}، تصنيف "${topPickPost.category}"، والباقة المقترحة "${topPickPost.suggestedPackage}"`),
    };

    const overallStrategy = replacePkgNamesInText(aiResult?.overallStrategy || 
      (unpromotedPosts > 0
        ? `لديك ${unpromotedPosts} منشور غير مروّج. ننصح بالبدء بمنشور "${topPickPost.contentPreview.slice(0, 30)}..." وباقة ${topPickPost.suggestedPackage}. ركز على المنشورات ذات الصور والأسعار الواضحة أولاً.`
        : 'جميع منشوراتك مروّجة! راقب أداءها وجرّب باقات أعلى للمنشورات الأكثر تفاعلاً.'));

    // Calculate budget recommendation
    const unpromotedHighPotential = postsAnalysis.filter(p => !p.isPromoted && p.promotionScore >= 60).sort((a, b) => b.promotionScore - a.promotionScore);
    const pkgPrices: Record<string, number> = { basic: 50, standard: 120, premium: 250, vip: 500, city_target: 120, interest_target: 200 };
    const suggestedPackages = (aiResult?.budgetRecommendation?.suggestedPackages
      ? aiResult.budgetRecommendation.suggestedPackages.map((sp: any) => ({
          ...sp,
          package: arPkg(sp.package),
          reason: replacePkgNamesInText(sp.reason || ''),
        }))
      : unpromotedHighPotential.slice(0, 3).map((p, i) => ({
        priority: i + 1,
        postId: p.postId,
        package: p.suggestedPackage || 'قياسي',
        price: pkgPrices[p.suggestedPackageId] || 120,
        reason: `منشور بنقاط ${p.promotionScore}/100 - ${p.hasImage ? 'لديه صورة' : 'يحتاج صورة'}`,
      }))
    );
    const totalNeeded = aiResult?.budgetRecommendation?.totalNeeded || suggestedPackages.reduce((sum: number, p: any) => sum + (p.price || 0), 0);

    const aiTips = (aiResult?.aiTips || [
      'أضف صور عالية الجودة لكل إعلان - تزيد التفاعل بنسبة 40%',
      'حدد السعر والموقع دائماً - إعلانات واضحة تحقق نتائج أفضل',
      'ابدأ بباقة قياسي أو مميز - توازن جيد بين التكلفة والوصول',
    ]).map((tip: string) => replacePkgNamesInText(tip));

    res.json({
      success: true,
      data: {
        totalPosts,
        promotedPosts,
        unpromotedPosts,
        posts: postsAnalysis,
        topPick,
        overallStrategy,
        budgetRecommendation: {
          totalNeeded,
          suggestedPackages,
        },
        aiTips,
      },
    });
  } catch (error: any) {
    console.error('[AI] Analyze my posts error:', error.message);
    res.status(500).json({ error: 'حدث خطأ في تحليل المنشورات' });
  }
});

export default router;
