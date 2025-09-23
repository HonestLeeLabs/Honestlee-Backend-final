import WifiTest from '../models/WifiTest';

export async function submitWifiTest(userId: string, downloadMbps: number, uploadMbps: number, pingMs: number, jitterMs: number) {
  const wifiTest = new WifiTest({
    user: userId,
    downloadMbps,
    uploadMbps,
    pingMs,
    jitterMs
  });
  await wifiTest.save();
  return wifiTest;
}

export async function getUserWifiTests(userId: string) {
  return WifiTest.find({ user: userId }).sort({ createdAt: -1 });
}
