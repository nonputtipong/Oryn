// src/canvas/canvas.ts — Live Canvas: interactive HTML/JS widgets via WebSocket

import { createServer, IncomingMessage, ServerResponse } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { resolve } from "path";
import { readFileSync } from "fs";

interface CanvasWidget {
  id: string;
  type: "chart" | "table" | "form" | "html";
  content: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

interface ConnectedClient {
  ws: WebSocket;
  userId: string | number;
}

let wss: WebSocketServer | null = null;
let httpServer: ReturnType<typeof createServer> | null = null;
const clients = new Map<string, ConnectedClient>();
const widgetHistory: CanvasWidget[] = [];

const CANVAS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Gravity Claw — Live Canvas</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Inter', -apple-system, sans-serif;
    background: #0a0a0f;
    color: #e0e0e0;
    min-height: 100vh;
  }
  #header {
    padding: 16px 24px;
    background: linear-gradient(135deg, #1a1a2e, #16213e);
    border-bottom: 1px solid #333;
    display: flex; align-items: center; gap: 12px;
  }
  #header h1 { font-size: 18px; font-weight: 600; }
  #header .dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: #4ade80; animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
  #canvas {
    padding: 24px;
    display: flex; flex-direction: column; gap: 16px;
  }
  .widget {
    background: #1a1a2e;
    border: 1px solid #333;
    border-radius: 12px;
    padding: 20px;
    animation: fadeIn 0.3s ease;
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .widget-label {
    font-size: 11px; text-transform: uppercase; letter-spacing: 1px;
    color: #888; margin-bottom: 12px;
  }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #333; }
  th { color: #888; font-weight: 500; font-size: 12px; text-transform: uppercase; }
  #status { padding: 8px 24px; font-size: 12px; color: #666; }
</style>
</head>
<body>
  <div id="header">
    <div class="dot" id="statusDot"></div>
    <h1>🦀 Gravity Claw — Live Canvas</h1>
  </div>
  <div id="canvas"></div>
  <div id="status">Connecting...</div>
  <script>
    const ws = new WebSocket(location.origin.replace('http','ws'));
    const canvas = document.getElementById('canvas');
    const status = document.getElementById('status');
    const dot = document.getElementById('statusDot');

    ws.onopen = () => {
      status.textContent = 'Connected';
      dot.style.background = '#4ade80';
    };
    ws.onclose = () => {
      status.textContent = 'Disconnected';
      dot.style.background = '#ef4444';
    };
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'widget') {
        const div = document.createElement('div');
        div.className = 'widget';
        div.innerHTML = '<div class="widget-label">' + msg.widgetType + '</div>' + msg.content;
        canvas.prepend(div);
      } else if (msg.type === 'clear') {
        canvas.innerHTML = '';
      }
    };
  </script>
</body>
</html>`;

/**
 * Start the Live Canvas WebSocket server.
 */
export function initCanvas(port: number = 3001): void {
  httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    // Serve the canvas HTML page
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(CANVAS_HTML);
  });

  wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const clientId = `client-${Date.now()}`;
    clients.set(clientId, { ws, userId: "anonymous" });
    console.log(`  🎨 Canvas client connected: ${clientId}`);

    // Send existing widgets
    for (const widget of widgetHistory.slice(-20)) {
      ws.send(JSON.stringify({
        type: "widget",
        widgetType: widget.type,
        content: widget.content,
        id: widget.id,
      }));
    }

    ws.on("close", () => {
      clients.delete(clientId);
      console.log(`  🎨 Canvas client disconnected: ${clientId}`);
    });

    ws.on("message", (data: unknown) => {
      try {
        // Ensure data is converted to a string properly (ws.RawData might be Buffer, ArrayBuffer, etc.)
        const msgString = Buffer.isBuffer(data) ? data.toString() : String(data);
        const msg = JSON.parse(msgString);
        // Handle form submissions
        if (msg.type === "form_submit") {
          console.log(`  📝 Form submission: ${JSON.stringify(msg.data)}`);
        }
      } catch {
        // Ignore invalid messages
      }
    });
  });

  httpServer.listen(port, () => {
    console.log(`  ✅ Live Canvas running at http://localhost:${port}`);
  });
}

/**
 * Push a widget to all connected clients.
 */
export function pushWidget(type: CanvasWidget["type"], content: string, metadata?: Record<string, unknown>): string {
  const widget: CanvasWidget = {
    id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    content,
    metadata,
    timestamp: Date.now(),
  };

  widgetHistory.push(widget);
  // Keep only last 100 widgets
  if (widgetHistory.length > 100) widgetHistory.shift();

  // Broadcast to all clients
  const message = JSON.stringify({
    type: "widget",
    widgetType: widget.type,
    content: widget.content,
    id: widget.id,
  });

  for (const [, client] of clients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
    }
  }

  return widget.id;
}

/**
 * Clear the canvas for all clients.
 */
export function clearCanvas(): void {
  widgetHistory.length = 0;
  const message = JSON.stringify({ type: "clear" });
  for (const [, client] of clients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
    }
  }
}

/**
 * Stop the canvas server.
 */
export function stopCanvas(): void {
  if (wss) wss.close();
  if (httpServer) httpServer.close();
  console.log("  🎨 Canvas server stopped");
}

export function isCanvasAvailable(): boolean {
  return wss !== null;
}

export function getCanvasPort(): number {
  const addr = httpServer?.address();
  if (addr && typeof addr === "object") return addr.port;
  return 3001;
}
