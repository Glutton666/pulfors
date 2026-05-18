// node:test → Jest 전역 test() 함수로 라우팅
// i18n-completeness.test.ts 등 node:test 스타일 파일을 Jest에서 실행 가능하게 함
module.exports = { test: global.test };
