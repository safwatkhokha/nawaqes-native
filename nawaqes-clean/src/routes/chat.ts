// ─── Chat / Messages Routes ─────────────────────────────────────────
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import db from '../database/index.js';
import { authMiddleware, JwtPayload } from '../middleware/auth.js';
import { sendPushToUser } from '../services/pushNotifications.js';
import { backupFileToHF } from '../database/image-backup.js';

const router = Router();

// ─── Chat Image Upload Setup ────────────────────────────────────────
// Whitelist approach: require a whitelisted extension. MIME is checked
// when present, but Android WebView (and iOS Safari) often send images
// with `application/octet-stream` MIME — in that case we fall back to
// accepting by extension (already whitelisted) so mobile uploads work.
const CHAT_ALLOWED_IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.ico', '.avif']);
const CHAT_ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp',
  'image/x-icon', 'image/avif',
]);
const chatImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = path.resolve('uploads/chat');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomBytes(16).toString('hex')}${ext}`);
  },
});
const chatImageUpload = multer({
  storage: chatImageStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    // Require whitelisted extension
    if (!CHAT_ALLOWED_IMAGE_EXT.has(ext)) return cb(null, false);
    // Accept whitelisted MIME
    if (CHAT_ALLOWED_IMAGE_MIME.has(file.mimetype)) return cb(null, true);
    // Fallback for Android WebView / iOS Safari (octet-stream / empty MIME)
    if (file.mimetype === 'application/octet-stream' || file.mimetype === '' || !file.mimetype) {
      return cb(null, true);
    }
    cb(null, false);
  },
});

// ─── Helper: check if user is blocked ──────────────────────────────
function isUserBlocked(blockerId: string, blockedId: string): boolean {
  const block = db.prepare(
    'SELECT id FROM blocked_users WHERE blocker_id = ? AND blocked_id = ?'
  ).get(blockerId, blockedId) as any;
  return !!block;
}

// ─── Helper: get muted chats for a user ────────────────────────────
function getMutedTargetIds(userId: string): Set<string> {
  const mutes = db.prepare('SELECT target_id FROM chat_mutes WHERE user_id = ?').all(userId) as any[];
  return new Set(mutes.map(m => m.target_id));
}

// ─── Helper: get blocked user IDs for a user ───────────────────────
function getBlockedUserIds(userId: string): { blockedByMe: Set<string>; blockedMe: Set<string> } {
  const blockedByMe = db.prepare('SELECT blocked_id FROM blocked_users WHERE blocker_id = ?').all(userId) as any[];
  const blockedMe = db.prepare('SELECT blocker_id FROM blocked_users WHERE blocked_id = ?').all(userId) as any[];
  return {
    blockedByMe: new Set(blockedByMe.map(b => b.blocked_id)),
    blockedMe: new Set(blockedMe.map(b => b.blocker_id)),
  };
}

// GET /api/chat/contacts
router.get('/contacts', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const userId = payload.userId;
    const mutedIds = getMutedTargetIds(userId);
    const { blockedByMe, blockedMe } = getBlockedUserIds(userId);

    // Get all users who have exchanged messages with current user
    const contacts = db.prepare(`
      SELECT DISTINCT
        CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END as contact_id,
        u.name, u.avatar, u.is_verified
      FROM chat_messages cm
      JOIN users u ON u.id = CASE WHEN cm.sender_id = ? THEN cm.receiver_id ELSE cm.sender_id END
      WHERE (sender_id = ? OR receiver_id = ?) AND group_id IS NULL
      ORDER BY cm.created_at DESC
    `).all(userId, userId, userId, userId) as any[];

    const enriched = contacts.map(c => {
      const lastMsg = db.prepare(`
        SELECT text, message_type, created_at FROM chat_messages
        WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)) AND (group_id IS NULL OR group_id = '')
        ORDER BY created_at DESC LIMIT 1
      `).get(userId, c.contact_id, c.contact_id, userId) as any;

      const unread = db.prepare(`
        SELECT COUNT(*) as count FROM chat_messages
        WHERE sender_id = ? AND receiver_id = ? AND read = 0 AND (group_id IS NULL OR group_id = '')
      `).get(c.contact_id, userId) as any;

      let lastMessageText = lastMsg?.text || '';
      if (lastMsg?.message_type === 'image') {
        lastMessageText = '📷 صورة';
      } else if (lastMsg?.message_type === 'voice') {
        lastMessageText = '🎤 رسالة صوتية';
      }

      return {
        id: c.contact_id,
        name: c.name,
        avatar: c.avatar,
        isVerified: !!c.is_verified,
        lastMessage: lastMessageText,
        lastTime: lastMsg?.created_at || '',
        unread: unread?.count || 0,
        online: (req.app.locals as any).wsManager?.isUserOnline(c.contact_id) || false,
        isMuted: mutedIds.has(c.contact_id),
        isBlocked: blockedByMe.has(c.contact_id) || blockedMe.has(c.contact_id),
      };
    });

    // Also get groups for this user
    const groups = db.prepare(`
      SELECT cg.*, cgm.role
      FROM chat_groups cg
      JOIN chat_group_members cgm ON cgm.group_id = cg.id
      WHERE cgm.user_id = ?
      ORDER BY cg.updated_at DESC
    `).all(userId) as any[];

    const groupContacts = groups.map(g => {
      const lastMsg = db.prepare(`
        SELECT text, message_type, created_at FROM chat_messages
        WHERE group_id = ?
        ORDER BY created_at DESC LIMIT 1
      `).get(g.id) as any;

      const unread = db.prepare(`
        SELECT COUNT(*) as count FROM chat_messages
        WHERE group_id = ? AND sender_id != ? AND read = 0
      `).get(g.id, userId) as any;

      const memberCount = db.prepare('SELECT COUNT(*) as count FROM chat_group_members WHERE group_id = ?').get(g.id) as any;

      let lastMessageText = lastMsg?.text || '';
      if (lastMsg?.message_type === 'image') {
        lastMessageText = '📷 صورة';
      } else if (lastMsg?.message_type === 'voice') {
        lastMessageText = '🎤 رسالة صوتية';
      }

      return {
        id: `group_${g.id}`,
        name: g.name,
        avatar: g.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(g.name)}`,
        lastMessage: lastMessageText,
        lastTime: lastMsg?.created_at || g.created_at || '',
        unread: unread?.count || 0,
        online: false,
        isGroup: true,
        groupId: g.id,
        isMuted: mutedIds.has(g.id),
        isBlocked: false,
        memberCount: memberCount?.count || 0,
      };
    });

    // Merge and sort by last message time
    const allContacts = [...enriched, ...groupContacts].sort((a, b) => {
      const timeA = a.lastTime ? new Date(a.lastTime).getTime() : 0;
      const timeB = b.lastTime ? new Date(b.lastTime).getTime() : 0;
      return timeB - timeA;
    });

    res.json(allContacts);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب جهات الاتصال', details: err.message });
  }
});

// GET /api/chat/messages/:contactId
router.get('/messages/:contactId', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { contactId } = req.params;
    const { limit = '50', before } = req.query;

    // Check if this is a group chat
    const isGroup = contactId.startsWith('group_');
    const groupId = isGroup ? contactId.replace('group_', '') : null;

    let messages: any[];
    if (isGroup && groupId) {
      // Load group messages
      let query = `SELECT * FROM chat_messages WHERE group_id = ?`;
      const params: any[] = [groupId];
      if (before) { query += ' AND created_at < ?'; params.push(before as string); }
      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(parseInt(limit as string));
      messages = db.prepare(query).all(...params).reverse();

      // Mark group messages as read
      db.prepare('UPDATE chat_messages SET read = 1 WHERE group_id = ? AND sender_id != ? AND read = 0')
        .run(groupId, payload.userId);
      db.prepare('UPDATE chat_messages SET delivered = 1 WHERE group_id = ? AND sender_id != ? AND delivered = 0')
        .run(groupId, payload.userId);
    } else {
      // Load DM messages
      let query = `
        SELECT * FROM chat_messages
        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
      `;
      const params: any[] = [payload.userId, contactId, contactId, payload.userId];
      if (before) { query += ' AND created_at < ?'; params.push(before as string); }
      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(parseInt(limit as string));
      messages = db.prepare(query).all(...params).reverse();

      // Mark as read
      db.prepare('UPDATE chat_messages SET read = 1 WHERE sender_id = ? AND receiver_id = ? AND read = 0')
        .run(contactId, payload.userId);
      db.prepare('UPDATE chat_messages SET delivered = 1 WHERE sender_id = ? AND receiver_id = ? AND delivered = 0')
        .run(contactId, payload.userId);
    }

    // Filter out messages deleted for the current user
    const filteredMessages = messages.filter((m: any) => {
      if (!m.deleted_for) return true;
      const deletedForUsers = m.deleted_for.split(',').map((id: string) => id.trim()).filter(Boolean);
      return !deletedForUsers.includes(payload.userId);
    });

    res.json(filteredMessages);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب الرسائل', details: err.message });
  }
});

