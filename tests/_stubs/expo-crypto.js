let counter = 0;
const Crypto = {
  randomUUID: () => {
    counter += 1;
    return `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
  },
  getRandomBytes: (n) => new Uint8Array(n),
  getRandomBytesAsync: async (n) => new Uint8Array(n),
  digestStringAsync: async (_alg, s) => `digest:${s}`,
  CryptoDigestAlgorithm: { SHA1: "SHA-1", SHA256: "SHA-256", SHA384: "SHA-384", SHA512: "SHA-512" },
  CryptoEncoding: { HEX: "hex", BASE64: "base64" },
};
module.exports = Crypto;
module.exports.default = Crypto;
