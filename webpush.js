/**
 * webpush.js
 * Cloudflare Workers の WebCrypto API だけで Web Push を送信するための実装。
 * npm の `web-push` は Node.js 専用APIに依存しておりWorkers上では動かないため、
 * RFC 8291（ペイロード暗号化）・RFC 8292（VAPID）を素朴に実装している。
 *
 * 参考: https://datatracker.ietf.org/doc/html/rfc8291
 *       https://datatracker.ietf.org/doc/html/rfc8292
 */

// ── base64url ヘルパー ──
function base64UrlToUint8Array(base64Url) {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function uint8ArrayToBase64Url(arr) {
  let str = '';
  for (let i = 0; i < arr.length; i++) str += String.fromCharCode(arr[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concatUint8Arrays(...arrays) {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

// ── VAPID: ES256署名付きJWTを作る ──
async function importVapidPrivateKey(privateKeyB64Url) {
  const raw = base64UrlToUint8Array(privateKeyB64Url); // 32byte scalar
  // JWK形式に組み立てて subtle.importKey する（Workers は raw ECの秘密鍵importに非対応なため）
  // 公開鍵の x,y は署名だけなら不要だが、JWKとしては必須なので公開鍵から復元する必要がある。
  // ここでは呼び出し側が publicKeyB64Url も渡す設計にする。
  throw new Error('importVapidPrivateKey: use importVapidKeyPair instead');
}

async function importVapidKeyPair(publicKeyB64Url, privateKeyB64Url) {
  const pubRaw = base64UrlToUint8Array(publicKeyB64Url); // 65byte: 0x04 + X(32) + Y(32)
  const x = pubRaw.slice(1, 33);
  const y = pubRaw.slice(33, 65);
  const d = base64UrlToUint8Array(privateKeyB64Url); // 32byte

  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: uint8ArrayToBase64Url(x),
    y: uint8ArrayToBase64Url(y),
    d: uint8ArrayToBase64Url(d),
    ext: true,
  };

  return crypto.subtle.importKey(
    'jwk', jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
}

/**
 * VAPID Authorization ヘッダーの値を作る。
 * @param {string} endpoint プッシュサービスのendpoint URL（audienceの算出に使う）
 * @param {string} subject  'mailto:xxx@example.com' などVAPID仕様上必須の連絡先
 * @param {string} publicKeyB64Url
 * @param {string} privateKeyB64Url
 */
async function buildVapidAuthHeader(endpoint, subject, publicKeyB64Url, privateKeyB64Url) {
  const audience = new URL(endpoint).origin;
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, // 12時間
    sub: subject,
  };

  const encoder = new TextEncoder();
  const headerB64 = uint8ArrayToBase64Url(encoder.encode(JSON.stringify(header)));
  const payloadB64 = uint8ArrayToBase64Url(encoder.encode(JSON.stringify(payload)));
  const unsigned = `${headerB64}.${payloadB64}`;

  const key = await importVapidKeyPair(publicKeyB64Url, privateKeyB64Url);
  const sigDer = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    encoder.encode(unsigned)
  );
  // WebCryptoのECDSA署名は既にIEEE P1363形式(r||s、64byte)で返る
  const sigB64 = uint8ArrayToBase64Url(new Uint8Array(sigDer));

  const jwt = `${unsigned}.${sigB64}`;
  return `vapid t=${jwt}, k=${publicKeyB64Url}`;
}

// ── RFC 8291: ペイロード暗号化(aes128gcm) ──
async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8
  );
  return new Uint8Array(bits);
}

/**
 * 通知本文(JSON文字列を想定)を、購読先のp256dh/auth鍵で暗号化する。
 * @returns {Promise<{ciphertext: Uint8Array, salt: Uint8Array, serverPublicKey: Uint8Array}>}
 */
async function encryptPayload(payloadText, p256dhB64Url, authB64Url) {
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(payloadText);

  const clientPublicKeyRaw = base64UrlToUint8Array(p256dhB64Url);
  const authSecret = base64UrlToUint8Array(authB64Url);

  // ブラウザ公開鍵をimport
  const clientPublicKey = await crypto.subtle.importKey(
    'raw', clientPublicKeyRaw,
    { name: 'ECDH', namedCurve: 'P-256' },
    false, []
  );

  // サーバー側の使い捨てECDH鍵ペア
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true, ['deriveBits']
  );
  const serverPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', serverKeyPair.publicKey)
  );

  // 共有シークレット(ECDH)
  const sharedSecretBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: clientPublicKey },
    serverKeyPair.privateKey,
    256
  );
  const sharedSecret = new Uint8Array(sharedSecretBits);

  // salt(16byte ランダム)
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // PRK: auth_secretをsaltにしてHKDF、infoは "WebPush: info" + client_pub + server_pub
  const authInfo = concatUint8Arrays(
    encoder.encode('WebPush: info\0'),
    clientPublicKeyRaw,
    serverPublicKeyRaw
  );
  const ikm = await hkdf(authSecret, sharedSecret, authInfo, 32);

  // Content Encryption Key (CEK) と Nonce をikmから導出
  const cekInfo = encoder.encode('Content-Encoding: aes128gcm\0');
  const cek = await hkdf(salt, ikm, cekInfo, 16);
  const nonceInfo = encoder.encode('Content-Encoding: nonce\0');
  const nonce = await hkdf(salt, ikm, nonceInfo, 12);

  // パディング区切り(0x02) + パディングなし、で終端。aes128gcmは平文末尾に1byteのパディング区切りが必要。
  const paddedPlaintext = concatUint8Arrays(plaintext, new Uint8Array([2]));

  const cekKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    cekKey,
    paddedPlaintext
  );
  const ciphertext = new Uint8Array(ciphertextBuf); // 認証タグ(16byte)込み

  return { ciphertext, salt, serverPublicKey: serverPublicKeyRaw };
}

/**
 * aes128gcmヘッダー(RFC 8188)付きの送信本文を組み立てる。
 * 形式: salt(16) + recordSize(4, big-endian) + keyIdLen(1) + keyId(serverPublicKey, 65byte) + ciphertext
 */
function buildAes128gcmBody(salt, serverPublicKey, ciphertext) {
  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096, false);
  const keyIdLen = new Uint8Array([serverPublicKey.length]);
  return concatUint8Arrays(salt, recordSize, keyIdLen, serverPublicKey, ciphertext);
}

/**
 * プッシュ通知を1件送信する。
 * @param {{endpoint:string, keys:{p256dh:string, auth:string}}} subscription
 * @param {object} payloadObj 通知内容(JSON化してpush)
 * @param {{publicKey:string, privateKey:string, subject:string}} vapid
 * @returns {Promise<{ok:boolean, status:number, expired?:boolean}>}
 */
async function sendPushNotification(subscription, payloadObj, vapid) {
  const payloadText = JSON.stringify(payloadObj);
  const { ciphertext, salt, serverPublicKey } = await encryptPayload(
    payloadText, subscription.keys.p256dh, subscription.keys.auth
  );
  const body = buildAes128gcmBody(salt, serverPublicKey, ciphertext);

  const authHeader = await buildVapidAuthHeader(
    subscription.endpoint, vapid.subject, vapid.publicKey, vapid.privateKey
  );

  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': '86400',
    },
    body,
  });

  // 404/410 = 購読が失効している(ユーザーが通知をオフにした等) → 呼び出し側でKVから削除させる
  const expired = res.status === 404 || res.status === 410;
  return { ok: res.ok, status: res.status, expired };
}

export { sendPushNotification, buildVapidAuthHeader, encryptPayload };

