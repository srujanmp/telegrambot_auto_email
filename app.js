// Required packages
const express = require('express');
const readline = require('readline');
const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');
const { google } = require('googleapis');

require('dotenv').config();

// For dynamic import of node-fetch
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

// ========== CONFIG (Use environment variables) ==========
const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const openaiApiKey = process.env.OPENAI_API_KEY;

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth2callback';

const userEmail = process.env.GMAIL_USER_EMAIL; // the Gmail you're sending emails from
const refreshToken = process.env.GMAIL_REFRESH_TOKEN; // must be set after OAuth

if (!telegramToken || !openaiApiKey || !CLIENT_ID || !CLIENT_SECRET || !userEmail) {
  console.error('❌ Please set all required environment variables!');
  process.exit(1);
}

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: openaiApiKey });

const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
if (refreshToken) {
  oAuth2Client.setCredentials({ refresh_token: refreshToken });
}

// Initialize Telegram bot with polling off; will start after auth
const bot = new TelegramBot(telegramToken, { polling: false });

// ========= FUNCTION TO ASK FOR CODE (CLI fallback) =========
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

// ========== AI Email Extraction ==========
async function getEmailDataFromAI(message) {
  const prompt = `
You are an email assistant. Analyze the following message and respond with a JSON object in this exact format:
{"email": "recipient@example.com", "subject": "email subject", "body": "email content"}

Message to analyze: ${message}
`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-r1-0528-qwen3-8b:free',
        messages: [
          { role: 'system', content: 'You are a helpful AI that extracts email data as structured JSON.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
      }),
    });

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('No response from model');

    const jsonMatch = text.match(/\{.*\}/s);
    if (!jsonMatch) throw new Error('No JSON found in output');

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.email || !parsed.subject || !parsed.body) {
      throw new Error('Missing required fields in AI output');
    }

    return {
      to: parsed.email,
      subject: parsed.subject,
      body: parsed.body,
    };
  } catch (error) {
    console.error('AI parse error:', error.message);
    return null;
  }
}

// ========== Send Email ==========

async function sendMail({ to, subject, body }) {
  try {
    // Get fresh access token using OAuth2 client
    const accessTokenResponse = await oAuth2Client.getAccessToken();
    const accessToken = accessTokenResponse.token;
    if (!accessToken) throw new Error('Failed to get access token');

    // Initialize Gmail API client
    const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

    // Construct the email message in RFC 2822 format
    const emailLines = [
      `From: "Email Bot" <${userEmail}>`,
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      body,
    ];
    const email = emailLines.join('\r\n');

    // Encode message in base64url
    const encodedMessage = Buffer.from(email)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Send email using gmail.users.messages.send
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    console.log(`Email sent! Message ID: ${res.data.id}`);
    return res.data;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}


// ========== Start Telegram Bot ==========
function startTelegramBot() {
  bot.startPolling();

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    console.log('Received message:', text);

    const emailData = await getEmailDataFromAI(text);
    if (!emailData) {
      bot.sendMessage(chatId, '❌ Could not extract email details. Try rephrasing.');
      return;
    }

    try {
      await sendMail(emailData);
      bot.sendMessage(chatId, `✅ Email sent to ${emailData.to} successfully!`);
    } catch (err) {
      bot.sendMessage(chatId, '❌ Failed to send email. Try again later.');
    }
  });

  console.log('🤖 Telegram bot started and listening for messages.');
}

// ========== Express OAuth Server ==========
async function main() {
  const app = express();
  const PORT = 3000;

  // If we already have refresh token credentials, start bot immediately
  if (oAuth2Client.credentials.refresh_token) {
    console.log('✅ Refresh token available, starting Telegram bot...');
    startTelegramBot();
  } else {
    // Step 1: Show user the auth URL
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
        'openid',
      ],
    });

    console.log('Visit this URL to authorize the app:\n', authUrl);

    // Step 2: OAuth2 callback
    app.get('/oauth2callback', async (req, res) => {
      const code = req.query.code;
      if (!code) {
        return res.send('No code received.');
      }

      try {
        const { tokens } = await oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(tokens);

        // Log and output tokens refresh token for saving in env or database
        console.log('✅ Tokens acquired:', tokens);
        if (tokens.refresh_token) {
          console.log('Save this refresh token to your environment variables:', tokens.refresh_token);
          // You can automate saving this in a secure way (e.g. file, DB)
        }

        res.send('Authorization successful! You can now return to the terminal and restart the bot.');

        // Stop server since bot requires refresh token to run persistently
        setTimeout(() => process.exit(0), 2000);
      } catch (err) {
        console.error('Error retrieving access token:', err);
        res.send('Error retrieving access token.');
      }
    });

    app.listen(PORT, () => {
      console.log(`OAuth server listening on http://localhost:${PORT}`);
    });
  }
}

main();
