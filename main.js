console.log("main.js loaded");

async function testFlowMind() {
  const payload = {
    message: "Quick-Ref からのテスト送信",
    timestamp: Date.now()
  };

  const result = await sendToFlowMind(payload);
  console.log("FlowMind response:", result);
}

testFlowMind();
