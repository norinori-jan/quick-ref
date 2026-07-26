async function sendToSecurityApps(payload) {
  try {
    const res = await fetch("https://security-apps.pages.dev/api/receive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (err) {
    console.error("SecurityApps send error:", err);
    return null;
  }
}