// POST /api/chat/send
router.post('/send', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { receiverId, text, postId, messageType, imageUrl, replyToId, voiceUrl, voiceDuration, groupId } = req.body;

    const msgType = messageType || 'text';
    const isGroupMsg = !!groupId;

    if (!receiverId && !groupId) {
      res.status(400).json({ error: 'المستلم مطلوب' });
      return;
    }

    // Text messages require text; image messages require imageUrl; voice messages require voiceUrl
    if (msgType === 'text' && !text) {
      res.status(400).json({ error: 'النص مطلوب' });
      return;
    }
    if (msgType === 'image' && !imageUrl) {
      res.status(400).json({ error: 'رابط الصورة مطلوب' });
      return;
    }
    if (msgType === 'voice' && !voiceUrl) {
      res.status(400).json({ error: 'رابط الرسالة الصوتية مطلوب' });
      return;
    }

    // For DMs, check block status
    if (!isGroupMsg && receiverId) {
      if (isUserBlocked(payload.userId, receiverId)) {
        res.status(403).json({ error: 'لا يمكنك مراسلة مستخدم محظور' });
        return;
      }
      if (isUserBlocked(receiverId, payload.userId)) {
        res.status(403).json({ error: 'لا يمكنك مراسلة هذا المستخدم' });
        return;
      }
    }

    // For group messages, check membership
    if (isGroupMsg) {
      const membership = db.prepare(
        'SELECT id FROM chat_group_members WHERE group_id = ? AND user_id = ?'
      ).get(groupId, payload.userId) as any;
      if (!membership) {
        res.status(403).json({ error: 'لست عضواً في هذه المجموعة' });
        return;
      }
    }

    // Generate a TEXT id manually
    const messageId = crypto.randomBytes(16).toString('hex').toLowerCase();

    // For group messages, receiver_id must be NULL (not 'group') because
    // chat_messages.receiver_id has a FOREIGN KEY REFERENCES users(id).
    // Setting it to 'group' would violate the FK constraint.
    // For DMs, receiver_id is the actual user ID.
    const actualReceiverId = isGroupMsg ? null : receiverId;

    db.prepare(`
      INSERT INTO chat_messages (id, sender_id, receiver_id, text, post_id, message_type, image_url, reply_to_id, reactions, deleted_for, voice_url, voice_duration, group_id, is_forwarded, forwarded_from)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      messageId, payload.userId, actualReceiverId as any,
      text || '', postId || null,
      msgType, imageUrl || '', replyToId || null,
      '{}', '', voiceUrl || '', voiceDuration || 0,
      groupId || null, 0, ''
    );

    // Create notification for the receiver (DM only)
    if (!isGroupMsg && receiverId) {
      const sender = db.prepare('SELECT name FROM users WHERE id = ?').get(payload.userId) as any;
      if (sender) {
        const notifText = msgType === 'image'
          ? `رسالة جديدة من ${sender.name}: 📷 صورة`
          : msgType === 'voice'
            ? `رسالة جديدة من ${sender.name}: 🎤 رسالة صوتية`
            : `رسالة جديدة من ${sender.name}: ${(text || '').slice(0, 50)}${(text || '').length > 50 ? '...' : ''}`;
        db.prepare('INSERT INTO notifications (user_id, type, message, user_id_ref, link) VALUES (?, ?, ?, ?, ?)')
          .run(receiverId, 'message', notifText, payload.userId, '/messages');
      }
    }

    const message = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(messageId);

    // Emit WebSocket event
    try {
      const wsManager = (req.app.locals as any).wsManager;
      if (wsManager) {
        const senderUser = db.prepare('SELECT name, avatar FROM users WHERE id = ?').get(payload.userId) as any;

        if (isGroupMsg && groupId) {
          // Broadcast to all group members except sender
          const groupMembers = db.prepare('SELECT user_id FROM chat_group_members WHERE group_id = ?').all(groupId) as any[];
          for (const member of groupMembers) {
            if (member.user_id !== payload.userId) {
              wsManager.emitChatMessage(member.user_id, {
                id: messageId,
                senderId: payload.userId,
                receiverId: 'group',
                text: text || '',
                messageType: msgType,
                imageUrl: imageUrl || '',
                postId: postId || null,
                replyToId: replyToId || null,
                voiceUrl: voiceUrl || '',
                voiceDuration: voiceDuration || 0,
                groupId,
                timestamp: new Date().toISOString(),
                senderName: senderUser?.name || '',
                senderAvatar: senderUser?.avatar || '',
              });

              // Notification for group members
              const notifText = msgType === 'image'
                ? `رسالة في المجموعة من ${senderUser?.name || ''}: 📷 صورة`
                : msgType === 'voice'
                  ? `رسالة في المجموعة من ${senderUser?.name || ''}: 🎤 رسالة صوتية`
                  : `رسالة في المجموعة من ${senderUser?.name || ''}: ${(text || '').slice(0, 50)}`;
              db.prepare('INSERT INTO notifications (user_id, type, message, user_id_ref, link) VALUES (?, ?, ?, ?, ?)')
                .run(member.user_id, 'message', notifText, payload.userId, '/messages');

              // ─── FCM push for group members (background/offline) ───
              try {
                const groupName = (db.prepare('SELECT name FROM chat_groups WHERE id = ?').get(groupId) as any)?.name || 'مجموعة';
                sendPushToUser(member.user_id, senderUser?.name || 'مجموعة', notifText, {
                  type: 'message',
                  link: '/#/chat-app?chat=group_' + groupId,
                  messageId,
                  senderId: payload.userId,
                  groupId,
                }).catch(() => {});
              } catch {}
            }
          }
        } else if (receiverId) {
          wsManager.emitChatMessage(receiverId, {
            id: messageId,
            senderId: payload.userId,
            receiverId,
            text: text || '',
            messageType: msgType,
            imageUrl: imageUrl || '',
            postId: postId || null,
            replyToId: replyToId || null,
            voiceUrl: voiceUrl || '',
            voiceDuration: voiceDuration || 0,
            timestamp: new Date().toISOString(),
            senderName: senderUser?.name || '',
            senderAvatar: senderUser?.avatar || '',
          });

          // ─── Send FCM push notification (for background/offline users) ───
          // This is what makes the notification appear when the app is CLOSED
          // or when the device is on a different network. WebSocket only works
          // when the app is open and connected.
          try {
            const pushTitle = senderUser?.name || 'رسالة جديدة';
            const pushBody = msgType === 'image'
              ? '📷 صورة'
              : msgType === 'voice'
                ? '🎤 رسالة صوتية'
                : (text || '').slice(0, 100);
            sendPushToUser(receiverId, pushTitle, pushBody, {
              type: 'message',
              link: '/#/chat-app?chat=' + payload.userId,
              messageId,
              senderId: payload.userId,
            }).catch(() => {});
          } catch {}
        }
      }
    } catch (wsErr: any) {
      console.error('[WS] Failed to emit chat message:', wsErr.message);
    }

    res.status(201).json(message);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إرسال الرسالة', details: err.message });
  }
});

// DELETE /api/chat/messages/:messageId — Soft-delete a message for the current user
router.delete('/messages/:messageId', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { messageId } = req.params;

    const message = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(messageId) as any;
    if (!message) {
      res.status(404).json({ error: 'الرسالة غير موجودة' });
      return;
    }

    // Only allow deleting messages where the user is sender or receiver
    if (message.sender_id !== payload.userId && message.receiver_id !== payload.userId && !message.group_id) {
      res.status(403).json({ error: 'لا يمكنك حذف هذه الرسالة' });
      return;
    }

    // For group messages, allow members to delete for themselves
    if (message.group_id) {
      const membership = db.prepare('SELECT id FROM chat_group_members WHERE group_id = ? AND user_id = ?').get(message.group_id, payload.userId) as any;
      if (!membership && message.sender_id !== payload.userId) {
        res.status(403).json({ error: 'لا يمكنك حذف هذه الرسالة' });
        return;
      }
    }

    // Add userId to deleted_for (comma-separated)
    const deletedFor = message.deleted_for
      ? message.deleted_for.split(',').map((id: string) => id.trim()).filter(Boolean)
      : [];
    if (!deletedFor.includes(payload.userId)) {
      deletedFor.push(payload.userId);
    }
    const newDeletedFor = deletedFor.join(',');

    db.prepare('UPDATE chat_messages SET deleted_for = ? WHERE id = ?').run(newDeletedFor, messageId);

    res.json({ message: 'تم حذف الرسالة' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل حذف الرسالة', details: err.message });
  }
});

// POST /api/chat/messages/:messageId/react — Add/toggle reaction
router.post('/messages/:messageId/react', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { messageId } = req.params;
    const { emoji } = req.body;

    if (!emoji) {
      res.status(400).json({ error: 'الرمز التفاعلي مطلوب' });
      return;
    }

    const message = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(messageId) as any;
    if (!message) {
      res.status(404).json({ error: 'الرسالة غير موجودة' });
      return;
    }

    // Only allow reacting on messages where the user is sender or receiver or group member
    const isParticipant = message.sender_id === payload.userId || message.receiver_id === payload.userId;
    const isGroupMember = message.group_id ? !!db.prepare('SELECT id FROM chat_group_members WHERE group_id = ? AND user_id = ?').get(message.group_id, payload.userId) : false;
    if (!isParticipant && !isGroupMember) {
      res.status(403).json({ error: 'لا يمكنك التفاعل مع هذه الرسالة' });
      return;
    }

    // Parse existing reactions
    let reactions: Record<string, string> = {};
    try {
      reactions = JSON.parse(message.reactions || '{}');
    } catch {
      reactions = {};
    }

    // Toggle reaction
    if (reactions[payload.userId] === emoji) {
      delete reactions[payload.userId];
    } else {
      reactions[payload.userId] = emoji;
    }

    db.prepare('UPDATE chat_messages SET reactions = ? WHERE id = ?').run(JSON.stringify(reactions), messageId);

    res.json({ message: 'تم تحديث التفاعل', reactions });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تحديث التفاعل', details: err.message });
  }
});

// POST /api/chat/upload-image — Upload image for chat
router.post('/upload-image', authMiddleware, chatImageUpload.single('image'), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'لم يتم رفع أي ملف' });
    return;
  }
  const url = `/uploads/chat/${req.file.filename}`;
  // 🔒 RADICAL FIX: back up chat image to HF Dataset so it survives rebuilds
  backupFileToHF(req.file.path);
  res.json({ url, filename: req.file.filename });
});

// ─── Voice Upload Setup ──────────────────────────────────────────────
const chatVoiceStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = path.resolve('uploads/chat/voice');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.webm';
    cb(null, `${crypto.randomBytes(16).toString('hex')}${ext}`);
  },
});
const chatVoiceUpload = multer({
  storage: chatVoiceStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    const allowedMime = /^audio\/|^video\/webm/;
    const allowedExt = /\.webm$|\.ogg$|\.mp3$|\.wav$|\.m4a$|\.mp4$|\.oga$/i;
    const ext = allowedExt.test(path.extname(file.originalname).toLowerCase());
    const mime = allowedMime.test(file.mimetype);
    cb(null, ext || mime);
  },
});

// POST /api/chat/upload-voice — Upload voice note for chat
router.post('/upload-voice', authMiddleware, chatVoiceUpload.single('voice'), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'لم يتم رفع أي ملف صوتي' });
    return;
  }
  const url = `/uploads/chat/voice/${req.file.filename}`;
  // 🔒 RADICAL FIX: back up voice note to HF Dataset so it survives rebuilds
  backupFileToHF(req.file.path);
  res.json({ url, filename: req.file.filename });
});

// PUT /api/chat/messages/:messageId — Edit message
router.put('/messages/:messageId', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { messageId } = req.params;
    const { text } = req.body;

    if (!text || !text.trim()) {
      res.status(400).json({ error: 'النص مطلوب' });
      return;
    }

    const message = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(messageId) as any;
    if (!message) {
      res.status(404).json({ error: 'الرسالة غير موجودة' });
      return;
    }

    // Only sender can edit
    if (message.sender_id !== payload.userId) {
      res.status(403).json({ error: 'لا يمكنك تعديل هذه الرسالة' });
      return;
    }

    // Cannot edit deleted-for-everyone messages
    if (message.deleted_for === 'everyone') {
      res.status(400).json({ error: 'لا يمكن تعديل رسالة محذوفة' });
      return;
    }

    db.prepare('UPDATE chat_messages SET text = ?, is_edited = 1 WHERE id = ?').run(text.trim(), messageId);

    const updatedMessage = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(messageId);

    // Emit WebSocket event to receiver
    try {
      const wsManager = (req.app.locals as any).wsManager;
      if (wsManager) {
        if (message.group_id) {
          // Broadcast edit to all group members
          const groupMembers = db.prepare('SELECT user_id FROM chat_group_members WHERE group_id = ?').all(message.group_id) as any[];
          for (const member of groupMembers) {
            if (member.user_id !== payload.userId) {
              wsManager.sendToUser(member.user_id, {
                type: 'chat:message-edited',
                data: { id: messageId, text: text.trim(), isEdited: true },
              });
            }
          }
        } else {
          wsManager.sendToUser(message.receiver_id, {
            type: 'chat:message-edited',
            data: { id: messageId, text: text.trim(), isEdited: true },
          });
        }
      }
    } catch (wsErr: any) {
      console.error('[WS] Failed to emit message-edited:', wsErr.message);
    }

    res.json(updatedMessage);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تعديل الرسالة', details: err.message });
  }
});

// DELETE /api/chat/messages/:messageId/everyone — Delete for everyone
router.delete('/messages/:messageId/everyone', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { messageId } = req.params;

    const message = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(messageId) as any;
    if (!message) {
      res.status(404).json({ error: 'الرسالة غير موجودة' });
      return;
    }

    // Only sender can delete for everyone
    if (message.sender_id !== payload.userId) {
      res.status(403).json({ error: 'لا يمكنك حذف هذه الرسالة للجميع' });
      return;
    }

    // Mark as deleted for everyone
    db.prepare(
      "UPDATE chat_messages SET text = '', message_type = 'system', image_url = '', deleted_for = 'everyone', voice_url = '', voice_duration = 0 WHERE id = ?"
    ).run(messageId);

    // Emit WebSocket event
    try {
      const wsManager = (req.app.locals as any).wsManager;
      if (wsManager) {
        if (message.group_id) {
          const groupMembers = db.prepare('SELECT user_id FROM chat_group_members WHERE group_id = ?').all(message.group_id) as any[];
          for (const member of groupMembers) {
            if (member.user_id !== payload.userId) {
              wsManager.sendToUser(member.user_id, {
                type: 'chat:message-deleted',
                data: { id: messageId, deletedFor: 'everyone' },
              });
            }
          }
        } else {
          wsManager.sendToUser(message.receiver_id, {
            type: 'chat:message-deleted',
            data: { id: messageId, deletedFor: 'everyone' },
          });
        }
      }
    } catch (wsErr: any) {
      console.error('[WS] Failed to emit message-deleted:', wsErr.message);
    }

    res.json({ message: 'تم حذف الرسالة للجميع' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل حذف الرسالة للجميع', details: err.message });
  }
});

// GET /api/chat/messages/:contactId/search — Search messages
router.get('/messages/:contactId/search', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { contactId } = req.params;
    const { q } = req.query;

    if (!q || typeof q !== 'string' || !q.trim()) {
      res.json([]);
      return;
    }

    const searchTerm = `%${q.trim()}%`;
    const isGroup = contactId.startsWith('group_');
    const groupId = isGroup ? contactId.replace('group_', '') : null;

    let messages: any[];
    if (isGroup && groupId) {
      messages = db.prepare(`
        SELECT * FROM chat_messages
        WHERE group_id = ? AND text LIKE ? AND deleted_for != 'everyone'
        ORDER BY created_at DESC LIMIT 50
      `).all(groupId, searchTerm);
    } else {
      messages = db.prepare(`
        SELECT * FROM chat_messages
        WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
          AND text LIKE ?
          AND deleted_for != 'everyone'
        ORDER BY created_at DESC
        LIMIT 50
      `).all(payload.userId, contactId, contactId, payload.userId, searchTerm);
    }

    res.json(messages);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل البحث في الرسائل', details: err.message });
  }
});

// POST /api/chat/messages/:messageId/pin — Toggle pin status
router.post('/messages/:messageId/pin', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { messageId } = req.params;

    const message = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(messageId) as any;
    if (!message) {
      res.status(404).json({ error: 'الرسالة غير موجودة' });
      return;
    }

    // Only participants can pin
    const isParticipant = message.sender_id === payload.userId || message.receiver_id === payload.userId;
    const isGroupMember = message.group_id ? !!db.prepare('SELECT id FROM chat_group_members WHERE group_id = ? AND user_id = ?').get(message.group_id, payload.userId) : false;
    if (!isParticipant && !isGroupMember) {
      res.status(403).json({ error: 'لا يمكنك تثبيت هذه الرسالة' });
      return;
    }

    const newPinStatus = message.is_pinned ? 0 : 1;
    db.prepare('UPDATE chat_messages SET is_pinned = ? WHERE id = ?').run(newPinStatus, messageId);

    res.json({ message: newPinStatus ? 'تم تثبيت الرسالة' : 'تم إلغاء تثبيت الرسالة', isPinned: !!newPinStatus });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تثبيت الرسالة', details: err.message });
  }
});

// GET /api/chat/messages/:contactId/media — Get shared media
router.get('/messages/:contactId/media', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { contactId } = req.params;

    const isGroup = contactId.startsWith('group_');
    const groupId = isGroup ? contactId.replace('group_', '') : null;

    let media: any[];
    if (isGroup && groupId) {
      media = db.prepare(`
        SELECT * FROM chat_messages
        WHERE group_id = ? AND (message_type = 'image' OR message_type = 'voice') AND deleted_for != 'everyone'
        ORDER BY created_at DESC LIMIT 100
      `).all(groupId);
    } else {
      media = db.prepare(`
        SELECT * FROM chat_messages
        WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
          AND (message_type = 'image' OR message_type = 'voice')
          AND deleted_for != 'everyone'
        ORDER BY created_at DESC
        LIMIT 100
      `).all(payload.userId, contactId, contactId, payload.userId);
    }

    res.json(media);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب الوسائط المشتركة', details: err.message });
  }
});

// ─── Phase 3: Group Chat Routes ─────────────────────────────────────

// POST /api/chat/groups — Create group
router.post('/groups', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { name, avatar, description, memberIds } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({ error: 'اسم المجموعة مطلوب' });
      return;
    }

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      res.status(400).json({ error: 'يجب إضافة عضو واحد على الأقل' });
      return;
    }

    const groupId = crypto.randomBytes(16).toString('hex').toLowerCase();

    db.prepare(`
      INSERT INTO chat_groups (id, name, avatar, description, creator_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(groupId, name.trim(), avatar || '', description || '', payload.userId);

    // Add creator as admin
    db.prepare(`
      INSERT INTO chat_group_members (group_id, user_id, role)
      VALUES (?, ?, 'admin')
    `).run(groupId, payload.userId);

    // Add other members
    const addMember = db.prepare(`
      INSERT OR IGNORE INTO chat_group_members (group_id, user_id, role)
      VALUES (?, ?, 'member')
    `);
    for (const memberId of memberIds) {
      if (memberId !== payload.userId) {
        addMember.run(groupId, memberId);
      }
    }

    const group = db.prepare('SELECT * FROM chat_groups WHERE id = ?').get(groupId);
    const members = db.prepare(`
      SELECT cgm.*, u.name, u.avatar
      FROM chat_group_members cgm
      JOIN users u ON u.id = cgm.user_id
      WHERE cgm.group_id = ?
    `).all(groupId);

    // Notify members via WebSocket
    try {
      const wsManager = (req.app.locals as any).wsManager;
      if (wsManager) {
        const creator = db.prepare('SELECT name, avatar FROM users WHERE id = ?').get(payload.userId) as any;
        for (const memberId of memberIds) {
          if (memberId !== payload.userId) {
            wsManager.sendToUser(memberId, {
              type: 'chat:group-created',
              data: {
                groupId,
                groupName: name.trim(),
                groupAvatar: avatar || '',
                creatorName: creator?.name || '',
                creatorAvatar: creator?.avatar || '',
              },
            });
          }
        }
      }
    } catch (wsErr: any) {
      console.error('[WS] Failed to emit group-created:', wsErr.message);
    }

    res.status(201).json({ ...(group as any || {}), members });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إنشاء المجموعة', details: err.message });
  }
});

