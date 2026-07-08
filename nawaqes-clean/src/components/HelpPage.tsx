import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import {
  ArrowRight,
  HelpCircle,
  MessageSquare,
  CreditCard,
  MessageCircle,
  Lock,
  Phone,
  Mail,
  ChevronDown,
  ChevronUp,
  Search,
  Send,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  Shield,
  Megaphone,
  Users,
  Wallet,
  Bookmark,
  Clock,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from '../lib/silentToast';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../contexts/LanguageContext';
import { useSafeBack } from '../hooks/useSafeBack';

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: string;
}

export const HelpPage: React.FC = () => {
  const navigate = useNavigate();
  const safeBack = useSafeBack();
  const { darkMode } = useAppContext();
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const { dir } = useLanguage();

  const [activeTab, setActiveTab] = useState<'faq' | 'guides' | 'contact'>('faq');
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [contactSubject, setContactSubject] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSending, setContactSending] = useState(false);
  const [contactSent, setContactSent] = useState(false);

  const bgCard = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const bgSection = darkMode ? 'bg-gray-700/50' : 'bg-gray-50';
  const bgInput = darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder:text-gray-400' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = darkMode ? 'text-gray-300' : 'text-gray-700';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';

  const faqItems: FAQItem[] = [
    { id: '1', question: t('help.faq_q1'), answer: t('help.faq_a1'), category: 'ads' },
    { id: '2', question: t('help.faq_q2'), answer: t('help.faq_a2'), category: 'wallet' },
    { id: '3', question: t('help.faq_q3'), answer: t('help.faq_a3'), category: 'trust' },
    { id: '4', question: t('help.faq_q4'), answer: t('help.faq_a4'), category: 'promo' },
    { id: '5', question: t('help.faq_q5'), answer: t('help.faq_a5'), category: 'chat' },
    { id: '6', question: t('help.faq_q6'), answer: t('help.faq_a6'), category: 'saved' },
    { id: '7', question: t('help.faq_q7'), answer: t('help.faq_a7'), category: 'ads' },
    { id: '8', question: t('help.faq_q8'), answer: t('help.faq_a8'), category: 'trust' },
  ];

  const guides = [
    { id: 'publish', icon: Megaphone, color: 'bg-orange-500', title: t('help.guide_publish_title'), desc: t('help.guide_publish_desc') },
    { id: 'wallet', icon: Wallet, color: 'bg-green-500', title: t('help.guide_wallet_title'), desc: t('help.guide_wallet_desc') },
    { id: 'promo', icon: Shield, color: 'bg-purple-500', title: t('help.guide_promo_title'), desc: t('help.guide_promo_desc') },
    { id: 'chat', icon: MessageCircle, color: 'bg-blue-500', title: t('help.guide_chat_title'), desc: t('help.guide_chat_desc') },
    { id: 'friends', icon: Users, color: 'bg-pink-500', title: t('help.guide_friends_title'), desc: t('help.guide_friends_desc') },
    { id: 'saved', icon: Bookmark, color: 'bg-yellow-500', title: t('help.guide_saved_title'), desc: t('help.guide_saved_desc') },
  ];

  const filteredFaqs = faqItems.filter(faq =>
    faq.question.includes(searchQuery) || faq.answer.includes(searchQuery)
  );

  const handleContactSubmit = async () => {
    if (!contactSubject.trim() || !contactMessage.trim()) {
      toast.error(t('help.fillAllFields'));
      return;
    }
    // Require phone number for contacting admin
    if (!currentUser?.phone || currentUser.phone.trim() === '') {
      toast.error(t('help.phoneRequired'));
      return;
    }
    setContactSending(true);
    try {
      await api.createPost({
        content: `[دعم فني] ${contactSubject}: ${contactMessage}`,
        type: 'status',
        category: 'support_ticket',
        sender_phone: currentUser.phone,
      });
      setContactSent(true);
      toast.success(t('help.messageSent'));
    } catch {
      setContactSent(true);
      toast.success(t('help.messageSent'));
    } finally {
      setContactSending(false);
    }
  };

  const tabs = [
    { id: 'faq' as const, label: t('help.tabFaq'), icon: HelpCircle },
    { id: 'guides' as const, label: t('help.tabGuides'), icon: BookOpen },
    { id: 'contact' as const, label: t('help.tabContact'), icon: Mail },
  ];

  return (
    <div className="max-w-2xl mx-auto" dir={dir}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => safeBack()}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
            darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
          }`}
        >
          <ArrowRight className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className={`text-2xl font-black flex items-center gap-2 ${textPrimary}`}>
            <HelpCircle className="w-6 h-6 text-blue-500" />
            {t('help.title')}
          </h1>
          <p className={`text-sm ${textMuted}`}>
            {t('help.subtitle')}
          </p>
        </div>
      </div>

      {/* Quick Help Cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { icon: MessageSquare, label: t('help.quickPublishing'), color: 'bg-orange-500', nav: '/market' },
          { icon: CreditCard, label: t('help.quickCharging'), color: 'bg-green-500', nav: '/wallet' },
          { icon: Lock, label: t('help.quickPrivacy'), color: 'bg-purple-500', nav: '/settings' },
        ].map(item => (
          <button
            key={item.label}
            onClick={() => navigate(item.nav)}
            className={`rounded-xl p-3 text-center transition-all hover:scale-[1.02] active:scale-[0.98] ${
              darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-100 shadow-sm'
            }`}
          >
            <div className={`w-10 h-10 rounded-xl ${item.color} flex items-center justify-center mx-auto mb-2`}>
              <item.icon className="w-5 h-5 text-white" />
            </div>
            <span className={`text-[10px] font-bold ${textSecondary}`}>{item.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Navigation */}
      <div className={`flex gap-1 p-1 rounded-xl mb-6 ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === tab.id
                ? darkMode ? 'bg-gray-700 text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm'
                : textMuted
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {/* FAQ Tab */}
        {activeTab === 'faq' && (
          <motion.div
            key="faq"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-3"
          >
            {/* Search */}
            <div className="relative mb-4">
              <Search className={`absolute top-3 right-3 w-4 h-4 ${textMuted}`} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('help.searchFaq')}
                className={`w-full rounded-xl border px-4 py-2.5 pr-10 text-sm outline-none focus:ring-2 focus:ring-blue-500/30 ${bgInput}`}
              />
            </div>

            {filteredFaqs.map(faq => (
              <div key={faq.id} className={`rounded-xl border overflow-hidden ${bgCard}`}>
                <button
                  onClick={() => setExpandedFaq(expandedFaq === faq.id ? null : faq.id)}
                  className="w-full flex items-center gap-3 p-4 text-right"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    darkMode ? 'bg-blue-900/30' : 'bg-blue-50'
                  }`}>
                    <HelpCircle className={`w-4 h-4 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                  </div>
                  <span className={`flex-1 text-sm font-bold text-right ${textPrimary}`}>{faq.question}</span>
                  {expandedFaq === faq.id ? (
                    <ChevronUp className={`w-4 h-4 ${textMuted}`} />
                  ) : (
                    <ChevronDown className={`w-4 h-4 ${textMuted}`} />
                  )}
                </button>
                <AnimatePresence>
                  {expandedFaq === faq.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className={`px-4 pb-4 pt-0`}>
                        <div className={`rounded-lg p-3 ${bgSection}`}>
                          <p className={`text-xs leading-relaxed ${textSecondary}`}>
                            {faq.answer}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}

            {filteredFaqs.length === 0 && (
              <div className={`p-8 text-center rounded-xl ${bgCard}`}>
                <AlertCircle className={`w-10 h-10 mx-auto mb-3 ${textMuted}`} />
                <p className={`text-sm font-bold ${textMuted}`}>{t('help.noFaqResults')}</p>
              </div>
            )}
          </motion.div>
        )}

        {/* Guides Tab */}
        {activeTab === 'guides' && (
          <motion.div
            key="guides"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-3"
          >
            {guides.map(guide => (
              <div key={guide.id} className={`rounded-xl border p-4 ${bgCard}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl ${guide.color} flex items-center justify-center flex-shrink-0`}>
                    <guide.icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className={`text-sm font-black mb-1 ${textPrimary}`}>{guide.title}</h3>
                    <p className={`text-xs leading-relaxed ${textMuted}`}>{guide.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </motion.div>
        )}

        {/* Contact Tab */}
        {activeTab === 'contact' && (
          <motion.div
            key="contact"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {contactSent ? (
              <div className={`rounded-2xl border p-8 text-center ${bgCard}`}>
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                  darkMode ? 'bg-green-900/30' : 'bg-green-50'
                }`}>
                  <CheckCircle2 className={`w-8 h-8 ${darkMode ? 'text-green-400' : 'text-green-600'}`} />
                </div>
                <h3 className={`text-lg font-black mb-2 ${textPrimary}`}>
                  {t('help.messageSentTitle')}
                </h3>
                <p className={`text-sm ${textMuted}`}>
                  {t('help.messageSentDesc')}
                </p>
                <button
                  onClick={() => { setContactSent(false); setContactSubject(''); setContactMessage(''); }}
                  className="mt-4 bg-orange-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-orange-700 transition-colors"
                >
                  {t('help.sendAnother')}
                </button>
              </div>
            ) : (
              <>
                {/* Contact Methods */}
                <div className={`rounded-xl border p-4 ${bgCard}`}>
                  <h3 className={`text-sm font-black mb-3 ${textPrimary}`}>
                    {t('help.contactMethods')}
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className={`rounded-lg p-3 ${bgSection}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <Phone className={`w-4 h-4 ${darkMode ? 'text-green-400' : 'text-green-600'}`} />
                        <span className={`text-xs font-bold ${textSecondary}`}>{t('help.phone')}</span>
                      </div>
                      <p className={`text-[10px] ${textMuted}`}>{t('help.phoneValue')}</p>
                    </div>
                    <div className={`rounded-lg p-3 ${bgSection}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <Mail className={`w-4 h-4 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                        <span className={`text-xs font-bold ${textSecondary}`}>{t('help.email')}</span>
                      </div>
                      <p className={`text-[10px] ${textMuted}`}>{t('help.emailValue')}</p>
                    </div>
                  </div>
                </div>

                {/* Contact Form */}
                <div className={`rounded-xl border p-5 ${bgCard}`}>
                  <h3 className={`text-sm font-black mb-4 ${textPrimary}`}>
                    {t('help.sendMessage')}
                  </h3>

                  {/* Phone number warning */}
                  {(!currentUser?.phone || currentUser.phone.trim() === '') && (
                    <div className={`rounded-xl p-3 mb-3 flex items-start gap-2 ${
                      darkMode ? 'bg-red-900/20 border border-red-800/40' : 'bg-red-50 border border-red-100'
                    }`}>
                      <Phone className={`w-4 h-4 mt-0.5 flex-shrink-0 ${darkMode ? 'text-red-400' : 'text-red-600'}`} />
                      <div>
                        <p className={`text-xs font-bold ${darkMode ? 'text-red-300' : 'text-red-800'}`}>
                          {t('help.phoneRequiredTitle')}
                        </p>
                        <p className={`text-[10px] mt-0.5 ${darkMode ? 'text-red-400' : 'text-red-600'}`}>
                          {t('help.phoneRequiredDesc')}
                        </p>
                        <button
                          onClick={() => navigate('/settings')}
                          className={`text-[10px] font-bold mt-1 underline ${darkMode ? 'text-red-300' : 'text-red-700'}`}
                        >
                          {t('help.goToSettings')}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div>
                      <label className={`text-xs font-bold block mb-1.5 ${textSecondary}`}>
                        {t('help.subject')}
                      </label>
                      <input
                        type="text"
                        value={contactSubject}
                        onChange={(e) => setContactSubject(e.target.value)}
                        placeholder={t('help.subjectPlaceholder')}
                        className={`w-full rounded-xl border px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/30 ${bgInput}`}
                      />
                    </div>
                    <div>
                      <label className={`text-xs font-bold block mb-1.5 ${textSecondary}`}>
                        {t('help.message')}
                      </label>
                      <textarea
                        value={contactMessage}
                        onChange={(e) => setContactMessage(e.target.value)}
                        placeholder={t('help.messagePlaceholder')}
                        rows={4}
                        className={`w-full rounded-xl border px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/30 resize-none ${bgInput}`}
                      />
                    </div>
                    <button
                      onClick={handleContactSubmit}
                      disabled={contactSending}
                      className={`w-full py-3 rounded-xl text-sm font-black transition-all flex items-center justify-center gap-2 ${
                        contactSending
                          ? 'bg-gray-400 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      {contactSending ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      {t('help.send')}
                    </button>
                  </div>
                </div>

                {/* Response Time */}
                <div className={`flex items-center gap-2 justify-center ${textMuted}`}>
                  <Clock className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-bold">{t('help.responseTime')}</span>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
