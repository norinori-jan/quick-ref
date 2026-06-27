/* -----------------------------------------
   ecosystem_tags の読み込み（全アプリ共通）
----------------------------------------- */
export function loadEcosystemTags() {
  try {
    const raw = localStorage.getItem('ecosystem_tags');
    if (!raw) return [];
    const { tags } = JSON.parse(raw);
    return tags || [];
  } catch(_) {
    return [];
  }
}

/* -----------------------------------------
   ecosystem_tags の保存（quick-ref が書く）
----------------------------------------- */
export function saveEcosystemTags(tags) {
  localStorage.setItem('ecosystem_tags', JSON.stringify({ tags }));
}

/* -----------------------------------------
   APIキーの読み込み（Claude / Gemini / OpenAI）
----------------------------------------- */
export function loadApiKeys() {
  return {
    claude: localStorage.getItem('ml_claude') || "",
    gemini: localStorage.getItem('ml_gemini') || "",
    openai: localStorage.getItem('ml_openai') || ""
  };
}

/* -----------------------------------------
   APIキーの保存（設定画面から保存）
----------------------------------------- */
export function saveApiKeys({ claude, gemini, openai }) {
  if (claude) localStorage.setItem('ml_claude', claude);
  if (gemini) localStorage.setItem('ml_gemini', gemini);
  if (openai) localStorage.setItem('ml_openai', openai);
}