// GET /api/chat/groups — Get user's groups
router.get('/groups', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const groups = db.prepare(`
      SELECT cg.* FROM chat_groups cg
      JOIN chat_group_members cgm ON cgm.group_id = cg.id
      WHERE cgm.user_id = ?
      ORDER BY cg.updated_at DESC
    `).all(payload.userId);

    const enriched = (groups as any[]).map(g => {
      const members = db.prepare(`
        SELECT cgm.*, u.name, u.avatar
        FROM chat_group_members cgm
        JOIN users u ON u.id = cgm.user_id
        WHERE cgm.group_id = ?
      `).all(g.id);
      return { ...g, members };
    });

    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب المجموعات', details: err.message });
  }
});

// GET /api/chat/groups/:groupId — Get group details + members
router.get('/groups/:groupId', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { groupId } = req.params;

    const group = db.prepare('SELECT * FROM chat_groups WHERE id = ?').get(groupId) as any;
    if (!group) {
      res.status(404).json({ error: 'المجموعة غير موجودة' });
      return;
    }

    const members = db.prepare(`
      SELECT cgm.*, u.name, u.avatar
      FROM chat_group_members cgm
      JOIN users u ON u.id = cgm.user_id
      WHERE cgm.group_id = ?
    `).all(groupId);

    // Check if user is a member
    const isMember = (members as any[]).some((m: any) => m.user_id === payload.userId);
    if (!isMember) {
      res.status(403).json({ error: 'لست عضواً في هذه المجموعة' });
      return;
    }

    res.json({ ...group, members });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب تفاصيل المجموعة', details: err.message });
  }
});

