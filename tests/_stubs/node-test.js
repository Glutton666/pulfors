// node:test → Jest 전역 함수로 라우팅
// i18n-completeness.test.ts 등 node:test 스타일 파일을 Jest에서 실행 가능하게 함
module.exports = {
  test: global.test,
  it: global.it,
  describe: global.describe,
  beforeEach: global.beforeEach,
  afterEach: global.afterEach,
  beforeAll: global.beforeAll,
  afterAll: global.afterAll,
};
