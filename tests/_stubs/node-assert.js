// node:assert/strict → Jest expect() API로 라우팅
// i18n-completeness.test.ts 등이 assert.equal / assert.ok 등을 사용할 수 있도록 함
const assert = {
  equal: (a, b, msg) => expect(a).toBe(b),
  strictEqual: (a, b, msg) => expect(a).toBe(b),
  notEqual: (a, b, msg) => expect(a).not.toBe(b),
  notStrictEqual: (a, b, msg) => expect(a).not.toBe(b),
  ok: (v, msg) => expect(v).toBeTruthy(),
  deepEqual: (a, b, msg) => expect(a).toEqual(b),
  deepStrictEqual: (a, b, msg) => expect(a).toEqual(b),
  notDeepEqual: (a, b, msg) => expect(a).not.toEqual(b),
  throws: (fn, _errOrMsg, msg) => expect(fn).toThrow(),
  doesNotThrow: (fn, _errOrMsg, msg) => expect(fn).not.toThrow(),
  fail: (msg) => { throw new Error(msg || "assert.fail"); },
  match: (str, re, msg) => expect(str).toMatch(re),
  doesNotMatch: (str, re, msg) => expect(str).not.toMatch(re),
};
module.exports = assert;
module.exports.default = assert;