// PUT /api/chat/groups/:groupId — Update group (admin only)
router.put('/groups/:groupId', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { groupId } = req.params;
    const { name, avatar, description } = req.body;

    const group = db.prepare('SELECT * FROM chat_groups WHERE id = ?').get(groupId) as any;
    if (!group) {
      res.status(404).json({ error: 'المجموعة غير موجودة' });
      return;
    }

    // Only admins can update
    const membership = db.prepare(
      'SELECT role FROM chat_group_members WHERE group_id = ? AND user_id = ?'
    ).get(groupId, payload.userId) as any;
    if (!membership || membership.role !== 'admin') {
      res.status(403).json({ error: 'فقط المشرفون يمكنهم تعديل المجموعة' });
      return;
    }

    const updates: string[] = [];
    const params: any[] = [];
    if (name !== undefined) { updates.push('name = ?'); params.push(name.trim()); }
    if (avatar !== undefined) { updates.push('avatar = ?'); params.push(avatar); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    updates.push("updated_at = datetime('now')");

    if (updates.length > 1) {
      params.push(groupId);
      db.prepare(`UPDATE chat_groups SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    const updatedGroup = db.prepare('SELECT * FROM chat_groups WHERE id = ?').get(groupId);
    res.json(updatedGroup);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تعديل المجموعة', details: err.message });
  }
});

// POST /api/chat/groups/:groupId/members — Add member (admin only)
router.post('/groups/:groupId/members', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { groupId } = req.params;
    const { userId, role } = req.body;

    if (!userId) {
      res.status(400).json({ error: 'معرف المستخدم مطلوب' });
      return;
    }

    // Check admin status
    const membership = db.prepare(
      'SELECT role FROM chat_group_members WHERE group_id = ? AND user_id = ?'
    ).get(groupId, payload.userId) as any;
    if (!membership || membership.role !== 'admin') {
      res.status(403).json({ error: 'فقط المشرفون يمكنهم إضافة أعضاء' });
      return;
    }

    db.prepare(`
      INSERT OR IGNORE INTO chat_group_members (group_id, user_id, role)
      VALUES (?, ?, ?)
    `).run(groupId, userId, role || 'member');

    // Notify the added user
    try {
      const wsManager = (req.app.locals as any).wsManager;
      if (wsManager) {
        const group = db.prepare('SELECT name, avatar FROM chat_groups WHERE id = ?').get(groupId) as any;
        wsManager.sendToUser(userId, {
          type: 'chat:group-created',
          data: { groupId, groupName: group?.name || '', groupAvatar: group?.avatar || '' },
        });
      }
    } catch {}

    res.json({ message: 'تم إضافة العضو' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إضافة العضو', details: err.message });
  }
});

// DELETE /api/chat/groups/:groupId/members/:userId — Remove member (admin only, or user leaving)
router.delete('/groups/:groupId/members/:userId', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { groupId, userId } = req.params;

    // User can remove themselves (leave), or admin can remove others
    if (userId !== payload.userId) {
      const membership = db.prepare(
        'SELECT role FROM chat_group_members WHERE group_id = ? AND user_id = ?'
      ).get(groupId, payload.userId) as any;
      if (!membership || membership.role !== 'admin') {
        res.status(403).json({ error: 'فقط المشرفون يمكنهم إزالة الأعضاء' });
        return;
      }
    }

    // Cannot remove the creator
    const group = db.prepare('SELECT creator_id FROM chat_groups WHERE id = ?').get(groupId) as any;
    if (group && group.creator_id === userId && userId !== payload.userId) {
      res.status(403).json({ error: 'لا يمكن إزالة منشئ المجموعة' });
      return;
    }

    db.prepare('DELETE FROM chat_group_members WHERE group_id = ? AND user_id = ?').run(groupId, userId);

    // If the creator is leaving, delete the group
    if (group && group.creator_id === userId) {
      db.prepare('DELETE FROM chat_group_members WHERE group_id = ?').run(groupId);
      db.prepare('DELETE FROM chat_groups WHERE id = ?').run(groupId);
    }

    res.json({ message: 'تم إزالة العضو' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إزالة العضو', details: err.message });
  }
});

// DELETE /api/chat/groups/:groupId — Delete group (creator only)
router.delete('/groups/:groupId', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { groupId } = req.params;

    const group = db.prepare('SELECT * FROM chat_groups WHERE id = ?').get(groupId) as any;
    if (!group) {
      res.status(404).json({ error: 'المجموعة غير موجودة' });
      return;
    }

    if (group.creator_id !== payload.userId) {
      res.status(403).json({ error: 'فقط منشئ المجموعة يمكنه حذفها' });
      return;
    }

    // Notify all members before deletion
    try {
      const wsManager = (req.app.locals as any).wsManager;
      if (wsManager) {
        const members = db.prepare('SELECT user_id FROM chat_group_members WHERE group_id = ?').all(groupId) as any[];
        for (const member of members) {
          if (member.user_id !== payload.userId) {
            wsManager.sendToUser(member.user_id, {
              type: 'chat:group-deleted',
              data: { groupId, groupName: group.name },
            });
          }
        }
      }
    } catch {}

    db.prepare('DELETE FROM chat_group_members WHERE group_id = ?').run(groupId);
    db.prepare('DELETE FROM chat_groups WHERE id = ?').run(groupId);

    res.json({ message: 'تم حذف المجموعة' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل حذف المجموعة', details: err.message });
  }
});

// POST /api/chat/groups/:groupId/leave — Leave group
router.post('/groups/:groupId/leave', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { groupId } = req.params;

    const group = db.prepare('SELECT * FROM chat_groups WHERE id = ?').get(groupId) as any;
    if (!group) {
      res.status(404).json({ error: 'المجموعة غير موجوعة' });
      return;
    }

    db.prepare('DELETE FROM chat_group_members WHERE group_id = ? AND user_id = ?').run(groupId, payload.userId);

    // If creator leaves, delete the group
    if (group.creator_id === payload.userId) {
      db.prepare('DELETE FROM chat_group_members WHERE group_id = ?').run(groupId);
      db.prepare('DELETE FROM chat_groups WHERE id = ?').run(groupId);
    }

    res.json({ message: 'تم مغادرة المجموعة' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل مغادرة المجموعة', details: err.message });
  }
});

// ─── Phase 3: Forward Message ──────────────────────────────────────

// POST /api/chat/messages/:messageId/forward — Forward message
router.post('/messages/:messageId/forward', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { messageId } = req.params;
    const { targetId, isGroup } = req.body;

    if (!targetId) {
      res.status(400).json({ error: 'الهدف مطلوب' });
      return;
    }

    const originalMessage = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(messageId) as any;
    if (!originalMessage) {
      res.status(404).json({ error: 'الرسالة غير موجودة' });
      return;
    }

    // Check block status for DMs
    if (!isGroup) {
      if (isUserBlocked(payload.userId, targetId)) {
        res.status(403).json({ error: 'لا يمكنك مراسلة مستخدم محظور' });
        return;
      }
      if (isUserBlocked(targetId, payload.userId)) {
        res.status(403).json({ error: 'لا يمكنك مراسلة هذا المستخدم' });
        return;
      }
    }

    // Check group membership
    if (isGroup) {
      const membership = db.prepare(
        'SELECT id FROM chat_group_members WHERE group_id = ? AND user_id = ?'
      ).get(targetId, payload.userId) as any;
      if (!membership) {
        res.status(403).json({ error: 'لست عضواً في هذه المجموعة' });
        return;
      }
    }

    const newMessageId = crypto.randomBytes(16).toString('hex').toLowerCase();
    // For group messages, receiver_id MUST be NULL (FK constraint requires a
    // valid users.id). The legacy code used 'group' here, which caused a
    // foreign-key violation on every forward-to-group.
    const receiverId = isGroup ? null : targetId;
    const groupId = isGroup ? targetId : null;

    // Build forwarded_from: show the original sender name
    let forwardedFrom = '';
    try {
      const sender = db.prepare('SELECT name FROM users WHERE id = ?').get(originalMessage.sender_id) as any;
      forwardedFrom = sender?.name || '';
    } catch {}

    db.prepare(`
      INSERT INTO chat_messages (id, sender_id, receiver_id, text, post_id, message_type, image_url, reply_to_id, reactions, deleted_for, voice_url, voice_duration, group_id, is_forwarded, forwarded_from)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newMessageId, payload.userId, receiverId,
      originalMessage.text || '', null,
      originalMessage.message_type || 'text',
      originalMessage.image_url || '', null,
      '{}', '',
      originalMessage.voice_url || '', originalMessage.voice_duration || 0,
      groupId, 1, forwardedFrom
    );

    const newMessage = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(newMessageId);

    // Emit WebSocket event
    try {
      const wsManager = (req.app.locals as any).wsManager;
      if (wsManager) {
        const senderUser = db.prepare('SELECT name, avatar FROM users WHERE id = ?').get(payload.userId) as any;
        if (isGroup && groupId) {
          const groupMembers = db.prepare('SELECT user_id FROM chat_group_members WHERE group_id = ?').all(groupId) as any[];
          for (const member of groupMembers) {
            if (member.user_id !== payload.userId) {
              wsManager.emitChatMessage(member.user_id, {
                id: newMessageId,
                senderId: payload.userId,
                receiverId: 'group',
                text: originalMessage.text || '',
                messageType: originalMessage.message_type || 'text',
                imageUrl: originalMessage.image_url || '',
                voiceUrl: originalMessage.voice_url || '',
                voiceDuration: originalMessage.voice_duration || 0,
                groupId,
                isForwarded: true,
                forwardedFrom,
                timestamp: new Date().toISOString(),
                senderName: senderUser?.name || '',
                senderAvatar: senderUser?.avatar || '',
              });
            }
          }
        } else {
          wsManager.emitChatMessage(targetId, {
            id: newMessageId,
            senderId: payload.userId,
            receiverId: targetId,
            text: originalMessage.text || '',
            messageType: originalMessage.message_type || 'text',
            imageUrl: originalMessage.image_url || '',
            voiceUrl: originalMessage.voice_url || '',
            voiceDuration: originalMessage.voice_duration || 0,
            isForwarded: true,
            forwardedFrom,
            timestamp: new Date().toISOString(),
            senderName: senderUser?.name || '',
            senderAvatar: senderUser?.avatar || '',
          });
        }
      }
    } catch (wsErr: any) {
      console.error('[WS] Failed to emit forwarded message:', wsErr.message);
    }

    res.status(201).json(newMessage);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تمرير الرسالة', details: err.message });
  }
});

