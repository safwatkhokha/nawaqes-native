// ─── AI Promotion Assistant ─ مساعد الترويج الذكي ──────────────────
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../contexts/LanguageContext';
import { api } from '../services/api';
import {
  Sparkles,
  X,
  Send,
  Bot,
  User,
  Target,
  TrendingUp,
  Wallet,
  Lightbulb,
  Zap,
  BarChart3,
  ChevronDown,
  Loader2,
  Megaphone,
  MessageSquare,
  Brain,
  Crown,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Eye,
  ChevronLeft,
  ChevronRight,
  PieChart,
  Activity,
  FileText,
  DollarSign,
  Users,
  MapPin,
  Hash,
  Star,
  Info,
  Maximize2,
  RefreshCw,
  ThumbsUp,
  Clock,
  Flame,
  Trash2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from '../lib/silentToast';

interface AIPromotionAssistantProps {
  postId?: string;
  postContent?: string;
  postCategory?: string;
  postPrice?: number;
  mode?: 'chat' | 'targeting' | 'budget' | 'insights' | 'enhance';
  onClose?: () => void;
  onSuggestionApplied?: (data: any) => void;
  fullPage?: boolean;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  type?: 'text' | 'targeting' | 'budget' | 'insights' | 'enhance';
  data?: any;
}

// ─── Stat Card Component ───────────────────────────────────────────────
const StatCard: React.FC<{
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
  darkMode: boolean;
  delay?: number;
}> = ({ icon: Icon, label, value, color, darkMode, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    className={`rounded-2xl p-3 relative overflow-hidden ${
      darkMode ? `bg-gradient-to-br ${color}/20 border ${color.replace('from-', 'border-').split(' ')[0]}/20` : `bg-gradient-to-br ${color}/10 border ${color.replace('from-', 'border-').split(' ')[0]}/10`
    } border`}
  >
    <div className="flex items-center gap-2">
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${darkMode ? `${color.replace('from-', 'bg-').split(' ')[0]}/30` : `${color.replace('from-', 'bg-').split(' ')[0]}/20`}`}>
        <Icon className={`w-4 h-4 ${darkMode ? color.replace('from-', 'text-').split(' ')[0].replace('from-', '') : color.replace('from-', 'text-').split(' ')[0].replace('from-', '')}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-[10px] font-bold truncate ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{label}</p>
        <p className={`text-sm font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{value}</p>
      </div>
    </div>
  </motion.div>
);

// ─── Follow-up Suggestions Generator ─────────────────────────────────
function getFollowUpSuggestions(lastReply: string): string[] {
  const text = lastReply.toLowerCase();

  // If the reply mentioned prices/packages
  if (text.includes('ج.م') || text.includes('باقة') || text.includes('سعر')) {
    return [
      'ما هي أفضل باقة لي؟',
      'كيف أشحن محفظتي؟',
      'نصائح لزيادة الوصول',
    ];
  }

  // If the reply mentioned how to promote
  if (text.includes('ترويج') && (text.includes('خطوة') || text.includes('1') || text.includes('اختر'))) {
    return [
      'كم تكلفة الترويج؟',
      'كيف أحسن إعلاني؟',
      'ما هو الوصول؟',
    ];
  }

  // If the reply mentioned tips/improvements
  if (text.includes('نصائح') || text.includes('تحسين') || text.includes('صورة')) {
    return [
      'اقترح باقة مناسبة',
      'كم سعر الباقات؟',
      'كيف أبدأ الترويج؟',
    ];
  }

  // If the reply mentioned wallet/balance
  if (text.includes('محفظة') || text.includes('شحن') || text.includes('رصيد')) {
    return [
      'كم سعر الباقات؟',
      'اقترح باقة مناسبة',
      'كيف أبدأ الترويج؟',
    ];
  }

  // If the reply mentioned VIP
  if (text.includes('vip') || text.includes('في اي بي')) {
    return [
      'كم سعر باقة VIP؟',
      'ما الفرق بين الباقات؟',
      'كيف أشحن محفظتي؟',
    ];
  }

  // Default suggestions
  return [
    'ما هي أفضل باقة لي؟',
    'كم تكلفة الترويج؟',
    'كيف أحسن إعلاني؟',
  ];
}

// ─── Main AI Promotion Assistant Component ───────────────────────────────
export const AIPromotionAssistant: React.FC<AIPromotionAssistantProps> = ({
  postId,
  postContent,
  postCategory,
  postPrice,
  mode: initialMode = 'chat',
  onClose,
  onSuggestionApplied,
  fullPage = false,
}) => {
  const { darkMode } = useAppContext();
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const { dir } = useLanguage();

  const [isOpen, setIsOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    // Load saved chat history from localStorage
    try {
      const saved = localStorage.getItem('nawaqes_ai_chat_history');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Filter out any messages older than 24 hours (avoid stale data)
          const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
          return parsed.filter((m: ChatMessage) => {
            const msgTime = new Date(m.timestamp).getTime();
            return !isNaN(msgTime) && msgTime > oneDayAgo;
          });
        }
      }
    } catch {}
    return [];
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeMode, setActiveMode] = useState(initialMode);
  const [activeTab, setActiveTab] = useState<'chat' | 'dashboard'>('dashboard');
  const [aiInsights, setAiInsights] = useState<any>(null);
  const [aiTargeting, setAiTargeting] = useState<any>(null);
  const [aiBudget, setAiBudget] = useState<any>(null);
  const [enhancedContent, setEnhancedContent] = useState<any>(null);
  const [aiReview, setAiReview] = useState<any>(null);
  const [statsData, setStatsData] = useState<any>(null);
  const [isExpanded, setIsExpanded] = useState(fullPage);

  // NEW: Performance prediction + budget optimizer state
  const [performancePrediction, setPerformancePrediction] = useState<any>(null);
  const [budgetOptimizerInput, setBudgetOptimizerInput] = useState('');
  const [budgetOptimizerResult, setBudgetOptimizerResult] = useState<any>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Save chat history to localStorage whenever messages change (excluding greeting)
  useEffect(() => {
    try {
      const toSave = messages.filter(m => m.id !== 'greeting').slice(-30);
      if (toSave.length > 0) {
        localStorage.setItem('nawaqes_ai_chat_history', JSON.stringify(toSave));
      } else {
        localStorage.removeItem('nawaqes_ai_chat_history');
      }
    } catch {}
  }, [messages]);

  // Load stats on mount
  useEffect(() => {
    loadStats();
  }, []);

  // Initial greeting
  useEffect(() => {
    if (messages.length === 0 && activeTab === 'chat') {
      const greeting: ChatMessage = {
        id: 'greeting',
        role: 'assistant',
        content: t('aiPromotion.greeting'),
        timestamp: new Date(),
        type: 'text',
      };
      setMessages([greeting]);
    }
  }, [activeTab]);

  // Load insights on mount if mode is insights
  useEffect(() => {
    if (activeMode === 'insights' && !aiInsights) {
      loadInsights();
    }
  }, [activeMode]);

  const loadStats = useCallback(async () => {
    try {
      const result = await api.aiInsights();
      const data = result.data || result;
      setStatsData(data);
    } catch {
      // Fallback stats
      setStatsData({
        summary: { totalSpent: 0, totalReach: 0, totalClicks: 0, activePromotions: 0, avgCTR: '0', totalPosts: 0, promotedPosts: 0, unpromotedPosts: 0, walletBalance: currentUser?.walletBalance || 0 }
      });
    }
  }, []);

  const addMessage = (role: 'user' | 'assistant', content: string, type?: string, data?: any) => {
    const msg: ChatMessage = {
      id: Date.now().toString() + Math.random(),
      role,
      content,
      timestamp: new Date(),
      type: type as any,
      data,
    };
    setMessages(prev => [...prev, msg]);
    return msg;
  };

  // ─── Send Chat Message ────────────────────────────────────────────
  const handleSendChat = async () => {
    if (!input.trim() || isLoading) return;
    const userMsg = input.trim();
    setInput('');
    addMessage('user', userMsg);

    setIsLoading(true);
    try {
      // Build conversation history (last 10 messages, exclude greeting and current)
      const history = messages
        .filter(m => m.id !== 'greeting')
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content }));

      const result = await api.aiAssistant(userMsg, currentUser?.id, history);
      const reply = result.reply || t('aiPromotion.errorGeneric');

      // Add the assistant's reply, marking if it's a fallback
      const msg = addMessage('assistant', reply);
      if (result.fallback) {
        console.log('[AI] Using fallback response');
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _ = msg; // mark used
    } catch (err: any) {
      console.error('[AI] Chat error:', err?.message);
      addMessage('assistant', t('aiPromotion.errorGeneric'));
    }
    setIsLoading(false);
  };

  // ─── Send Quick Question (no input field needed) ────────────────
  const handleQuickQuestion = (question: string) => {
    if (isLoading) return;
    setInput(question);
    // Slight delay to allow UI to update
    setTimeout(() => {
      handleSendChat();
    }, 50);
  };

  // ─── Clear Chat History ─────────────────────────────────────────
  const clearChat = () => {
    setMessages([]);
    try {
      localStorage.removeItem('nawaqes_ai_chat_history');
    } catch {}
    // Re-add greeting if in chat tab
    if (activeTab === 'chat') {
      const greeting: ChatMessage = {
        id: 'greeting',
        role: 'assistant',
        content: t('aiPromotion.greeting'),
        timestamp: new Date(),
        type: 'text',
      };
      setMessages([greeting]);
    }
    toast.success(t('aiPromotion.chatCleared', 'تم مسح المحادثة'));
  };

  // ─── Load AI Auto-Targeting ───────────────────────────────────────
  const loadAutoTargeting = async () => {
    setIsLoading(true);
    try {
      const result = await api.aiAutoTarget({
        postId,
        content: postContent,
        category: postCategory,
        price: postPrice,
      });
      setAiTargeting(result.data);
      const pkgMap: Record<string, string> = {basic:t('aiPromotion.tierBasic'),standard:t('aiPromotion.tierStandard'),premium:t('aiPromotion.tierPremium'),vip:'VIP',city_target:t('aiPromotion.cityTargeting'),interest_target:t('aiPromotion.interestTargeting')};
      addMessage('assistant', t('aiPromotion.smartTargetingSuggested', {
        interests: result.data.suggestedInterests?.join(', ') || t('aiPromotion.general'),
        cities: result.data.suggestedCities?.join(', ') || t('aiPromotion.cairo'),
        ageMin: result.data.suggestedAgeRange?.min || 18,
        ageMax: result.data.suggestedAgeRange?.max || 45,
        suggestedPackage: pkgMap[result.data.suggestedPackage] || result.data.suggestedPackage || t('aiPromotion.tierStandard'),
        confidence: Math.round((result.data.confidence || 0.5) * 100),
        reasoning: result.data.reasoning || '',
      }),
        'targeting', result.data
      );
    } catch {
      addMessage('assistant', t('aiPromotion.errorTargeting'));
    }
    setIsLoading(false);
  };

  // ─── Load Budget Suggestion ───────────────────────────────────────
  const loadBudgetSuggestion = async () => {
    setIsLoading(true);
    try {
      const result = await api.aiBudgetSuggestion({
        budget: currentUser?.walletBalance || 0,
        category: postCategory,
        price: postPrice,
        goal: t('aiPromotion.increaseReach'),
      });
      setAiBudget(result.data);
      const rec = result.data.recommended;
      addMessage('assistant',
        t('aiPromotion.budgetSuggestion', {
          walletBalance: result.data.walletBalance,
          hasRecommendation: !!rec,
          recName: rec?.name || '',
          recPrice: rec?.price || 0,
          recReach: rec?.reach?.toLocaleString() || '0',
          recDays: rec?.days || 0,
          reasoning: result.data.reasoning,
          aiInsight: result.data.aiInsight || '',
        }),
        'budget', result.data
      );
    } catch {
      addMessage('assistant', t('aiPromotion.errorBudget'));
    }
    setIsLoading(false);
  };

  // ─── Load Insights ────────────────────────────────────────────────
  const loadInsights = async () => {
    setIsLoading(true);
    try {
      const result = await api.aiInsights();
      const data = result.data || result;
      setAiInsights(data);
      const s = data.summary || { totalSpent: 0, totalReach: 0, totalClicks: 0, activePromotions: 0, avgCTR: '0', totalPosts: 0, promotedPosts: 0, unpromotedPosts: 0, walletBalance: 0 };
      
      let insightsMsg = t('aiPromotion.smartInsightsHeader') + '\n\n';
      insightsMsg += t('aiPromotion.totalSpent', { value: s.totalSpent || 0 }) + '\n';
      insightsMsg += t('aiPromotion.totalReach', { value: (s.totalReach || 0).toLocaleString() }) + '\n';
      insightsMsg += t('aiPromotion.totalClicks', { value: s.totalClicks || 0 }) + '\n';
      insightsMsg += t('aiPromotion.clickRate', { value: s.avgCTR || 0 }) + '\n';
      insightsMsg += t('aiPromotion.activePromotionsCount', { value: s.activePromotions || 0 }) + '\n';
      
      if (s.totalPosts !== undefined) {
        insightsMsg += t('aiPromotion.totalPostsDetail', { total: s.totalPosts, promoted: s.promotedPosts, unpromoted: s.unpromotedPosts }) + '\n';
      }
      if (s.walletBalance !== undefined) {
        insightsMsg += t('aiPromotion.walletBalance', { value: s.walletBalance }) + '\n';
      }
      
      insightsMsg += `\n`;
      
      if (data.posts && data.posts.length > 0) {
        insightsMsg += t('aiPromotion.yourPostsHeader') + '\n';
        data.posts.slice(0, 5).forEach((p: any, i: number) => {
          const status = p.isPromoted ? `✅ ${t('aiPromotion.promoted')} - ${p.promotionTier || t('aiPromotion.package')}` : `⏳ ${t('aiPromotion.unpromoted')}`;
          insightsMsg += `${i + 1}. ${status} "${p.contentPreview}"\n`;
        });
        insightsMsg += `\n`;
      }
      
      insightsMsg += t('aiPromotion.aiRecommendationsHeader') + '\n';
      insightsMsg += (data.aiInsights || []).map((ins: string, i: number) => `${i + 1}. ${ins}`).join('\n');
      
      addMessage('assistant', insightsMsg, 'insights', data);
      // Also refresh stats
      setStatsData(data);
    } catch (err: any) {
      console.error('[AI] Load insights error:', err?.message);
      addMessage('assistant', t('aiPromotion.errorInsights'));
    }
    setIsLoading(false);
  };

  // ─── Enhance Content ──────────────────────────────────────────────
  const loadEnhancedContent = async () => {
    if (!postContent) {
      addMessage('assistant', t('aiPromotion.noContentToEnhance'));
      return;
    }
    setIsLoading(true);
    try {
      const result = await api.aiEnhanceContent({
        content: postContent,
        category: postCategory,
        price: postPrice,
      });
      setEnhancedContent(result.data);
      addMessage('assistant',
        t('aiPromotion.enhancedContent', {
          enhancedContent: result.data.enhancedContent,
          title: result.data.title || '',
          callToAction: result.data.callToAction || '',
          hashtags: result.data.hashtags?.length ? result.data.hashtags.map((h: string) => `#${h}`).join(' ') : '',
          scoreImprovement: result.data.scoreImprovement || 15,
          tips: (result.data.tips || []).map((tip: string, i: number) => `${i + 1}. ${tip}`).join('\n'),
        }),
        'enhance', result.data
      );
    } catch {
      addMessage('assistant', t('aiPromotion.errorEnhanceContent'));
    }
    setIsLoading(false);
  };

  // ─── AI Review ────────────────────────────────────────────────────
  const loadAIReview = async () => {
    setIsLoading(true);
    try {
      const result = await api.aiReviewPromotion({
        postId,
        content: postContent,
        category: postCategory,
        price: postPrice,
      });
      setAiReview(result.data);
      const d = result.data;
      addMessage('assistant',
        t('aiPromotion.aiReviewResult', {
          approved: d.approved,
          score: d.score,
          riskLevel: d.riskLevel,
          summary: d.summary,
          issues: d.issues?.length ? d.issues.map((i: string) => `❌ ${i}`).join('\n') : '',
          suggestions: d.suggestions?.length ? d.suggestions.map((s: string) => `💡 ${s}`).join('\n') : '',
        }),
        'text', result.data
      );
    } catch {
      addMessage('assistant', t('aiPromotion.errorReview'));
    }
    setIsLoading(false);
  };

  // ─── Load Analyze My Posts ──────────────────────────────────────
  const loadAnalyzeMyPosts = async () => {
    setIsLoading(true);
    try {
      const result = await api.aiAnalyzeMyPosts();
      const d = result.data;
      let analysisMsg = t('aiPromotion.comprehensiveAnalysisHeader') + '\n\n';
      analysisMsg += t('aiPromotion.totalPosts', { value: d.totalPosts }) + '\n';
      analysisMsg += t('aiPromotion.promotedCount', { value: d.promotedPosts }) + '\n';
      analysisMsg += t('aiPromotion.unpromotedCount', { value: d.unpromotedPosts }) + '\n\n';
      
      if (d.posts && d.posts.length > 0) {
        analysisMsg += t('aiPromotion.postDetailsHeader') + '\n\n';
        d.posts.forEach((p: any, i: number) => {
          const scoreEmoji = p.promotionScore >= 70 ? '🟢' : p.promotionScore >= 40 ? '🟡' : '🔴';
          analysisMsg += `${scoreEmoji} **${i+1}.** "${p.contentPreview}"\n`;
          const pkgMap: Record<string, string> = {basic:t('aiPromotion.tierBasic'),standard:t('aiPromotion.tierStandard'),premium:t('aiPromotion.tierPremium'),vip:'VIP',city_target:t('aiPromotion.cityTargeting'),interest_target:t('aiPromotion.interestTargeting')};
          analysisMsg += t('aiPromotion.promotionScoreAndPackage', { score: p.promotionScore, package: pkgMap[p.suggestedPackage] || p.suggestedPackage || t('aiPromotion.tierStandard') }) + '\n';
          if (p.contentTips?.length > 0) {
            analysisMsg += `   💡 ${p.contentTips[0]}\n`;
          }
          analysisMsg += `\n`;
        });
      }
      
      if (d.topPick) {
        analysisMsg += t('aiPromotion.bestPostForPromotion', { reason: d.topPick.reason }) + '\n\n';
      }
      
      if (d.overallStrategy) {
        analysisMsg += t('aiPromotion.strategyHeader', { strategy: d.overallStrategy }) + '\n\n';
      }
      
      if (d.aiTips?.length > 0) {
        analysisMsg += t('aiPromotion.aiTipsHeader') + '\n';
        d.aiTips.forEach((tip: string, i: number) => {
          analysisMsg += `${i+1}. ${tip}\n`;
        });
      }
      
      addMessage('assistant', analysisMsg, 'insights', d);
    } catch {
      addMessage('assistant', t('aiPromotion.errorAnalyzePosts'));
    }
    setIsLoading(false);
  };

  // ─── Performance Prediction (NEW) ────────────────────────────────
  const loadPerformancePrediction = async () => {
    setIsLoading(true);
    try {
      // Use budget suggestion as a proxy for performance prediction
      const result = await api.aiBudgetSuggestion({
        budget: currentUser?.walletBalance || 0,
        category: postCategory,
        price: postPrice,
        goal: t('aiPromotion.predictPerformance', 'توقع الأداء'),
      });
      setPerformancePrediction(result.data);
      const d = result.data;
      const rec = d.recommended;
      const predictedReach = rec?.reach || d.estimatedReach || (rec?.estimatedReach || 0);
      const predictedClicks = Math.round(predictedReach * 0.08); // ~8% CTR assumption
      const predictedEngagement = Math.round(predictedReach * 0.15);
      addMessage('assistant',
        t('aiPromotion.predictionResult', {
          predictedReach: predictedReach.toLocaleString(),
          predictedClicks: predictedClicks.toLocaleString(),
          predictedEngagement: predictedEngagement.toLocaleString(),
          recName: rec?.name || '',
          recPrice: rec?.price || 0,
          walletBalance: d.walletBalance || 0,
          reasoning: d.reasoning || '',
        }),
        'insights', result.data
      );
    } catch {
      addMessage('assistant', t('aiPromotion.errorPrediction', 'تعذر حساب توقع الأداء. حاول مرة أخرى لاحقاً.'));
    }
    setIsLoading(false);
  };

  // ─── Budget Optimizer (split across posts) (NEW) ────────────────
  const runBudgetOptimizer = async () => {
    const totalBudget = parseFloat(budgetOptimizerInput);
    if (!totalBudget || totalBudget <= 0) {
      toast.error(t('aiPromotion.enterValidBudget', 'أدخل ميزانية صحيحة'));
      return;
    }
    setIsOptimizing(true);
    try {
      // Get analysis of posts to find best candidates
      const analysis = await api.aiAnalyzeMyPosts();
      const posts = analysis.data?.posts || [];
      if (posts.length === 0) {
        toast.error(t('aiPromotion.noPostsForOptimization', 'لا توجد منشورات للتحسين'));
        setIsOptimizing(false);
        return;
      }
      // Sort by promotion score (highest first)
      const sorted = [...posts].sort((a, b) => (b.promotionScore || 0) - (a.promotionScore || 0));
      const topPosts = sorted.slice(0, 3);
      // Distribute budget: 50% to top, 30% to second, 20% to third
      const splits = topPosts.length === 1
        ? [{ post: topPosts[0], share: 1.0, amount: totalBudget }]
        : topPosts.length === 2
          ? [
              { post: topPosts[0], share: 0.65, amount: Math.round(totalBudget * 0.65) },
              { post: topPosts[1], share: 0.35, amount: Math.round(totalBudget * 0.35) },
            ]
          : [
              { post: topPosts[0], share: 0.5, amount: Math.round(totalBudget * 0.5) },
              { post: topPosts[1], share: 0.3, amount: Math.round(totalBudget * 0.3) },
              { post: topPosts[2], share: 0.2, amount: Math.round(totalBudget * 0.2) },
            ];
      const totalEstimatedReach = splits.reduce((s, sp) => s + Math.round(sp.amount * 25), 0); // ~25 reach per EGP
      const result = {
        totalBudget,
        splits,
        totalEstimatedReach,
        avgCostPerReach: totalBudget / totalEstimatedReach,
        strategy: t('aiPromotion.optimizationStrategy', 'استراتيجية موزعة: 50٪ للأفضل، 30٪ للثاني، 20٪ للثالث'),
        tips: analysis.data?.aiTips || [],
      };
      setBudgetOptimizerResult(result);
      let msg = `🎯 ${t('aiPromotion.budgetOptimized', 'تم تحسين الميزانية!')}\n\n`;
      msg += `${t('aiPromotion.totalBudget', 'إجمالي الميزانية')}: ${totalBudget.toLocaleString()} ${t('common.egp')}\n`;
      msg += `${t('aiPromotion.estimatedReach', 'الوصول المقدر')}: ${totalEstimatedReach.toLocaleString()}\n`;
      msg += `${t('aiPromotion.costPerReach', 'تكلفة الوصول')}: ${result.avgCostPerReach.toFixed(2)} ${t('common.egp')}\n\n`;
      msg += `${t('aiPromotion.distribution', 'التوزيع')}:\n`;
      splits.forEach((sp, i) => {
        msg += `${i + 1}. "${sp.post.contentPreview}" - ${sp.amount.toLocaleString()} ${t('common.egp')} (${Math.round(sp.share * 100)}٪)\n`;
      });
      addMessage('assistant', msg, 'budget', result);
    } catch {
      toast.error(t('aiPromotion.optimizationFailed', 'فشل التحسين'));
    }
    setIsOptimizing(false);
  };

  // Quick action buttons
  const quickActions = [
    { id: 'analyze-posts', label: t('aiPromotion.analyzePosts'), icon: Megaphone, action: loadAnalyzeMyPosts, color: 'from-rose-500 to-pink-500', desc: t('aiPromotion.analyzePostsDesc') },
    { id: 'targeting', label: t('aiPromotion.smartTargeting'), icon: Target, action: loadAutoTargeting, color: 'from-purple-500 to-indigo-500', desc: t('aiPromotion.smartTargetingDesc') },
    { id: 'budget', label: t('aiPromotion.suggestBudget'), icon: Wallet, action: loadBudgetSuggestion, color: 'from-green-500 to-emerald-500', desc: t('aiPromotion.suggestBudgetDesc') },
    { id: 'predict', label: t('aiPromotion.predictPerformance', 'توقع الأداء'), icon: TrendingUp, action: loadPerformancePrediction, color: 'from-cyan-500 to-blue-500', desc: t('aiPromotion.predictDesc', 'توقع الوصول والنقرات') },
    { id: 'insights', label: t('aiPromotion.myInsights'), icon: BarChart3, action: loadInsights, color: 'from-blue-500 to-cyan-500', desc: t('aiPromotion.myInsightsDesc') },
    { id: 'enhance', label: t('aiPromotion.enhanceContent'), icon: Sparkles, action: loadEnhancedContent, color: 'from-orange-500 to-amber-500', desc: t('aiPromotion.enhanceContentDesc') },
    { id: 'review', label: t('aiPromotion.reviewPost'), icon: CheckCircle2, action: loadAIReview, color: 'from-teal-500 to-green-500', desc: t('aiPromotion.reviewPostDesc') },
  ];

  // Dashboard stats
  const summary = statsData?.summary || { totalSpent: 0, totalReach: 0, totalClicks: 0, activePromotions: 0, avgCTR: '0', totalPosts: 0, promotedPosts: 0, unpromotedPosts: 0, walletBalance: 0 };
  const aiTips = statsData?.aiInsights || [];

  if (!isOpen) return null;

  // ─── DASHBOARD TAB CONTENT ────────────────────────────────────────
  const DashboardContent = () => (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      {/* Welcome Banner */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`rounded-2xl p-4 relative overflow-hidden ${
          darkMode
            ? 'bg-gradient-to-l from-orange-900/40 via-amber-900/20 to-orange-900/10 border border-orange-800/30'
            : 'bg-gradient-to-l from-orange-50 via-amber-50 to-orange-50 border border-orange-100'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-amber-500 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-200/30">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={`font-black text-xs ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {t('aiPromotion.title')}
            </h3>
            <p className={`text-[10px] ${darkMode ? 'text-orange-400/80' : 'text-orange-600/80'}`}>
              {t('aiPromotion.poweredByAI')}
            </p>
          </div>
          <button
            onClick={loadStats}
            className={`w-7 h-7 rounded-lg flex items-center justify-center ${
              darkMode ? 'bg-orange-900/50 text-orange-400 hover:bg-orange-900/70' : 'bg-orange-100 text-orange-600 hover:bg-orange-200'
            } transition-colors`}
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard icon={Wallet} label={t('aiPromotion.totalSpentLabel')} value={`${(summary.totalSpent || 0).toLocaleString()} ${t('common.egp')}`} color="from-orange-500 to-amber-500" darkMode={darkMode} delay={0.1} />
        <StatCard icon={Eye} label={t('aiPromotion.totalReachLabel')} value={(summary.totalReach || 0).toLocaleString()} color="from-blue-500 to-cyan-500" darkMode={darkMode} delay={0.15} />
        <StatCard icon={Zap} label={t('aiPromotion.activePromotionsLabel')} value={summary.activePromotions || 0} color="from-green-500 to-emerald-500" darkMode={darkMode} delay={0.2} />
        <StatCard icon={DollarSign} label={t('aiPromotion.walletBalanceLabel')} value={`${(summary.walletBalance || 0).toLocaleString()} ${t('common.egp')}`} color="from-purple-500 to-pink-500" darkMode={darkMode} delay={0.25} />
      </div>

      {/* Posts Overview */}
      {(summary.totalPosts > 0) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className={`rounded-2xl p-3 border ${darkMode ? 'bg-gray-800/50 border-gray-700' : 'bg-white border-gray-100'}`}
        >
          <div className="flex items-center gap-2 mb-2">
            <PieChart className={`w-3.5 h-3.5 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`} />
            <h4 className={`font-black text-[11px] ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {t('aiPromotion.postsOverview')}
            </h4>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <div className={`h-3 rounded-full overflow-hidden ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                <div
                  className="h-full bg-gradient-to-l from-orange-500 to-amber-500 rounded-full transition-all"
                  style={{ width: `${summary.totalPosts > 0 ? (summary.promotedPosts / summary.totalPosts) * 100 : 0}%` }}
                />
              </div>
            </div>
            <span className={`text-[10px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {summary.promotedPosts}/{summary.totalPosts}
            </span>
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <span className={`text-[10px] ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
              ✅ {t('aiPromotion.promoted')}: {summary.promotedPosts}
            </span>
            <span className={`text-[10px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              ⏳ {t('aiPromotion.unpromoted')}: {summary.unpromotedPosts}
            </span>
          </div>
        </motion.div>
      )}

      {/* AI Tips */}
      {aiTips.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className={`rounded-2xl p-3 border ${darkMode ? 'bg-gradient-to-br from-purple-900/20 to-indigo-900/10 border-purple-800/20' : 'bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-100'}`}
        >
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className={`w-3.5 h-3.5 ${darkMode ? 'text-purple-400' : 'text-purple-600'}`} />
            <h4 className={`font-black text-[11px] ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {t('aiPromotion.aiTipsHeader')}
            </h4>
          </div>
          <div className="space-y-1.5">
            {aiTips.slice(0, 3).map((tip: string, i: number) => (
              <div key={i} className={`flex items-start gap-2 text-[10px] leading-relaxed ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                <Star className={`w-3 h-3 flex-shrink-0 mt-0.5 ${darkMode ? 'text-purple-400' : 'text-purple-500'}`} />
                <span>{tip}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ═══════════ BUDGET OPTIMIZER (NEW) ═══════════ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className={`rounded-2xl p-3 border ${darkMode ? 'bg-gradient-to-br from-emerald-900/20 to-teal-900/10 border-emerald-800/20' : 'bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-100'}`}
      >
        <div className="flex items-center gap-2 mb-2">
          <Target className={`w-3.5 h-3.5 ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`} />
          <h4 className={`font-black text-[11px] ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {t('aiPromotion.budgetOptimizer', 'محسّن الميزانية')}
          </h4>
        </div>
        <p className={`text-[9px] mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          {t('aiPromotion.budgetOptimizerDesc', 'أدخل ميزانيتك وسيقوم الذكاء الاصطناعي بتوزيعها على أفضل منشوراتك')}
        </p>
        <div className="flex gap-1.5">
          <input
            type="number"
            value={budgetOptimizerInput}
            onChange={(e) => setBudgetOptimizerInput(e.target.value)}
            placeholder={t('aiPromotion.budgetPlaceholder', 'مثال: 300')}
            className={`flex-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold outline-none ${
              darkMode
                ? 'bg-gray-800 text-white placeholder-gray-500 border-gray-700 focus:border-emerald-500'
                : 'bg-white text-gray-900 placeholder-gray-400 border-gray-200 focus:border-emerald-400'
            } border focus:outline-none focus:ring-2 focus:ring-emerald-400/30`}
          />
          <button
            onClick={runBudgetOptimizer}
            disabled={isOptimizing || !budgetOptimizerInput}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all active:scale-95 flex items-center gap-1 ${
              isOptimizing || !budgetOptimizerInput
                ? darkMode ? 'bg-gray-700 text-gray-500' : 'bg-gray-200 text-gray-400'
                : 'bg-gradient-to-l from-emerald-500 to-teal-500 text-white shadow-md'
            }`}
          >
            {isOptimizing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
            {t('aiPromotion.optimize', 'تحسين')}
          </button>
        </div>
        {/* Quick budget presets */}
        <div className="flex gap-1 mt-2">
          {[100, 300, 500, 1000].map(amt => (
            <button
              key={amt}
              onClick={() => setBudgetOptimizerInput(amt.toString())}
              className={`flex-1 py-1 rounded-md text-[9px] font-bold transition-colors ${
                darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-white hover:bg-gray-50 text-gray-600 border border-gray-200'
              }`}
            >
              {amt}
            </button>
          ))}
        </div>
        {/* Optimizer result preview */}
        {budgetOptimizerResult && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className={`mt-2 p-2 rounded-lg ${darkMode ? 'bg-gray-800/50' : 'bg-white/70'}`}
          >
            <div className="grid grid-cols-2 gap-1.5">
              <div className="text-center">
                <p className={`text-[8px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('aiPromotion.estimatedReach', 'الوصول المقدر')}</p>
                <p className={`text-[11px] font-black ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>{budgetOptimizerResult.totalEstimatedReach.toLocaleString()}</p>
              </div>
              <div className="text-center">
                <p className={`text-[8px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('aiPromotion.costPerReach', 'تكلفة الوصول')}</p>
                <p className={`text-[11px] font-black ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>{budgetOptimizerResult.avgCostPerReach.toFixed(2)}</p>
              </div>
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* ═══════════ TOP PERFORMING POSTS (NEW) ═══════════ */}
      {statsData?.posts && statsData.posts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className={`rounded-2xl p-3 border ${darkMode ? 'bg-gray-800/50 border-gray-700' : 'bg-white border-gray-100'}`}
        >
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className={`w-3.5 h-3.5 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
            <h4 className={`font-black text-[11px] ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {t('aiPromotion.topPosts', 'أفضل المنشورات')}
            </h4>
          </div>
          <div className="space-y-1.5 max-h-32 overflow-y-auto">
            {statsData.posts
              .slice()
              .sort((a: any, b: any) => (b.reach || b.impressions || 0) - (a.reach || a.impressions || 0))
              .slice(0, 3)
              .map((post: any, i: number) => {
                const reach = post.reach || post.impressions || 0;
                const maxReach = Math.max(...statsData.posts.map((p: any) => p.reach || p.impressions || 0), 1);
                const pct = Math.round((reach / maxReach) * 100);
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className={`text-[10px] font-black w-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[10px] font-bold truncate ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                        {post.contentPreview || post.title || 'منشور'}
                      </p>
                      <div className={`h-1 rounded-full overflow-hidden mt-1 ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                        <div
                          className="h-full bg-gradient-to-l from-blue-500 to-cyan-400 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <span className={`text-[10px] font-black ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                      {Number(reach).toLocaleString()}
                    </span>
                  </div>
                );
              })}
          </div>
        </motion.div>
      )}

      {/* ═══════════ AUDIENCE DEMOGRAPHICS (NEW) ═══════════ */}
      {statsData?.demographics && (statsData.demographics.byCity?.length > 0 || statsData.demographics.byInterest?.length > 0) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className={`rounded-2xl p-3 border ${darkMode ? 'bg-gray-800/50 border-gray-700' : 'bg-white border-gray-100'}`}
        >
          <div className="flex items-center gap-2 mb-2">
            <Users className={`w-3.5 h-3.5 ${darkMode ? 'text-purple-400' : 'text-purple-600'}`} />
            <h4 className={`font-black text-[11px] ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {t('aiPromotion.audienceDemographics', 'الجمهور')}
            </h4>
          </div>
          {statsData.demographics.byCity?.length > 0 && (
            <div className="mb-2">
              <p className={`text-[9px] font-bold mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {t('aiPromotion.byCity', 'حسب المدينة')}
              </p>
              <div className="space-y-1">
                {statsData.demographics.byCity.slice(0, 3).map((c: any, i: number) => {
                  const maxCount = Math.max(...statsData.demographics.byCity.map((x: any) => x.count || 0), 1);
                  const pct = Math.round(((c.count || 0) / maxCount) * 100);
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <MapPin className={`w-2.5 h-2.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                      <span className={`text-[10px] font-bold flex-1 truncate ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{c.city || c.name}</span>
                      <div className={`h-1.5 w-12 rounded-full overflow-hidden ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                        <div className="h-full bg-gradient-to-l from-purple-500 to-violet-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className={`text-[9px] font-bold ${darkMode ? 'text-purple-400' : 'text-purple-600'}`}>{c.count || 0}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {statsData.demographics.byInterest?.length > 0 && (
            <div>
              <p className={`text-[9px] font-bold mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {t('aiPromotion.byInterest', 'حسب الاهتمام')}
              </p>
              <div className="flex flex-wrap gap-1">
                {statsData.demographics.byInterest.slice(0, 5).map((intr: any, i: number) => (
                  <span
                    key={i}
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                      darkMode ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-50 text-purple-600'
                    }`}
                  >
                    {intr.interest || intr.name} ({intr.count || 0})
                  </span>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Quick Actions */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Flame className={`w-3.5 h-3.5 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`} />
          <h4 className={`font-black text-[11px] ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {t('aiPromotion.quickActions')}
          </h4>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {quickActions.map((action, idx) => (
            <motion.button
              key={action.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 + idx * 0.05 }}
              onClick={() => { setActiveTab('chat'); action.action(); }}
              disabled={isLoading}
              className={`rounded-xl p-2.5 text-start transition-all active:scale-95 border ${
                darkMode
                  ? 'bg-gray-800/80 hover:bg-gray-700 border-gray-700'
                  : 'bg-white hover:bg-gray-50 border-gray-100 shadow-sm'
              } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${action.color} flex items-center justify-center mb-1.5`}>
                <action.icon className="w-3.5 h-3.5 text-white" />
              </div>
              <p className={`text-[10px] font-black leading-tight ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {action.label}
              </p>
              <p className={`text-[9px] mt-0.5 leading-tight ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {action.desc}
              </p>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );

  // ─── CHAT TAB CONTENT ────────────────────────────────────────────
  const ChatContent = () => (
    <>
      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ height: isExpanded ? 'calc(100% - 140px)' : 'calc(100% - 170px)' }}>
        {messages.map((msg, msgIndex) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              {/* Avatar */}
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                msg.role === 'assistant'
                  ? 'bg-gradient-to-br from-orange-400 to-amber-500 text-white'
                  : 'bg-gradient-to-br from-blue-400 to-indigo-500 text-white'
              }`}>
                {msg.role === 'assistant' ? <Bot className="w-3 h-3" /> : <User className="w-3 h-3" />}
              </div>

              {/* Message Bubble */}
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[11px] leading-relaxed ${
                msg.role === 'user'
                  ? darkMode
                    ? 'bg-blue-900/50 text-blue-100 rounded-tr-sm'
                    : 'bg-blue-500 text-white rounded-tr-sm'
                  : darkMode
                    ? 'bg-gray-800 text-gray-200 rounded-tl-sm border border-gray-700'
                    : 'bg-gray-100 text-gray-800 rounded-tl-sm'
              }`}>
                {/* Render markdown-like bold */}
                {msg.content.split('\n').map((line, i) => (
                  <React.Fragment key={i}>
                    {line.split(/(\*\*[^*]+\*\*)/).map((part, j) => {
                      if (part.startsWith('**') && part.endsWith('**')) {
                        return <span key={j} className="font-black">{part.slice(2, -2)}</span>;
                      }
                      return <span key={j}>{part}</span>;
                    })}
                    {i < msg.content.split('\n').length - 1 && <br />}
                  </React.Fragment>
                ))}

                {/* Apply button for targeting/budget/enhance data */}
                {msg.data && msg.type && onSuggestionApplied && (
                  <button
                    onClick={() => {
                      onSuggestionApplied(msg.data);
                      toast.success(t('aiPromotion.suggestionApplied'));
                    }}
                    className="mt-2 w-full py-1.5 bg-gradient-to-l from-orange-500 to-amber-500 text-white rounded-lg text-[9px] font-bold flex items-center justify-center gap-1 active:scale-95 transition-transform"
                  >
                    <Zap className="w-2.5 h-2.5" />
                    {t('aiPromotion.applySuggestion')}
                  </button>
                )}
              </div>
            </div>

            {/* Follow-up suggestions after the last assistant message */}
            {msg.role === 'assistant'
              && msgIndex === messages.length - 1
              && !isLoading
              && msg.id !== 'greeting'
              && !msg.data && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="flex flex-wrap gap-1.5 mt-1 pl-8"
              >
                {getFollowUpSuggestions(msg.content).map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => handleQuickQuestion(suggestion)}
                    disabled={isLoading}
                    className={`px-2.5 py-1 rounded-full text-[9px] font-bold whitespace-nowrap transition-all active:scale-95 border ${
                      darkMode
                        ? 'bg-orange-900/20 border-orange-800/30 text-orange-300 hover:bg-orange-900/40'
                        : 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100'
                    } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {suggestion}
                  </button>
                ))}
              </motion.div>
            )}
          </motion.div>
        ))}

        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-2"
          >
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 text-white flex items-center justify-center flex-shrink-0">
              <Bot className="w-3 h-3" />
            </div>
            <div className={`rounded-2xl px-3 py-2 ${darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-gray-100'}`}>
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </motion.div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Quick Action Chips in Chat */}
      {messages.length <= 1 && (
        <div className={`px-3 py-1.5 border-t ${darkMode ? 'border-gray-700 bg-gray-800/30' : 'border-gray-50 bg-gray-50/50'}`}>
          <div className="flex gap-1.5 overflow-x-auto hide-scrollbar">
            {quickActions.map((action) => (
              <button
                key={action.id}
                onClick={action.action}
                disabled={isLoading}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold whitespace-nowrap transition-all active:scale-95 ${
                  darkMode
                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    : 'bg-white hover:bg-gray-100 text-gray-700 shadow-sm'
                } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <action.icon className="w-2.5 h-2.5" />
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className={`px-3 py-2 border-t ${darkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-100 bg-gray-50'}`}>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
            placeholder={t('aiPromotion.askAboutPromotion')}
            disabled={isLoading}
            className={`flex-1 px-3 py-2 rounded-xl text-[11px] font-medium transition-colors ${
              darkMode
                ? 'bg-gray-700 text-white placeholder-gray-400 border-gray-600 focus:border-orange-500'
                : 'bg-white text-gray-900 placeholder-gray-400 border-gray-200 focus:border-orange-400'
            } border focus:outline-none focus:ring-2 focus:ring-orange-400/30`}
          />
          <button
            onClick={handleSendChat}
            disabled={isLoading || !input.trim()}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90 ${
              isLoading || !input.trim()
                ? darkMode ? 'bg-gray-700 text-gray-500' : 'bg-gray-200 text-gray-400'
                : 'bg-gradient-to-l from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-200'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        className={`fixed inset-4 md:inset-auto md:bottom-4 md:left-4 ${isExpanded ? 'md:w-[480px] md:h-[680px]' : 'md:w-[380px] md:h-[560px]'} z-[250] rounded-2xl overflow-hidden shadow-2xl border flex flex-col ${
          darkMode
            ? 'bg-gray-900 border-gray-700 shadow-black/50'
            : 'bg-white border-gray-200 shadow-gray-200/50'
        }`}
        dir={dir}
      >
        {/* ─── Header ─── */}
        <div className="bg-gradient-to-l from-orange-500 via-amber-500 to-orange-600 p-3 text-white flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <Brain className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-black text-xs">{t('aiPromotion.title')}</h3>
                <p className="text-[9px] opacity-80">{t('aiPromotion.poweredByAI')}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-green-300 rounded-full animate-pulse" />
              {/* Tab Toggle */}
              <div className={`flex rounded-lg overflow-hidden bg-white/10`}>
                <button
                  onClick={() => setActiveTab('dashboard')}
                  className={`px-2 py-1 text-[9px] font-bold transition-all ${
                    activeTab === 'dashboard' ? 'bg-white/25' : 'hover:bg-white/10'
                  }`}
                >
                  <PieChart className="w-3 h-3" />
                </button>
                <button
                  onClick={() => setActiveTab('chat')}
                  className={`px-2 py-1 text-[9px] font-bold transition-all ${
                    activeTab === 'chat' ? 'bg-white/25' : 'hover:bg-white/10'
                  }`}
                >
                  <MessageSquare className="w-3 h-3" />
                </button>
              </div>
              {/* Expand/Collapse */}
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-6 h-6 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-colors"
                title={t('aiPromotion.expand', 'تكبير')}
              >
                <Maximize2 className="w-3 h-3" />
              </button>
              {/* Clear chat (only in chat tab and when there are messages) */}
              {activeTab === 'chat' && messages.filter(m => m.id !== 'greeting').length > 0 && (
                <button
                  onClick={clearChat}
                  className="w-6 h-6 bg-white/20 hover:bg-red-500/60 rounded-full flex items-center justify-center transition-colors"
                  title={t('aiPromotion.clearChat', 'مسح المحادثة')}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
              {/* Close */}
              <button
                onClick={() => { setIsOpen(false); onClose?.(); }}
                className="w-6 h-6 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-colors"
                title={t('common.close', 'إغلاق')}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* ─── Tab Content ─── */}
        {activeTab === 'dashboard' ? <DashboardContent /> : <ChatContent />}
      </motion.div>
    </AnimatePresence>
  );
};

// ─── Floating AI Button ─ زر الذكاء الاصطناعي العائم ────────────────
export const AIFloatingButton: React.FC = () => {
  const { darkMode } = useAppContext();
  const { currentUser } = useAuth();
  const [showAssistant, setShowAssistant] = useState(false);
  const routerLocation = useLocation();

  if (!currentUser) return null;

  // 🔧 FIX: The AI Promotion floating button now shows ONLY on the home
  // page (the main feed at '/'). It is hidden on every other page to:
  //   - avoid overlapping with other page-specific FABs (e.g. "أضف طبق"
  //     on /food, the add-listing FAB on /market, etc.)
  //   - keep the UI clean on forms/pages where it would be distracting
  //     (wallet, settings, profile, messages, market-live, livestream, etc.)
  //   - simplify the UX: the assistant is a home-feed feature, not a
  //     global overlay.
  // The check is reactive (useLocation) so the button appears/disappears
  // instantly when the user navigates to/from the home page.
  const currentPath = routerLocation.pathname || '';
  const isOnHomePage = currentPath === '/';
  if (!isOnHomePage) return null;

  return (
    <>
      <AnimatePresence>
        {showAssistant && (
          <AIPromotionAssistant
            onClose={() => setShowAssistant(false)}
          />
        )}
      </AnimatePresence>

      {/* 🔧 FIX: position the AI FAB at bottom-LEFT, stacked ABOVE the
          FloatingChatButton (which is at bottom-6 left-4 on lg+ screens,
          height ~56px → top at ~80px from bottom).
          Previously both buttons were at sm:bottom-6 sm:left-6 and overlapped.
          Now the AI button is at bottom-24 (96px from bottom) on ALL screen
          sizes — this leaves a 16px gap above the chat button (which tops
          at ~80px) so the two buttons are clearly separated and never
          overlap, even when the chat button expands on hover. */}
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setShowAssistant(!showAssistant)}
        className={`flex fixed bottom-24 left-4 sm:left-6 z-[200] w-12 h-12 rounded-2xl items-center justify-center shadow-2xl transition-all ${
          showAssistant
            ? 'bg-gray-600 hover:bg-gray-700 text-white'
            : 'bg-gradient-to-br from-orange-500 via-amber-500 to-orange-600 text-white shadow-orange-300/30 hover:shadow-orange-400/50'
        }`}
      >
        {showAssistant ? (
          <X className="w-5 h-5" />
        ) : (
          <div className="relative">
            <Brain className="w-5 h-5" />
            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse border-2 border-white" />
          </div>
        )}
      </motion.button>
    </>
  );
};

// ─── Full Page AI Promotion ─ صفحة الترويج الذكي الكاملة ──────────
export const AIPromotionPage: React.FC = () => {
  const { darkMode } = useAppContext();
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const { dir } = useLanguage();

  if (!currentUser) return null;

  return (
    <div className="max-w-2xl mx-auto" dir={dir}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => window.history.back()}
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
            darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
          }`}
        >
          {dir === 'rtl' ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-amber-500 rounded-xl flex items-center justify-center">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className={`text-sm font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {t('aiPromotion.title')}
            </h1>
            <p className={`text-[10px] ${darkMode ? 'text-orange-400/80' : 'text-orange-600/80'}`}>
              {t('aiPromotion.poweredByAI')}
            </p>
          </div>
        </div>
      </div>

      {/* Full page assistant embedded */}
      <AIPromotionAssistant
        fullPage
        onClose={() => window.history.back()}
      />
    </div>
  );
};
