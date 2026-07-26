async function sendToFlowMind(payload) {
  try {
    const res = await fetch("https://flow-mind.pages.dev/api/receive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (err) {
    console.error("FlowMind send error:", err);
    return null;
  }
}