// ─── Phase 3: Mute Notifications ───────────────────────────────────

// POST /api/chat/mute/:targetId — Mute/unmute chat
router.post('/mute/:targetId', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { targetId } = req.params;
    const { isGroup } = req.body;

    const existing = db.prepare(
      'SELECT id FROM chat_mutes WHERE user_id = ? AND target_id = ?'
    ).get(payload.userId, targetId) as any;

    if (existing) {
      db.prepare('DELETE FROM chat_mutes WHERE id = ?').run(existing.id);
      res.json({ message: 'تم إلغاء كتم الإشعارات', isMuted: false });
    } else {
      const muteId = crypto.randomBytes(16).toString('hex').toLowerCase();
      db.prepare(`
        INSERT INTO chat_mutes (id, user_id, target_id, is_group)
        VALUES (?, ?, ?, ?)
      `).run(muteId, payload.userId, targetId, isGroup ? 1 : 0);
      res.json({ message: 'تم كتم الإشعارات', isMuted: true });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تحديث حالة الكتم', details: err.message });
  }
});

// GET /api/chat/mutes — Get muted chats
router.get('/mutes', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const mutes = db.prepare('SELECT target_id, is_group FROM chat_mutes WHERE user_id = ?').all(payload.userId);
    res.json(mutes);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب المحادثات المكتومة', details: err.message });
  }
});

