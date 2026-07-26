async function sendToCreativeApps(payload) {
  try {
    const res = await fetch("https://creative-apps.pages.dev/api/receive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (err) {
    console.error("CreativeApps send error:", err);
    return null;
  }
}
