# ShareDesk Meet

A small Google Meet-style WebRTC app that can be deployed on Render. The first person in a room becomes the host. The host can share their screen, receive participant control requests, and grant or revoke permission for approved participants to send pointer and keyboard events.

## What works now

- Room-based video meetings
- Home page with separate Host and Join flows
- Generated room codes for hosts
- Optional 15-minute delayed session start
- Camera and microphone controls
- Host screen sharing
- Multiple people can share screens at the same time
- WebRTC signaling through Socket.IO
- Host-only limited control approval for Pointer, Space, and Arrow keys
- Participant pointer and approved key event relay after approval
- Voice activity glow on speaking video tiles
- Direct voice or push-to-talk audio mode, with `U` as the default push key
- Screen audio volume and mute controls that are separate from the mic mute button
- Render-ready `render.yaml`

## Important browser limitation

Browsers do not allow a normal website to control another person's operating system or arbitrary shared desktop. This app safely relays approved interaction events to the host browser and shows the remote cursor/activity there.

For real OS-level remote control, add one of these later:

- a native desktop helper app installed by the host
- an Electron host client
- a browser extension with narrow permissions

The current permission and event model is designed so that helper can be added without replacing the meeting app.

## Run Locally

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000
```

Use two browser tabs or two devices, join the same room code, and let the first joiner act as host.

## Host And Join Flow

- Click `Host meeting` to generate a room code.
- Enter the host name.
- Leave `Start after 15 minutes` off to start immediately, or turn it on to show a countdown before sharing/control opens.
- Click `Initialize session`.
- Participants click `Join meeting`, enter their name and the generated code, then join.

Only the Host flow creates new rooms. If someone enters a code that has not been initialized, the app asks them to check the code.

## Deploy On Render

1. Push this project to GitHub.
2. In Render, create a new Blueprint or Web Service from the repository.
3. If using the included blueprint, Render reads `render.yaml`.
4. If creating manually, use:

```text
Build command: npm install
Start command: npm start
Health check path: /health
```

Render will provide `PORT` automatically.

## How The Control Flow Works

1. Participant clicks `Request control`.
2. Host receives the request in `Participant control`.
3. Host enables any combination of `Pointer`, `Space`, and `Arrows`.
4. Participant can only send the enabled interaction types to the active shared screen.
5. The host receives those events and sees the remote cursor/activity.
6. Host can revoke each permission at any time.

## Audio Modes

- `Direct voice` keeps the mic active while the mic button is on.
- `Push to talk` keeps the mic closed until the push key is held.
- The default push key is `U`.
- Click the push-key field and press another single character to change it.

## Multiple Screen Shares

Any participant can click `Share screen`. Shared screens appear as selectable thumbnails under the main shared-screen stage. Click a thumbnail to focus that shared screen.

Screen sharing requests system/tab audio from the browser. Screen audio uses the main shared-screen player, so it stays separate from microphone mute. If someone mutes their mic, their shared tab/system audio can still play for viewers unless viewers mute or lower `Screen volume`.

## Files

- `server.js` - Express static server, Socket.IO signaling, room state, permissions
- `public/app.js` - WebRTC client, screen share, controls, permission UI
- `public/index.html` - application UI
- `public/styles.css` - responsive styling
- `render.yaml` - Render web service configuration
