export async function verifyBotCheck(token: unknown, action: "signup" | "login" | "recovery" | "reset"): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return process.env.NODE_ENV !== "production";
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token }), signal: AbortSignal.timeout(10000),
    });
    const result = await response.json();
    const expectedHost = process.env.APP_URL ? new URL(process.env.APP_URL).hostname : null;
    return response.ok && result.success === true && result.action === action
      && (process.env.NODE_ENV !== "production" || Boolean(expectedHost && result.hostname === expectedHost));
  } catch { return false; }
}
