---
name: LiveKit on Replit networking
description: Why LiveKit WebRTC media fails in Replit and the only reliable fix.
---

## The problem

LiveKit in Replit works in two layers:
- **Signaling (WebSocket)** — routed via Vite proxy `/livekit` → `localhost:7880`. This works.
- **Media (WebRTC RTP/RTCP)** — requires direct TCP/UDP access to `nodeIP:7881` (TCP ICE) and `nodeIP:7882` / ports 50000-60000 (UDP ICE). Replit's GCP firewall blocks these raw ports. Media cannot flow.

The LiveKit server detects its GCP external IP (e.g. `34.100.157.249`) and advertises it in ICE candidates, but clients can't reach that IP on non-HTTP ports because GCP firewall blocks them. No TURN relay → no audio/video.

**Why:** Replit's reverse proxy only handles HTTP/HTTPS (port 80/443). Raw TCP/UDP to any other port is blocked by the underlying GCP firewall rules.

## The only reliable fix

Switch to **LiveKit Cloud** (`livekit.io/cloud` — has a free tier). LiveKit Cloud provides proper TURN servers and publicly accessible SFU nodes. Update three env vars:
- `LIVEKIT_URL` → `wss://<your-cloud-project>.livekit.cloud`
- `LIVEKIT_API_KEY` → key from LiveKit Cloud dashboard
- `LIVEKIT_API_SECRET` → secret from LiveKit Cloud dashboard

The self-hosted LiveKit server workflow can be left running (it still handles room name generation for token grants), but the client connects to the Cloud URL instead.

## SDK version quirk (useStartAudio)

`@livekit/components-react` v2 changed `useStartAudio`:
- **v1/old:** `const { canPlayAudio, startAudio } = useStartAudio({ room })`
- **v2.x:** `const { mergedProps, canPlayAudio } = useStartAudio({ room, props: {} })`
  - `mergedProps.onClick` is the audio unlock handler
  - The `props` parameter is required; omitting it causes a TS error about missing `props`

## Code improvements already applied

- `useStartAudio` fixed to v2 API
- Reconnect policy: exponential backoff 1s→2s→4s→8s→15s (max 5 retries)
- `connectOptions` with STUN servers on `LiveKitRoom`
- Mic permissions pre-check before joining (catches denied/not-found early)
- Reconnecting overlay on `RoomEvent.Reconnecting`
- `use_ice_lite: true` in livekit.yaml (correct for SFU)
- Initial `audioMuted` state fixed to `false` (room joins with `audio` prop enabled)
