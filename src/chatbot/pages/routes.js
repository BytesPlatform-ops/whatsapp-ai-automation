const express = require('express');
const { getClient } = require('../db/clients');

const router = express.Router();

function buildDemoPage(client, config) {
  const color = config.widget_color || '#1A73E8';
  const name = escapeHtml(config.business_name);
  const chatbotName = escapeHtml(config.chatbot_name);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${chatbotName} - Live Demo</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; overflow: hidden; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(145deg, #e8ecf4 0%, #d5dbe8 50%, #e2e6f0 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px;
      -webkit-font-smoothing: antialiased;
    }

    .page-wrapper {
      width: 100%;
      max-width: 520px;
      height: calc(100vh - 64px);
      max-height: 780px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .page-header {
      text-align: center;
      flex-shrink: 0;
    }
    .page-header .badge {
      display: inline-block;
      background: rgba(255,255,255,0.7);
      color: ${color};
      font-size: 11px;
      font-weight: 600;
      padding: 5px 14px;
      border-radius: 20px;
      margin-bottom: 12px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      backdrop-filter: blur(8px);
    }
    .page-header h1 {
      font-size: 26px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 6px;
      letter-spacing: -0.025em;
    }
    .page-header p {
      font-size: 15px;
      color: #6b7280;
    }

    #chat-embed {
      flex: 1;
      min-height: 0;
      border-radius: 20px;
      overflow: hidden;
    }

    .page-footer {
      text-align: center;
      font-size: 11px;
      color: #8892a4;
      flex-shrink: 0;
      padding: 2px 0;
    }
    .page-footer a { color: #6b7280; text-decoration: none; font-weight: 500; }
    .page-footer a:hover { color: #374151; }

    @media (max-width: 480px) {
      body { padding: 0; background: #fff; }
      .page-wrapper { max-width: 100%; height: 100vh; max-height: none; gap: 0; }
      .page-header { padding: 16px 20px 12px; background: #fff; }
      .page-header .badge { margin-bottom: 8px; background: ${color}10; }
      .page-header h1 { font-size: 20px; }
      #chat-embed { border-radius: 0; flex: 1; }
      .page-footer { padding: 8px; background: #fff; }
    }
  </style>
</head>
<body>
  <div class="page-wrapper">
    <div class="page-header">
      <div class="badge">Live Demo</div>
      <h1>Chat with ${name}</h1>
      <p>Ask anything your customers would ask</p>
    </div>
    <div id="chat-embed"></div>
    <div class="page-footer">Powered by <a href="https://bytesplatform.com" target="_blank">Bytes Platform</a></div>
  </div>
  <script src="/widget.js" data-client-id="${escapeHtml(client.client_id)}" data-embedded="true" data-container="chat-embed"></script>
</body>
</html>`;
}

function buildStandalonePage(client, config) {
  const color = config.widget_color || '#1A73E8';
  const name = escapeHtml(config.business_name);
  const chatbotName = escapeHtml(config.chatbot_name);
  const description = `Chat with ${name} - Get instant answers to your questions`;

  const logoHtml = config.logo_url
    ? `<img src="${escapeHtml(config.logo_url)}" alt="${name}" class="brand-logo">`
    : `<div class="brand-icon" style="background:${color}">${name.charAt(0)}</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${name} - Chat With Us</title>
  <meta name="description" content="${description}">
  <meta property="og:title" content="${name} - Chat With Us">
  <meta property="og:description" content="${description}">
  ${config.logo_url ? `<meta property="og:image" content="${escapeHtml(config.logo_url)}">` : ''}
  <meta property="og:type" content="website">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; overflow: hidden; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(145deg, #e8ecf4 0%, #d5dbe8 50%, #e2e6f0 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px;
      -webkit-font-smoothing: antialiased;
    }

    .page-wrapper {
      width: 100%;
      max-width: 520px;
      height: calc(100vh - 64px);
      max-height: 780px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .page-header {
      display: flex;
      align-items: center;
      gap: 14px;
      flex-shrink: 0;
      padding: 0 4px;
    }
    .brand-logo {
      width: 44px;
      height: 44px;
      border-radius: 14px;
      object-fit: cover;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .brand-icon {
      width: 44px;
      height: 44px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-weight: 700;
      font-size: 20px;
      flex-shrink: 0;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .page-header h1 {
      font-size: 20px;
      font-weight: 700;
      color: #111827;
      letter-spacing: -0.02em;
    }
    .page-header p {
      font-size: 13px;
      color: #6b7280;
      margin-top: 2px;
    }

    #chat-embed {
      flex: 1;
      min-height: 0;
      border-radius: 20px;
      overflow: hidden;
    }

    .page-footer {
      text-align: center;
      font-size: 11px;
      color: #8892a4;
      flex-shrink: 0;
      padding: 2px 0;
    }
    .page-footer a { color: #6b7280; text-decoration: none; font-weight: 500; }
    .page-footer a:hover { color: #374151; }

    @media (max-width: 480px) {
      body { padding: 0; background: #fff; }
      .page-wrapper { max-width: 100%; height: 100vh; max-height: none; gap: 0; }
      .page-header { padding: 14px 20px; border-bottom: 1px solid #f0f0f0; }
      #chat-embed { border-radius: 0; flex: 1; }
      .page-footer { padding: 8px; border-top: 1px solid #f0f0f0; }
    }
  </style>
</head>
<body>
  <div class="page-wrapper">
    <div class="page-header">
      ${logoHtml}
      <div>
        <h1>${name}</h1>
        <p>Chat with us - we're here to help</p>
      </div>
    </div>
    <div id="chat-embed"></div>
    <div class="page-footer"><a href="https://bytesplatform.com" target="_blank">Powered by Bytes Platform</a></div>
  </div>
  <script src="/widget.js" data-client-id="${escapeHtml(client.client_id)}" data-embedded="true" data-container="chat-embed"></script>
</body>
</html>`;
}

function buildErrorPage(title, message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', -apple-system, sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f0f2f5; color: #6b7280; text-align: center; padding: 24px; -webkit-font-smoothing: antialiased; }
    .error { max-width: 360px; }
    .error-icon { width: 64px; height: 64px; border-radius: 50%; background: #f3f4f6; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; }
    .error-icon svg { width: 28px; height: 28px; fill: #9ca3af; }
    h1 { font-size: 20px; font-weight: 600; color: #374151; margin-bottom: 8px; }
    p { font-size: 15px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="error">
    <div class="error-icon"><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg></div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// GET /demo/:slug
router.get('/demo/:slug', async (req, res) => {
  try {
    const client = await getClient(req.params.slug);
    if (!client) {
      return res.status(404).send(buildErrorPage('Not Found', 'This demo is no longer available.'));
    }
    if (client.status === 'cancelled' || client.status === 'paused') {
      return res.status(200).send(buildErrorPage('Offline', 'This chatbot is currently offline.'));
    }

    const config = {
      business_name: client.business_name,
      chatbot_name: client.chatbot_name || `${client.business_name} Assistant`,
      welcome_message: client.welcome_message,
      widget_color: client.widget_color,
      logo_url: client.logo_url,
      status: client.status,
    };

    res.send(buildDemoPage(client, config));
  } catch (error) {
    res.status(500).send(buildErrorPage('Error', 'Something went wrong. Please try again.'));
  }
});

// GET /chat/:slug
router.get('/chat/:slug', async (req, res) => {
  try {
    const client = await getClient(req.params.slug);
    if (!client) {
      return res.status(404).send(buildErrorPage('Not Found', 'This page is no longer available.'));
    }
    if (client.status === 'cancelled' || client.status === 'paused') {
      return res.status(200).send(buildErrorPage('Offline', 'This chatbot is currently offline.'));
    }

    const config = {
      business_name: client.business_name,
      chatbot_name: client.chatbot_name || `${client.business_name} Assistant`,
      welcome_message: client.welcome_message,
      widget_color: client.widget_color,
      logo_url: client.logo_url,
      status: client.status,
    };

    res.send(buildStandalonePage(client, config));
  } catch (error) {
    res.status(500).send(buildErrorPage('Error', 'Something went wrong. Please try again.'));
  }
});

module.exports = router;
