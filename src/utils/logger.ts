export function logInfo(message: string, ...optionalParams: any[]) {
  console.log(`[INFO] ${new Date().toISOString()} - ${message}`, ...optionalParams);
}

export function logError(message: string, ...optionalParams: any[]) {
  console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, ...optionalParams);
}