// ─── Phase 3: Block User ───────────────────────────────────────────

// POST /api/chat/block/:userId — Block/unblock user
router.post('/block/:userId', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { userId } = req.params;

    if (userId === payload.userId) {
      res.status(400).json({ error: 'لا يمكنك حظر نفسك' });
      return;
    }

    const existing = db.prepare(
      'SELECT id FROM blocked_users WHERE blocker_id = ? AND blocked_id = ?'
    ).get(payload.userId, userId) as any;

    if (existing) {
      db.prepare('DELETE FROM blocked_users WHERE id = ?').run(existing.id);
      res.json({ message: 'تم إلغاء الحظر', isBlocked: false });
    } else {
      const blockId = crypto.randomBytes(16).toString('hex').toLowerCase();
      db.prepare(`
        INSERT INTO blocked_users (id, blocker_id, blocked_id)
        VALUES (?, ?, ?)
      `).run(blockId, payload.userId, userId);
      res.json({ message: 'تم حظر المستخدم', isBlocked: true });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تحديث حالة الحظر', details: err.message });
  }
});

// GET /api/chat/blocks — Get blocked users
router.get('/blocks', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const blocks = db.prepare(`
      SELECT ub.blocked_id, u.name, u.avatar
      FROM blocked_users ub
      JOIN users u ON u.id = ub.blocked_id
      WHERE ub.blocker_id = ?
    `).all(payload.userId);
    res.json(blocks);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب المستخدمين المحظورين', details: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
// CHAT V2: Disappearing messages + Scheduled messages + AI replies
// ══════════════════════════════════════════════════════════════════

// Helper: get or create conversation key
function getConversationKey(userA: string, userB: string): string {
  return [userA, userB].sort().join('__');
}

// GET /api/chat/conversation/:otherUserId/settings
router.get('/conversation/:otherUserId/settings', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const key = getConversationKey(payload.userId, req.params.otherUserId);
    const settings = db.prepare('SELECT * FROM chat_conversation_settings WHERE conversation_key = ?').get(key) as any;
    res.json(settings || { disappearing_ttl: 0, muted: 0, pinned: 0 });
  } catch {
    res.json({ disappearing_ttl: 0, muted: 0, pinned: 0 });
  }
});

// PATCH /api/chat/conversation/:otherUserId/settings
router.patch('/conversation/:otherUserId/settings', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const key = getConversationKey(payload.userId, req.params.otherUserId);
    const { disappearing_ttl, muted, pinned } = req.body;

    const existing = db.prepare('SELECT id FROM chat_conversation_settings WHERE conversation_key = ?').get(key);
    if (existing) {
      const updates: string[] = [];
      const vals: any[] = [];
      if (disappearing_ttl !== undefined) { updates.push('disappearing_ttl = ?'); vals.push(disappearing_ttl); }
      if (muted !== undefined) { updates.push('muted = ?'); vals.push(muted ? 1 : 0); }
      if (pinned !== undefined) { updates.push('pinned = ?'); vals.push(pinned ? 1 : 0); }
      if (updates.length > 0) {
        updates.push("updated_at = datetime('now')");
        vals.push(key);
        db.prepare(`UPDATE chat_conversation_settings SET ${updates.join(', ')} WHERE conversation_key = ?`).run(...vals);
      }
    } else {
      db.prepare('INSERT INTO chat_conversation_settings (conversation_key, disappearing_ttl, muted, pinned) VALUES (?, ?, ?, ?)').run(
        key, disappearing_ttl || 0, muted ? 1 : 0, pinned ? 1 : 0
      );
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تحديث الإعدادات' });
  }
});

