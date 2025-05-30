# TelegramBot to Gmail Email Sender with OAuth2

## Overview
This project is a Node.js application that sends emails using Gmail API with OAuth2 authentication. It allows sending emails programmatically without using your Gmail password, by authorizing via Google OAuth.

## How It Works
- When you start the app (`node app.js`), it generates a Google OAuth2 authorization URL.
- You open the URL in your browser and log in with your Google account to grant permission.
- The app receives access and refresh tokens from Google after successful authorization.
- Using these tokens, the app sends emails via Gmail's SMTP server with OAuth2 authentication.
- Refresh tokens allow the app to get new access tokens automatically without re-authorizing.

## Requirements
- Node.js (v14 or higher recommended)
- npm (Node package manager)
- A Google Cloud project with Gmail API enabled
- OAuth2 credentials (Client ID and Client Secret) created in Google Cloud Console
- Internet connection for OAuth2 flow and sending emails

## Setup Steps
1. Clone or download this repository.
2. Run `npm install` to install dependencies.
3. Create OAuth2 credentials in Google Cloud Console:
   - Enable Gmail API
   - Create OAuth 2.0 Client IDs with redirect URI set to `http://localhost:3000/oauth2callback`
4. Add your `client_id`, `client_secret`, and `redirect_uri` to the configuration in `app.js`.
5. Run the app using `node app.js`.
6. Visit the provided authorization URL in your browser.
7. Grant permissions and copy the authorization code back into the app (if prompted).
8. The app will store tokens and be ready to send emails.

## Usage
- The app listens for messages containing email requests.
- When a request is received, it sends the email using the authorized Gmail account.

## Troubleshooting
- Make sure you have enabled Gmail API in your Google Cloud project.
- Ensure your OAuth2 credentials are correct.
- If "Invalid login" or "BadCredentials" errors occur, check your tokens and OAuth2 setup.
- Use the Google support link for detailed error info: https://support.google.com/mail/?p=BadCredentials

## Dependencies
- [nodemailer](https://www.npmjs.com/package/nodemailer)
- [googleapis](https://www.npmjs.com/package/googleapis)
- [express](https://www.npmjs.com/package/express)

---

Feel free to customize the email sending messages in your app as needed.
