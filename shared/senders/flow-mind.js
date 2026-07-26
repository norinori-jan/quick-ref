// Flow-Mind に POST 送信する関数
async function sendToFlowMind(payload) {
  try {
    const res = await fetch("https://flow-mind-cgs.pages.dev/api/receive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    return data;

  } catch (err) {
    console.error("FlowMind send error:", err);
    return null;
  }
}

// Quick-Ref の UI から呼び出す送信処理
async function handleFlowMindSend() {
  const payload = {
    text: document.querySelector("#input").value,
    timestamp: Date.now()
  };

  const result = await sendToFlowMind(payload);

  if (!result) {
    console.error("FlowMind returned null or error");
    return;
  }

  console.log("FlowMind response:", result);

  const output = document.querySelector("#output");
  if (output) {
    output.textContent = JSON.stringify(result, null, 2);
  }
}

// 送信ボタンにイベントを紐づける
document.querySelector("#sendBtn").addEventListener("click", handleFlowMindSend);
