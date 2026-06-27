import { loadEcosystemTags } from './ecosystem.js';

const tags = loadEcosystemTags();
console.log(tags);

function generateIcon(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#F7F7F8';
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = '#1C1C1E';
  ctx.font = `${size * 0.35}px -apple-system`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('QR', size / 2, size / 2);

  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = `icon-${size}.png`;
  a.click();
}

window.generateIcon = generateIcon;
window.addEventListener("unhandledrejection", (event) => {
  console.warn("IndexedDB error detected:", event.reason);
  indexedDB.deleteDatabase("quick-ref-db");
  console.log("quick-ref-db deleted for recovery.");
});


