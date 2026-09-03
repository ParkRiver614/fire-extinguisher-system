import fs from "node:fs";
import path from "node:path";

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf-8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(path.resolve(__dirname, "../../.env.integration"));

const required = ["INTEGRATION_API_BASE_URL", "INTEGRATION_ADMIN_EMAIL", "INTEGRATION_ADMIN_PASSWORD"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(
    `통합 테스트에 필요한 환경변수가 없습니다: ${missing.join(", ")}\n` +
      `Admin Webpage/.env.integration 파일에 값을 채워주세요 (.env.integration.example 참고).`,
  );
}
