# LUNEX 2.0

A fresh Lunex digital world built on the previous Lunex room/chat foundation.

## Included
- 500 server-authoritative private suites
- Correct booking → confirmation → key → entry lifecycle
- Real-time Socket.IO occupancy and chat
- Anonymous Guest identities
- Private text chat, edit/delete, images, video, voice notes
- Suite invitations
- Private Cinema synchronization
- Arcade Tic-Tac-Toe synchronization
- Shared Library
- Encrypted-at-rest suite Vault notes
- LUNA concierge interface
- After Dark visual mode
- Owner Command Center
- Owner room reset and monitoring
<<<<<<< HEAD
=======
- Real SMS OTP architecture via Twilio
>>>>>>> 7f94ba8377e4642f232352e9fdc1fed3e7449c2d
- Render-ready Node/Express deployment
- Responsive cinematic UI

## Run locally
1. Copy `.env.example` to `.env`.
2. Set a long random `SESSION_SECRET`.
<<<<<<< HEAD
3. No SMS provider is required; booking uses normal 10-digit phone validation.
4. Keep the owner credentials server-side.
5. `npm install`
6. `npm start`
7. Open `http://localhost:3000`
=======
3. Keep the owner credentials server-side.
4. `npm install`
5. `npm start`
6. Open `http://localhost:3000`

## Real OTP
Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM` in Render/server environment variables. Without those, the app will clearly report that SMS OTP is not configured rather than inventing or displaying a fake OTP.
>>>>>>> 7f94ba8377e4642f232352e9fdc1fed3e7449c2d

## Privacy
Normal clients receive only anonymous room identities. Phone/email are not sent to other guests. Owner-only endpoints are protected by the owner token.
