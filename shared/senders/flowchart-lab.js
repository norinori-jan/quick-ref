async function sendToFlowchartLab(payload) {
  try {
    const res = await fetch("https://flowchart-lab.pages.dev/api/receive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (err) {
    console.error("FlowchartLab send error:", err);
    return null;
  }
}
