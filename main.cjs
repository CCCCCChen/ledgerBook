// main.cjs — Electron 入口（根目录，绕过 package.json 的 "main" 字段限制）
// electron-builder.yml 中通过 extraMetadata.main 覆盖
require('./electron/main.cjs');
