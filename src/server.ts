import app from './app';

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`📡 Socket.IO enabled for real-time updates`);
  console.log(`🌍 Health check: http://localhost:${PORT}/health`);
});
