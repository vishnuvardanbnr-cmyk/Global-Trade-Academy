#!/bin/bash
BINARY="/home/runner/workspace/scripts/livekit-server"
CONFIG="/home/runner/workspace/scripts/livekit.yaml"

if [ ! -f "$BINARY" ]; then
  echo "LiveKit binary not found, downloading..."
  curl -sSL https://github.com/livekit/livekit/releases/download/v1.8.3/livekit_1.8.3_linux_amd64.tar.gz | tar -xz -C /tmp
  cp /tmp/livekit-server "$BINARY"
  chmod +x "$BINARY"
fi

echo "Starting LiveKit server on port 7880..."
exec "$BINARY" --config "$CONFIG" --bind 0.0.0.0
