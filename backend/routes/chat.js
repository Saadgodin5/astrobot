const express = require('express');
const { pool } = require('../db/index');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// POST /api/chat/message
router.post('/message', async (req, res) => {
  try {
    const { message, session_id, audio } = req.body;
    const userId = req.user.id;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Message cannot be empty.' });
    }
    if (message.trim().length > 4000) {
      return res.status(400).json({ success: false, error: 'Message is too long. Maximum 4000 characters.' });
    }

    const n8nWebhookUrl = process.env.N8N_WEBHOOK || 'http://76.13.62.195:5678/webhook/astrobot';

    // Fetch last 15 messages for conversation context (ordered oldest→newest)
    const historyResult = await pool.query(
      `SELECT message, response FROM conversations
       WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 15`,
      [userId]
    );
    const conversationHistory = historyResult.rows.reverse().map(r => ({
      role_user: r.message,
      role_assistant: r.response
    }));

    let botResponse = null;
    let imageUrl = null;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);

      const webhookRes = await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          user_name: req.user.name,
          user_surname: req.user.surname,
          user_email: req.user.email,
          message: message.trim(),
          session_id: session_id || `user_${userId}`,
          audio: audio || null,
          conversation_history: conversationHistory,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (webhookRes.ok) {
        const webhookData = await webhookRes.json();
        // Support various n8n response formats
        botResponse =
          webhookData.response ||
          webhookData.message ||
          webhookData.output ||
          webhookData.text ||
          webhookData.answer ||
          (Array.isArray(webhookData) && webhookData[0]?.response) ||
          (Array.isArray(webhookData) && webhookData[0]?.output) ||
          JSON.stringify(webhookData);

        // Handle image generation response
        imageUrl = webhookData.image_url || webhookData.image || null;
      } else {
        console.error('[CHAT] n8n webhook status:', webhookRes.status);
        botResponse = "I'm having trouble connecting right now. Please try again, Commander.";
      }
    } catch (webhookErr) {
      console.error('[CHAT] n8n webhook error:', webhookErr.message);
      botResponse = "I'm currently offline from my main systems. Please check back shortly, Commander.";
    }

    // Check if AI wants to generate an image
    let parsedAIResponse = null;
    try {
      const cleaned = botResponse.replace(/```json/g, '').replace(/```/g, '').trim();
      parsedAIResponse = JSON.parse(cleaned);
    } catch (e) {
      parsedAIResponse = null;
    }

    if (parsedAIResponse && parsedAIResponse.action === 'generate_image' && parsedAIResponse.image_prompt) {
      botResponse = parsedAIResponse.response || 'Génération en cours...';
      // Call HuggingFace Stability AI
      try {
        const hfController = new AbortController();
        const hfTimeout = setTimeout(() => hfController.abort(), 60000);
        const hfRes = await fetch(
          'https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-xl-base-1.0',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.HF_API_KEY || 'hf_yurxGKSFQBTsadQsfpQBNwrHJKuYGecmx'}`,
            },
            body: JSON.stringify({ inputs: parsedAIResponse.image_prompt }),
            signal: hfController.signal,
          }
        );
        clearTimeout(hfTimeout);
        if (hfRes.ok) {
          const arrayBuffer = await hfRes.arrayBuffer();
          const base64 = Buffer.from(arrayBuffer).toString('base64');
          const contentType = hfRes.headers.get('content-type') || 'image/jpeg';
          imageUrl = `data:${contentType};base64,${base64}`;
        } else {
          console.error('[IMAGE] HuggingFace error:', hfRes.status, await hfRes.text());
        }
      } catch (hfErr) {
        console.error('[IMAGE] HuggingFace fetch error:', hfErr.message);
      }
    } else if (parsedAIResponse && parsedAIResponse.response) {
      // AI returned valid JSON with response field — use it directly
      botResponse = parsedAIResponse.response;
    }

    // Save conversation to DB
    const result = await pool.query(
      `INSERT INTO conversations (user_id, message, response)
       VALUES ($1, $2, $3)
       RETURNING id, message, response, created_at`,
      [userId, message.trim(), botResponse]
    );

    const conversation = result.rows[0];

    return res.status(200).json({
      success: true,
      data: {
        id: conversation.id,
        message: conversation.message,
        response: conversation.response,
        image_url: imageUrl,
        createdAt: conversation.created_at,
      },
    });
  } catch (err) {
    console.error('[CHAT] Message error:', err.message);
    return res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// DELETE /api/chat/:id
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM conversations WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Conversation not found.' });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[CHAT] Delete error:', err.message);
    return res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// GET /api/chat/history
router.get('/history', async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT id, message, response, created_at
       FROM conversations
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    );

    // Return in chronological order (oldest first)
    const conversations = result.rows.reverse();

    return res.status(200).json({
      success: true,
      data: conversations.map((c) => ({
        id: c.id,
        message: c.message,
        response: c.response,
        createdAt: c.created_at,
      })),
      count: conversations.length,
    });
  } catch (err) {
    console.error('[CHAT] History error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Internal server error. Please try again later.',
    });
  }
});

module.exports = router;
