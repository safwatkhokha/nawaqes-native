// ─── Nawaqes Chat App — Standalone Entry Point ─────────────────────
// Import the shared CSS (Tailwind + custom styles) so the chat app
// has the same styling foundation as the main app.
import '../index.css';

import React from 'react';
import { createRoot } from 'react-dom/client';
import { ChatApp } from './ChatApp';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <ChatApp />
    </React.StrictMode>
  );
}