// POST /api/chat/schedule — schedule a message to be sent later
router.post('/schedule', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { receiverId, text, scheduledAt, messageType, imageUrl, voiceUrl, voiceDuration, groupId } = req.body;

    if (!text || !scheduledAt) {
      res.status(400).json({ error: 'النص والوقت المجدول مطلوبان' });
      return;
    }
    if (new Date(scheduledAt) <= new Date()) {
      res.status(400).json({ error: 'الوقت المجدول يجب أن يكون في المستقبل' });
      return;
    }

    const id = crypto.randomBytes(16).toString('hex');
    db.prepare(`
      INSERT INTO chat_messages (id, sender_id, receiver_id, text, message_type, image_url, voice_url, voice_duration, group_id, scheduled_at, is_scheduled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(id, payload.userId, receiverId || null, text, messageType || 'text', imageUrl || '', voiceUrl || '', voiceDuration || 0, groupId || null, scheduledAt);

    res.status(201).json({ id, scheduledAt, success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جدولة الرسالة' });
  }
});

// GET /api/chat/scheduled — list user's scheduled messages
router.get('/scheduled', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const msgs = db.prepare(`
      SELECT m.*, u.name as receiver_name, u.avatar as receiver_avatar
      FROM chat_messages m
      LEFT JOIN users u ON m.receiver_id = u.id
      WHERE m.sender_id = ? AND m.is_scheduled = 1 AND m.scheduled_at > datetime('now')
      ORDER BY m.scheduled_at ASC
    `).all(payload.userId) as any[];
    res.json(msgs);
  } catch {
    res.json([]);
  }
});

// DELETE /api/chat/scheduled/:id — cancel a scheduled message
router.delete('/scheduled/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    db.prepare('DELETE FROM chat_messages WHERE id = ? AND sender_id = ? AND is_scheduled = 1').run(req.params.id, payload.userId);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'فشل الإلغاء' });
  }
});

// POST /api/chat/smart-reply — AI-powered reply suggestions
router.post('/smart-reply', authMiddleware, async (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { lastMessages, otherUserName } = req.body;

    if (!lastMessages || !Array.isArray(lastMessages) || lastMessages.length === 0) {
      res.json({ replies: [] });
      return;
    }

    // Check cache first
    const contextHash = crypto.createHash('md5').update(JSON.stringify(lastMessages)).digest('hex');
    const cached = db.prepare('SELECT replies FROM ai_reply_cache WHERE context_hash = ? AND created_at > datetime(\'now\', \'-1 hour\')').get(contextHash) as any;
    if (cached) {
      res.json({ replies: JSON.parse(cached.replies) });
      return;
    }

    // Generate smart replies based on context
    // Simple heuristic-based suggestions (no LLM call needed — fast + free)
    const lastMsg = lastMessages[lastMessages.length - 1]?.text || '';
    const lastMsgLower = lastMsg.toLowerCase();

    const replies: string[] = [];

    // Greeting patterns
    if (/مرحب|سلام|هلا|اهلا|hi|hello|hey/i.test(lastMsgLower)) {
      replies.push('أهلاً! كيف حالك؟', 'مرحبا 👋', 'هلا والله!');
    }
    // Question patterns
    else if (lastMsg.includes('?') || lastMsg.includes('؟')) {
      replies.push('نعم بالتأكيد!', 'دعني أفكر في ذلك', 'لست متأكدًا، سأخبرك لاحقًا');
    }
    // Thanks patterns
    else if (/شكر|مشكور|thanks|thank/i.test(lastMsgLower)) {
      replies.push('العفو 😊', 'لا شكر على واجب', 'في أي وقت!');
    }
    // Agreement patterns
    else if (/تمام|طيب|اوكي|ok|okay|yes|نعم/i.test(lastMsgLower)) {
      replies.push('تمام، أنا متفق', 'ممتاز 👍', 'خلاص اتفقنا');
    }
    // Default contextual replies
    if (replies.length === 0) {
      replies.push('فهمت 👍', 'تمام', 'أخبرني المزيد', 'سأرد عليك قريبًا');
    }

    // Cache the result
    db.prepare('INSERT OR REPLACE INTO ai_reply_cache (context_hash, replies) VALUES (?, ?)').run(contextHash, JSON.stringify(replies));

    res.json({ replies: replies.slice(0, 4) });
  } catch (err: any) {
    res.json({ replies: [] });
  }
});

// GET /api/chat/search-users-by-phone — search users by phone number
router.get('/search-users-by-phone', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { phone } = req.query;
    if (!phone || (phone as string).length < 4) { res.json([]); return; }

    // Search by phone (exact or partial)
    const users = db.prepare(`
      SELECT id, name, avatar, is_verified, phone
      FROM users
      WHERE phone LIKE ? AND id != ? AND is_deactivated = 0 AND show_phone = 1
      LIMIT 10
    `).all(`%${phone}%`, payload.userId) as any[];

    res.json(users.map(u => ({
      id: u.id,
      name: u.name,
      avatar: u.avatar,
      is_verified: !!u.is_verified,
    })));
  } catch {
    res.json([]);
  }
});

// ══════════════════════════════════════════════════════════════════
// CHAT V3: AI Assistant + In-chat Payments + Translation
// ══════════════════════════════════════════════════════════════════

// ─── AI Assistant: summarize / remind / translate / detect-spam ──

// POST /api/chat/ai/summarize — summarize last N messages in a conversation
router.post('/ai/summarize', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { messages, otherUserName } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length < 3) {
      res.json({ summary: 'لا توجد رسائل كافية للتلخيص' });
      return;
    }

    // Extract text content
    const texts = messages.filter((m: any) => m.message_type === 'text' || !m.message_type).map((m: any) => ({
      who: m.sender_id === payload.userId ? 'أنا' : (otherUserName || 'الطرف الآخر'),
      text: m.text || m.content || '',
    })).filter((m: any) => m.text.trim());

    if (texts.length === 0) {
      res.json({ summary: 'لا توجد نصوص للتلخيص (فقط وسائط)' });
      return;
    }

    // Simple extractive summarization (no LLM needed — fast + free)
    // Find the most important messages by keyword density
    const keywords = ['موعد', 'اجتماع', 'غدًا', 'بكرة', 'الساعة', 'مكان', 'موافق', 'تمام', 'مبلغ', 'فلوس', 'دفع', 'موعد', 'دكتور', 'سفر', 'عمل', 'مشروع', 'اتفاق', 'خلاص', 'ممتاز'];
    const scored = texts.map(t => {
      let score = 0;
      const lowerText = t.text.toLowerCase();
      keywords.forEach(k => { if (lowerText.includes(k)) score += 2; });
      if (t.text.length > 30) score += 1; // longer messages more important
      return { ...t, score };
    });

    const topMessages = scored.filter(t => t.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);

    if (topMessages.length === 0) {
      // Fallback: just show last 3 messages
      const lastFew = texts.slice(-3).map(t => `${t.who}: ${t.text}`).join(' | ');
      res.json({ summary: `آخر ما تم الحديث عنه: ${lastFew}` });
      return;
    }

    const summary = topMessages.map(t => `${t.who}: ${t.text}`).join(' • ');
    res.json({ summary: `أهم ما تم الحديث عنه: ${summary}` });
  } catch (err: any) {
    res.json({ summary: 'فشل التلخيص' });
  }
});

// POST /api/chat/ai/remind — create a reminder from chat context
router.post('/ai/remind', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { title, remindAt, conversationId } = req.body;

    if (!title || !remindAt) {
      res.status(400).json({ error: 'العنوان والوقت مطلوبان' });
      return;
    }

    const id = crypto.randomBytes(16).toString('hex');
    db.prepare('INSERT INTO chat_reminders (id, user_id, conversation_id, title, remind_at) VALUES (?, ?, ?, ?, ?)').run(
      id, payload.userId, conversationId || null, title.slice(0, 200), remindAt
    );

    res.status(201).json({ id, success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إنشاء التذكير' });
  }
});

// GET /api/chat/ai/reminders — list user's reminders
router.get('/ai/reminders', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const reminders = db.prepare('SELECT * FROM chat_reminders WHERE user_id = ? AND is_fired = 0 ORDER BY remind_at ASC').all(payload.userId);
    res.json(reminders);
  } catch { res.json([]); }
});

// DELETE /api/chat/ai/reminders/:id — cancel a reminder
router.delete('/ai/reminders/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    db.prepare('DELETE FROM chat_reminders WHERE id = ? AND user_id = ?').run(req.params.id, payload.userId);
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'فشل' }); }
});

// POST /api/chat/ai/translate — translate a message
router.post('/ai/translate', authMiddleware, (req: Request, res: Response) => {
  try {
    const { messageId, text, targetLang } = req.body;
    if (!text) { res.json({ translated: '' }); return; }
    const lang = targetLang || 'ar';

    // Check cache
    if (messageId) {
      const cached = db.prepare('SELECT translated_text FROM message_translations WHERE message_id = ? AND target_lang = ?').get(messageId, lang) as any;
      if (cached) { res.json({ translated: cached.translated_text }); return; }
    }

    // Simple translation heuristic (no external API — pattern-based)
    const translations: Record<string, Record<string, string>> = {
      // English → Arabic
      'en->ar': {
        'hello': 'مرحبا', 'hi': 'أهلا', 'how are you': 'كيف حالك', 'good morning': 'صباح الخير',
        'good night': 'تصبح على خير', 'thank you': 'شكرا لك', 'thanks': 'شكرا', 'yes': 'نعم',
        'no': 'لا', 'ok': 'تمام', 'okay': 'حسنا', 'bye': 'وداعا', 'see you': 'أراك لاحقا',
        'how much': 'بكم', 'price': 'السعر', 'money': 'مال', 'time': 'الوقت', 'today': 'اليوم',
        'tomorrow': 'غدا', 'yesterday': 'أمس', 'now': 'الآن', 'later': 'لاحقا', 'love': 'حب',
        'friend': 'صديق', 'family': 'عائلة', 'work': 'عمل', 'meeting': 'اجتماع', 'sorry': 'آسف',
      },
      // Arabic → English
      'ar->en': {
        'مرحبا': 'Hello', 'أهلا': 'Hi', 'السلام عليكم': 'Peace be upon you', 'كيف حالك': 'How are you',
        'صباح الخير': 'Good morning', 'مساء الخير': 'Good evening', 'تصبح على خير': 'Good night',
        'شكرا': 'Thank you', 'شكرا لك': 'Thank you', 'نعم': 'Yes', 'لا': 'No', 'تمام': 'OK',
        'حسنا': 'Alright', 'وداعا': 'Bye', 'أراك لاحقا': 'See you later', 'بكم': 'How much',
        'السعر': 'Price', 'مال': 'Money', 'الوقت': 'Time', 'اليوم': 'Today', 'غدا': 'Tomorrow',
        'أمس': 'Yesterday', 'الآن': 'Now', 'لاحقا': 'Later', 'حب': 'Love', 'صديق': 'Friend',
        'عائلة': 'Family', 'عمل': 'Work', 'اجتماع': 'Meeting', 'آسف': 'Sorry', 'مبروك': 'Congratulations',
      },
    };

    const lowerText = text.toLowerCase().trim();
    let translated = '';

    // Detect language and translate
    const isArabic = /[\u0600-\u06FF]/.test(text);
    const direction = isArabic ? 'ar->en' : 'en->ar';
    const dict = translations[direction] || {};

    // Word-by-word translation
    let foundAny = false;
    let result = text;
    for (const [src, dst] of Object.entries(dict)) {
      const regex = new RegExp(src, 'gi');
      if (regex.test(result)) {
        result = result.replace(regex, dst);
        foundAny = true;
      }
    }

    if (foundAny) {
      translated = result;
    } else {
      // Can't translate — return original with a note
      translated = isArabic ? `[EN] ${text}` : `[AR] ${text}`;
    }

    // Cache it
    if (messageId) {
      db.prepare('INSERT OR REPLACE INTO message_translations (message_id, target_lang, translated_text) VALUES (?, ?, ?)').run(messageId, lang, translated);
    }

    res.json({ translated });
  } catch (err: any) {
    res.json({ translated: '' });
  }
});

// POST /api/chat/ai/detect-spam — detect fraudulent/spam messages
router.post('/ai/detect-spam', authMiddleware, (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    if (!text) { res.json({ isSpam: false, risk: 0 }); return; }

    const spamPatterns = [
      { pattern: /اضغط هنا|اكسب|ربح|مجاني|عرض خاص|خصم 100|حقق ثراء/i, weight: 2 },
      { pattern: /http[s]?:\/\//i, weight: 1 },
      { pattern: /واتساب|تيليجرام|انستجرام/i, weight: 1 },
      { pattern: /تحويل فلوس|ادفع|رسوم|مبلغ مقدم/i, weight: 3 },
      { pattern: /0\d{10}|01\d{9}/i, weight: 1 },
      { pattern: /\b\d{16}\b/i, weight: 3 }, // credit card
    ];

    let risk = 0;
    const reasons: string[] = [];
    for (const { pattern, weight } of spamPatterns) {
      if (pattern.test(text)) {
        risk += weight;
        reasons.push(pattern.source.slice(0, 20));
      }
    }

    const isSpam = risk >= 4;
    res.json({ isSpam, risk, reasons: reasons.slice(0, 3) });
  } catch {
    res.json({ isSpam: false, risk: 0 });
  }
});

// ─── In-chat Payments ─────────────────────────────────────────────

// POST /api/chat/payment/send — send money to another user in chat
router.post('/payment/send', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { receiverId, amount, note } = req.body;

    if (!receiverId || !amount || amount <= 0) {
      res.status(400).json({ error: 'المستلم والمبلغ مطلوبان' });
      return;
    }
    if (amount > 100000) {
      res.status(400).json({ error: 'الحد الأقصى للتحويل 100,000 ج.م' });
      return;
    }

    // Check sender balance
    const sender = db.prepare('SELECT wallet_balance, name FROM users WHERE id = ?').get(payload.userId) as any;
    if (!sender) { res.status(404).json({ error: 'المستخدم غير موجود' }); return; }
    if (sender.wallet_balance < amount) {
      res.status(400).json({ error: `رصيدك غير كافٍ (${sender.wallet_balance} ج.م)` });
      return;
    }

    // Check receiver exists
    const receiver = db.prepare('SELECT id, name FROM users WHERE id = ? AND is_deactivated = 0').get(receiverId) as any;
    if (!receiver) { res.status(404).json({ error: 'المستلم غير موجود' }); return; }

    // Create payment record + transfer money in a transaction
    const paymentId = crypto.randomBytes(16).toString('hex');
    const messageId = crypto.randomBytes(16).toString('hex');

    const tx = db.transaction(() => {
      // Deduct from sender
      db.prepare('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?').run(amount, payload.userId);
      // Add to receiver
      db.prepare('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?').run(amount, receiverId);
      // Create payment record
      db.prepare('INSERT INTO chat_payments (id, sender_id, receiver_id, amount, status, note, completed_at) VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'))').run(
        paymentId, payload.userId, receiverId, amount, 'completed', (note || '').slice(0, 200)
      );
      // Create chat message (payment type)
      db.prepare(`
        INSERT INTO chat_messages (id, sender_id, receiver_id, text, message_type, payment_id)
        VALUES (?, ?, ?, ?, 'payment', ?)
      `).run(messageId, payload.userId, receiverId, `💰 تحويل ${amount} ج.م${note ? ' — ' + note : ''}`, paymentId);
      // Create transaction records for both users
      db.prepare('INSERT INTO transactions (id, user_id, type, amount, description, status) VALUES (?, ?, ?, ?, ?, ?)').run(
        crypto.randomBytes(16).toString('hex'), payload.userId, 'chat_send', -amount, `تحويل إلى ${receiver.name}`, 'completed'
      );
      db.prepare('INSERT INTO transactions (id, user_id, type, amount, description, status) VALUES (?, ?, ?, ?, ?, ?)').run(
        crypto.randomBytes(16).toString('hex'), receiverId, 'chat_receive', amount, `استلام من ${sender.name}`, 'completed'
      );
    });
    tx();

    // Trigger backup (money transfer = critical event)
    try {
      const { createEventBackup } = require('../database/backup-system.js');
      createEventBackup('chat_payment');
    } catch {}

    // Notify receiver via WebSocket
    try {
      const ws = (req.app.locals as any).wsManager;
      ws?.sendToUser(receiverId, {
        type: 'chat:payment',
        data: { paymentId, messageId, amount, note, senderName: sender.name },
      });
    } catch {}

    res.status(201).json({
      success: true,
      paymentId,
      messageId,
      newBalance: sender.wallet_balance - amount,
    });
  } catch (err: any) {
    console.error('[CHAT-PAYMENT] Send error:', err);
    res.status(500).json({ error: 'فشل التحويل' });
  }
});

// POST /api/chat/payment/request — request money from another user
router.post('/payment/request', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { receiverId, amount, note } = req.body;

    if (!receiverId || !amount || amount <= 0) {
      res.status(400).json({ error: 'المستلم والمبلغ مطلوبان' });
      return;
    }

    const paymentId = crypto.randomBytes(16).toString('hex');
    const messageId = crypto.randomBytes(16).toString('hex');

    db.prepare(`
      INSERT INTO chat_payments (id, sender_id, receiver_id, amount, status, note)
      VALUES (?, ?, ?, ?, 'pending', ?)
    `).run(paymentId, receiverId, payload.userId, amount, (note || '').slice(0, 200));

    // Create a chat message (payment_request type)
    db.prepare(`
      INSERT INTO chat_messages (id, sender_id, receiver_id, text, message_type, payment_id)
      VALUES (?, ?, ?, ?, 'payment_request', ?)
    `).run(messageId, payload.userId, receiverId, `💸 طلب ${amount} ج.م${note ? ' — ' + note : ''}`, paymentId);

    // Notify the other user
    try {
      const requester = db.prepare('SELECT name FROM users WHERE id = ?').get(payload.userId) as any;
      const ws = (req.app.locals as any).wsManager;
      ws?.sendToUser(receiverId, {
        type: 'chat:payment-request',
        data: { paymentId, messageId, amount, note, requesterName: requester?.name || '' },
      });
    } catch {}

    res.status(201).json({ success: true, paymentId, messageId });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل طلب المبلغ' });
  }
});

// POST /api/chat/payment/:paymentId/accept — accept a payment request
router.post('/payment/:paymentId/accept', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const payment = db.prepare('SELECT * FROM chat_payments WHERE id = ? AND status = ?').get(req.params.paymentId, 'pending') as any;
    if (!payment) { res.status(404).json({ error: 'طلب الدفع غير موجود' }); return; }

    // The receiver of the request (who is being asked to pay) must accept
    if (payment.receiver_id !== payload.userId) {
      res.status(403).json({ error: 'ليس لك قبول هذا الطلب' });
      return;
    }

    // Check balance (receiver_id is the one who pays in a request)
    const payer = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(payload.userId) as any;
    if (payer.wallet_balance < payment.amount) {
      res.status(400).json({ error: `رصيدك غير كافٍ (${payer.wallet_balance} ج.م)` });
      return;
    }

    const tx = db.transaction(() => {
      // Deduct from payer (receiver_id in the payment record)
      db.prepare('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?').run(payment.amount, payment.receiver_id);
      // Add to requester (sender_id in the payment record)
      db.prepare('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?').run(payment.amount, payment.sender_id);
      // Update payment status
      db.prepare("UPDATE chat_payments SET status = 'completed', completed_at = datetime('now') WHERE id = ?").run(payment.id);
    });
    tx();

    try {
      const { createEventBackup } = require('../database/backup-system.js');
      createEventBackup('chat_payment');
    } catch {}

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل قبول الدفع' });
  }
});

// POST /api/chat/payment/:paymentId/reject — reject a payment request
router.post('/payment/:paymentId/reject', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    db.prepare("UPDATE chat_payments SET status = 'rejected' WHERE id = ? AND receiver_id = ? AND status = 'pending'").run(req.params.paymentId, payload.userId);
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'فشل' }); }
});

export default router;
