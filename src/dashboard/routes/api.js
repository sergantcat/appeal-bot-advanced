const express = require('express');
const router = express.Router();
const db = require('../../database');

// Auth middleware for API
function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

function requireGuildAccess(req, res, next) {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
  const guildId = req.params.guildId;
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(id => id.trim());
  if (adminIds.includes(req.user.id)) return next();
  const userGuild = (req.user.guilds || []).find(g => g.id === guildId);
  if (userGuild && (userGuild.permissions & 0x20) === 0x20) return next();
  res.status(403).json({ error: 'Forbidden' });
}

// ============ Guild Settings ============
router.post('/:guildId/settings', requireAuth, requireGuildAccess, (req, res) => {
  try {
    const { guildId } = req.params;
    const allowedFields = [
      'log_channel_id', 'stats_channel_id', 'evidence_channel_id',
      'discussion_channel_id', 'moderation_channel_id', 'admin_channel_id',
      'staff_role_id', 'admin_role_id', 'manager_role_id',
      'cooldown_seconds', 'max_active_appeals', 'auto_thread',
      'require_evidence', 'allow_reopen', 'dm_notifications', 'anonymous_appeals',
    ];

    const data = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        if (['cooldown_seconds', 'max_active_appeals'].includes(field)) {
          data[field] = parseInt(req.body[field]) || 0;
        } else if (['auto_thread', 'require_evidence', 'allow_reopen', 'dm_notifications', 'anonymous_appeals'].includes(field)) {
          data[field] = req.body[field] === 'on' || req.body[field] === '1' || req.body[field] === true ? 1 : 0;
        } else {
          data[field] = req.body[field];
        }
      }
    }

    // Handle checkboxes that aren't sent when unchecked
    for (const checkbox of ['auto_thread', 'require_evidence', 'allow_reopen', 'dm_notifications', 'anonymous_appeals']) {
      if (data[checkbox] === undefined) {
        data[checkbox] = 0;
      }
    }

    db.upsertGuildSettings(guildId, data);
    res.redirect(`/dashboard/${guildId}/settings?saved=1`);
  } catch (error) {
    console.error('Error saving settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ Appeal Types ============
router.post('/:guildId/appeal-types', requireAuth, requireGuildAccess, (req, res) => {
  try {
    const { guildId } = req.params;
    const { type_key, label, description, channel_id, emoji, color, button_style,
      embed_title, embed_description, embed_color, embed_thumbnail, embed_image, embed_footer } = req.body;

    db.createAppealType({
      guild_id: guildId,
      type_key: type_key.toLowerCase().replace(/\s+/g, '_'),
      label,
      description: description || '',
      channel_id: channel_id || '',
      emoji: emoji || '',
      color: color || '#5865F2',
      button_style: button_style || 'PRIMARY',
      embed_title: embed_title || '',
      embed_description: embed_description || '',
      embed_color: embed_color || '#5865F2',
      embed_thumbnail: embed_thumbnail || '',
      embed_image: embed_image || '',
      embed_footer: embed_footer || '',
      sort_order: db.getAppealTypes(guildId).length,
    });

    res.redirect(`/dashboard/${guildId}/appeal-types?saved=1`);
  } catch (error) {
    console.error('Error creating appeal type:', error);
    res.redirect(`/dashboard/${guildId}/appeal-types?error=` + encodeURIComponent(error.message));
  }
});

router.post('/:guildId/appeal-types/:typeId', requireAuth, requireGuildAccess, (req, res) => {
  try {
    const { guildId, typeId } = req.params;
    const { label, description, channel_id, emoji, color, button_style, enabled,
      embed_title, embed_description, embed_color, embed_thumbnail, embed_image, embed_footer } = req.body;

    db.updateAppealType(parseInt(typeId), {
      label,
      description: description || '',
      channel_id: channel_id || '',
      emoji: emoji || '',
      color: color || '#5865F2',
      button_style: button_style || 'PRIMARY',
      enabled: enabled === 'on' || enabled === '1' ? 1 : 0,
      embed_title: embed_title || '',
      embed_description: embed_description || '',
      embed_color: embed_color || '#5865F2',
      embed_thumbnail: embed_thumbnail || '',
      embed_image: embed_image || '',
      embed_footer: embed_footer || '',
    });

    res.redirect(`/dashboard/${guildId}/appeal-types?saved=1`);
  } catch (error) {
    console.error('Error updating appeal type:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:guildId/appeal-types/:typeId/delete', requireAuth, requireGuildAccess, (req, res) => {
  try {
    const { guildId, typeId } = req.params;
    db.deleteQuestionsByType(parseInt(typeId));
    db.deleteAppealType(parseInt(typeId));
    res.redirect(`/dashboard/${guildId}/appeal-types?deleted=1`);
  } catch (error) {
    console.error('Error deleting appeal type:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ Questions ============
router.post('/:guildId/appeal-types/:typeId/questions', requireAuth, requireGuildAccess, (req, res) => {
  try {
    const { guildId, typeId } = req.params;
    const { question_label, question_placeholder, question_style, required, max_length } = req.body;

    const existingQuestions = db.getQuestions(parseInt(typeId));

    db.createQuestion({
      appeal_type_id: parseInt(typeId),
      question_label,
      question_placeholder: question_placeholder || '',
      question_style: question_style || 'short',
      required: required === 'on' || required === '1' ? 1 : 0,
      max_length: parseInt(max_length) || 1024,
      sort_order: existingQuestions.length,
    });

    res.redirect(`/dashboard/${guildId}/appeal-types?saved=1`);
  } catch (error) {
    console.error('Error creating question:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:guildId/questions/:questionId/delete', requireAuth, requireGuildAccess, (req, res) => {
  try {
    const { guildId, questionId } = req.params;
    db.deleteQuestion(parseInt(questionId));
    res.redirect(`/dashboard/${guildId}/appeal-types?saved=1`);
  } catch (error) {
    console.error('Error deleting question:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ Blacklist ============
router.post('/:guildId/blacklist', requireAuth, requireGuildAccess, (req, res) => {
  try {
    const { guildId } = req.params;
    const { user_id, reason } = req.body;

    db.addToBlacklist({
      guild_id: guildId,
      user_id,
      reason: reason || '',
      added_by: req.user.id,
      added_by_tag: `${req.user.username}#${req.user.discriminator}`,
    });

    res.redirect(`/dashboard/${guildId}/blacklist?saved=1`);
  } catch (error) {
    console.error('Error adding to blacklist:', error);
    res.redirect(`/dashboard/${guildId}/blacklist?error=` + encodeURIComponent('User may already be blacklisted'));
  }
});

router.post('/:guildId/blacklist/:userId/delete', requireAuth, requireGuildAccess, (req, res) => {
  try {
    const { guildId, userId } = req.params;
    db.removeFromBlacklist(guildId, userId);
    res.redirect(`/dashboard/${guildId}/blacklist?deleted=1`);
  } catch (error) {
    console.error('Error removing from blacklist:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ Auto Responses ============
router.post('/:guildId/auto-responses', requireAuth, requireGuildAccess, (req, res) => {
  try {
    const { guildId } = req.params;
    const { trigger_status, appeal_type, message_template, dm_user } = req.body;

    db.createAutoResponse({
      guild_id: guildId,
      trigger_status,
      appeal_type: appeal_type || '',
      message_template: message_template || '',
      dm_user: dm_user === 'on' || dm_user === '1' ? 1 : 0,
      enabled: 1,
    });

    res.redirect(`/dashboard/${guildId}/auto-responses?saved=1`);
  } catch (error) {
    console.error('Error creating auto response:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:guildId/auto-responses/:responseId/delete', requireAuth, requireGuildAccess, (req, res) => {
  try {
    const { guildId, responseId } = req.params;
    db.deleteAutoResponse(parseInt(responseId));
    res.redirect(`/dashboard/${guildId}/auto-responses?deleted=1`);
  } catch (error) {
    console.error('Error deleting auto response:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ Templates ============
router.post('/:guildId/templates', requireAuth, requireGuildAccess, (req, res) => {
  try {
    const { guildId } = req.params;
    const { name, content, category } = req.body;

    db.createTemplate({
      guild_id: guildId,
      name,
      content: content || '',
      category: category || 'general',
    });

    res.redirect(`/dashboard/${guildId}/templates?saved=1`);
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:guildId/templates/:templateId/delete', requireAuth, requireGuildAccess, (req, res) => {
  try {
    const { guildId, templateId } = req.params;
    db.deleteTemplate(parseInt(templateId));
    res.redirect(`/dashboard/${guildId}/templates?deleted=1`);
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ Appeal Actions (from dashboard) ============
router.post('/:guildId/appeals/:appealId/status', requireAuth, requireGuildAccess, (req, res) => {
  try {
    const { guildId, appealId } = req.params;
    const { status, notes } = req.body;

    const appeal = db.getAppeal(parseInt(appealId));
    if (!appeal || appeal.guild_id !== guildId) {
      return res.status(404).json({ error: 'Appeal not found' });
    }

    const updateData = { status };
    if (status === 'approved') updateData.resolution_notes = notes || '';
    if (status === 'denied') updateData.denial_reason = notes || '';
    if (['approved', 'denied', 'closed'].includes(status)) updateData.closed_at = new Date().toISOString();

    db.updateAppeal(parseInt(appealId), updateData);

    db.addAppealLog({
      appeal_id: parseInt(appealId),
      guild_id: guildId,
      action: status,
      actor_id: req.user.id,
      actor_tag: `${req.user.username}#${req.user.discriminator}`,
      details: notes || `Status changed to ${status}`,
    });

    res.redirect(`/dashboard/${guildId}/appeals/${appealId}?updated=1`);
  } catch (error) {
    console.error('Error updating appeal:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
