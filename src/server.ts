// src/server.ts
import app from './app';
import { server } from './app'; // Import the http server with Socket.IO

const PORT = process.env.PORT || 4000;
const SOCKET_PORT = process.env.SOCKET_PORT || 5000;

// ✅ Start HTTP + Socket.IO server on same PORT
server.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
  console.log(`✅ Socket.IO enabled on same server`);
  console.log(`✅ WebSocket endpoint: ws://localhost:${PORT}/socket.io/`);
  console.log(`🌍 Health check: http://localhost:${PORT}/health`);
});
