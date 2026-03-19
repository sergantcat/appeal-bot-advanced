const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const helmet = require('helmet');
const path = require('path');
const db = require('../database');

const app = express();

// Security
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "cdn.tailwindcss.com", "cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "cdn.tailwindcss.com", "cdnjs.cloudflare.com", "fonts.googleapis.com"],
      fontSrc: ["'self'", "fonts.gstatic.com", "cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "cdn.discordapp.com", "data:", "https:"],
      connectSrc: ["'self'"],
    },
  },
}));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use('/public', express.static(path.join(__dirname, 'public')));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session
const SQLiteStore = require('connect-sqlite3')(session);
app.use(session({
  store: new SQLiteStore({
    db: 'sessions.db',
    dir: path.join(__dirname, '..', '..', 'data'),
  }),
  secret: process.env.SESSION_SECRET || 'appeal-bot-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    secure: process.env.NODE_ENV === 'production' && process.env.DASHBOARD_URL && process.env.DASHBOARD_URL.startsWith('https'),
  },
}));

// Passport
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3000';

if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
  passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: `${DASHBOARD_URL}/auth/callback`,
    scope: ['identify', 'guilds'],
  }, (accessToken, refreshToken, profile, done) => {
    profile.accessToken = accessToken;
    return done(null, profile);
  }));
}

app.use(passport.initialize());
app.use(passport.session());

// Make user available to all views
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  res.locals.dashboardUrl = DASHBOARD_URL;
  next();
});

// Auth middleware
function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/auth/login');
}

function requireGuildAccess(req, res, next) {
  if (!req.isAuthenticated()) return res.redirect('/auth/login');

  const guildId = req.params.guildId;
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(id => id.trim());

  // Check if user is admin
  if (adminIds.includes(req.user.id)) return next();

  // Check if user has the guild with manage permissions
  const userGuild = (req.user.guilds || []).find(g => g.id === guildId);
  if (userGuild && (userGuild.permissions & 0x20) === 0x20) return next();

  res.status(403).render('error', { title: 'Access Denied', message: 'You do not have permission to manage this server.' });
}

// ============ Auth Routes ============
app.get('/auth/login', passport.authenticate('discord'));

app.get('/auth/callback',
  passport.authenticate('discord', { failureRedirect: '/' }),
  (req, res) => res.redirect('/dashboard')
);

