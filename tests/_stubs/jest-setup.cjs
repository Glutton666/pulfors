// Jest용 전역 폴리필. setup.cjs의 Module._resolveFilename 훅은
// Jest의 자체 모듈 리졸버와 충돌하므로 여기서는 전역 변수만 설정한다.
// 패키지 stub 매핑은 jest.config.js의 moduleNameMapper에서 처리된다.
if (typeof globalThis.__DEV__ === "undefined") globalThis.__DEV__ = true;
