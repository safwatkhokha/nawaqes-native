// ─── Global Create Post Modal ───────────────────────────────────────
// Mounts the "Create Post" modal at the application root so it works
// on EVERY route (not just the home page). Previously the modal and its
// `nawaqes-create-post` event listener lived inside `MainLayout`, which
// is only mounted on the `/` route — so buttons on other pages (e.g. the
// "+ أضف طبق" button on /food, or the center nav button when not on home)
// dispatched the event but nothing was listening and the modal was not
// rendered, so the button appeared "broken".
//
// This component:
//   1. Registers the `nawaqes-create-post` window event listener.
//   2. Renders the modal whenever `showCreatePost` is true in AppContext.
//   3. Reads `detail.postType` from the event (if present) so buttons can
//      request a specific post type — e.g. the FoodPage "+ أضف طبق" button
//      requests postType='food' so the user lands on the "🍽️ هتاكل" tab
//      instead of having to manually switch from "إعلان".
//
// It is rendered inside <GlobalUI/> so it is present on every page
// (including /chat-app).

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { toast } from '../lib/silentToast';
import { CreatePost } from './CreatePost';

type PostType = 'ad' | 'status' | 'food';

export const GlobalCreatePostModal: React.FC = () => {
  const { showCreatePost, setShowCreatePost, darkMode } = useAppContext();
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const { dir } = useLanguage();

  // Which post-type tab should be active when the modal opens. Buttons
  // dispatch `nawaqes-create-post` with `detail.postType` to pre-select
  // a tab. Defaults to 'ad' when no detail is provided.
  const [initialPostType, setInitialPostType] = useState<PostType>('ad');

  // Listen for "open create post" requests from anywhere in the app.
  // (mobile bottom nav center button, FoodPage "+ أضف طبق" button, etc.)
  useEffect(() => {
    const handleCreatePost = (e: Event) => {
      const detail = (e as CustomEvent).detail as { postType?: PostType } | undefined;
      const requested = detail?.postType;
      // Only accept known post types; ignore anything else (defaults to 'ad').
      if (requested === 'ad' || requested === 'status' || requested === 'food') {
        setInitialPostType(requested);
      } else {
        setInitialPostType('ad');
      }
      setShowCreatePost(true);
    };
    window.addEventListener('nawaqes-create-post', handleCreatePost);
    return () => window.removeEventListener('nawaqes-create-post', handleCreatePost);
  }, [setShowCreatePost]);

  return (
    <AnimatePresence>
      {showCreatePost && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          dir={dir}
          className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
          onClick={() => setShowCreatePost(false)}
        >
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle for mobile bottom sheet */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className={`w-10 h-1 rounded-full ${darkMode ? 'bg-gray-600' : 'bg-gray-300'}`} />
            </div>
            <CreatePost
              user={currentUser}
              initialPostType={initialPostType}
              onPostCreated={() => {
                toast.success(t('app.postPublished'));
                setShowCreatePost(false);
              }}
              isModal
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