app.get('/auth/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});

// ============ Page Routes ============
app.get('/', (req, res) => {
  res.render('index', { title: 'Appeal Bot - Home' });
});

app.get('/dashboard', requireAuth, (req, res) => {
  const client = require('../bot/client');
  const guilds = (req.user.guilds || []).filter(g => {
    const hasPermission = (g.permissions & 0x20) === 0x20;
    const botInGuild = client.guilds.cache.has(g.id);
    return hasPermission && botInGuild;
  });

  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(id => id.trim());
  const isAdmin = adminIds.includes(req.user.id);

  res.render('dashboard', { title: 'Dashboard', guilds, isAdmin });
});

// ============ Guild Dashboard Routes ============
app.get('/dashboard/:guildId', requireAuth, requireGuildAccess, (req, res) => {
  const { guildId } = req.params;
  const client = require('../bot/client');
  const guild = client.guilds.cache.get(guildId);

  if (!guild) return res.redirect('/dashboard');

  const settings = db.getGuildSettings(guildId) || {};
  const appealTypes = db.getAppealTypes(guildId);
  const stats = db.getStats(guildId);

  res.render('guild/overview', {
    title: `${guild.name} - Overview`,
    guild,
    settings,
    appealTypes,
    stats,
    activeTab: 'overview',
  });
});

app.get('/dashboard/:guildId/settings', requireAuth, requireGuildAccess, (req, res) => {
  const { guildId } = req.params;
  const client = require('../bot/client');
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return res.redirect('/dashboard');

  const settings = db.getGuildSettings(guildId) || {};
  const channels = guild.channels.cache
    .filter(c => c.type === 0 || c.type === 5)
    .map(c => ({ id: c.id, name: c.name, type: c.type }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const roles = guild.roles.cache
    .filter(r => r.id !== guild.id)
    .map(r => ({ id: r.id, name: r.name, color: r.hexColor }))
    .sort((a, b) => b.position - a.position);

  res.render('guild/settings', {
    title: `${guild.name} - Settings`,
    guild,
    settings,
    channels,
    roles,
    activeTab: 'settings',
  });
});

app.get('/dashboard/:guildId/appeal-types', requireAuth, requireGuildAccess, (req, res) => {
  const { guildId } = req.params;
  const client = require('../bot/client');
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return res.redirect('/dashboard');

  const appealTypes = db.getAppealTypes(guildId);
  const channels = guild.channels.cache
    .filter(c => c.type === 0 || c.type === 5)
    .map(c => ({ id: c.id, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Get questions for each type
  const typesWithQuestions = appealTypes.map(type => ({
    ...type,
    questions: db.getQuestions(type.id),
  }));

  res.render('guild/appealTypes', {
    title: `${guild.name} - Appeal Types`,
    guild,
    appealTypes: typesWithQuestions,
    channels,
    activeTab: 'appeal-types',
  });
});

app.get('/dashboard/:guildId/appeals', requireAuth, requireGuildAccess, (req, res) => {
  const { guildId } = req.params;
  const client = require('../bot/client');
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return res.redirect('/dashboard');

  const status = req.query.status || '';
  const type = req.query.type || '';
  const filters = {};
  if (status) filters.status = status;
  if (type) filters.appeal_type = type;

  const appeals = db.getAppeals(guildId, filters);
  const appealTypes = db.getAppealTypes(guildId);

  res.render('guild/appeals', {
    title: `${guild.name} - Appeals`,
    guild,
    appeals,
    appealTypes,
    activeTab: 'appeals',
    filters: { status, type },
  });
});

app.get('/dashboard/:guildId/appeals/:appealId', requireAuth, requireGuildAccess, (req, res) => {
  const { guildId, appealId } = req.params;
  const client = require('../bot/client');
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return res.redirect('/dashboard');

  const appeal = db.getAppeal(parseInt(appealId));
  if (!appeal || appeal.guild_id !== guildId) return res.redirect(`/dashboard/${guildId}/appeals`);

  const logs = db.getAppealLogs(parseInt(appealId));

  res.render('guild/appealDetail', {
    title: `Appeal #${appealId}`,
    guild,
    appeal,
    logs,
    activeTab: 'appeals',
  });
});

app.get('/dashboard/:guildId/blacklist', requireAuth, requireGuildAccess, (req, res) => {
  const { guildId } = req.params;
  const client = require('../bot/client');
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return res.redirect('/dashboard');

  const blacklist = db.getBlacklist(guildId);

  res.render('guild/blacklist', {
    title: `${guild.name} - Blacklist`,
    guild,
    blacklist,
    activeTab: 'blacklist',
  });
});

app.get('/dashboard/:guildId/auto-responses', requireAuth, requireGuildAccess, (req, res) => {
  const { guildId } = req.params;
  const client = require('../bot/client');
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return res.redirect('/dashboard');

  const autoResponses = db.getAutoResponses(guildId);
  const appealTypes = db.getAppealTypes(guildId);

  res.render('guild/autoResponses', {
    title: `${guild.name} - Auto Responses`,
    guild,
    autoResponses,
    appealTypes,
    activeTab: 'auto-responses',
  });
});

app.get('/dashboard/:guildId/templates', requireAuth, requireGuildAccess, (req, res) => {
  const { guildId } = req.params;
  const client = require('../bot/client');
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return res.redirect('/dashboard');

  const templates = db.getTemplates(guildId);

  res.render('guild/templates', {
    title: `${guild.name} - Templates`,
    guild,
    templates,
    activeTab: 'templates',
  });
});

app.get('/dashboard/:guildId/logs', requireAuth, requireGuildAccess, (req, res) => {
  const { guildId } = req.params;
  const client = require('../bot/client');
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return res.redirect('/dashboard');

  const appeals = db.getAppeals(guildId, { limit: 100 });
  const allLogs = [];
  for (const appeal of appeals) {
    const logs = db.getAppealLogs(appeal.id);
    allLogs.push(...logs.map(l => ({ ...l, appeal })));
  }
  allLogs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  res.render('guild/logs', {
    title: `${guild.name} - Logs`,
    guild,
    logs: allLogs.slice(0, 200),
    activeTab: 'logs',
  });
});

// ============ API Routes ============
const apiRouter = require('./routes/api');
app.use('/api', apiRouter);

module.exports = app;
