import fs from 'node:fs';
import path from 'node:path';

const APP_NAME = '个人收支预算管家';
const APP_DESCRIPTION = '本地记账、预算管理与统计分析桌面应用';
const projectRoot = path.resolve(import.meta.dirname, '..');
const distIndexPath = path.join(projectRoot, 'dist', 'index.html');

function stripPlatformScripts(html) {
  return html
    .replace(/<script>window\.appId[\s\S]*?<\/script>/, '')
    .replace(/<script>\(function\(g\)\{[\s\S]*?<\/script>/, '')
    .replace(/<script>const slardarScript = document\.createElement\('script'\);[\s\S]*?<\/script>/, '')
    .replace(/<script src="https:\/\/sf3-scmcdn-cn\.feishucdn\.com[\s\S]*?<\/script>/, '')
    .replace(/<script>\(function \(win, export_obj\) \{[\s\S]*?<\/script>/, '');
}

function replaceTemplateVars(html) {
  return html
    .replace(/\{\{\{appAvatar\}\}\}/g, './favicon.svg')
    .replace(/\{\{appAvatar\}\}/g, './favicon.svg')
    .replace(/\{\{appName\}\}/g, APP_NAME)
    .replace(/\{\{appDescription\}\}/g, APP_DESCRIPTION)
    .replace(/\{\{appId\}\}|\{\{userId\}\}|\{\{tenantId\}\}|\{\{userName\}\}|\{\{csrfToken\}\}|\{\{environment\}\}/g, '');
}

function makeAssetUrlsRelative(html) {
  return html
    .replace(/(src|href)="\/assets\//g, '$1="./assets/')
    .replace(/href="\/favicon\.svg"/g, 'href="./favicon.svg"')
    .replace(/href="\/icons\.svg"/g, 'href="./icons.svg"');
}

function sanitizeHtml(html) {
  return makeAssetUrlsRelative(replaceTemplateVars(stripPlatformScripts(html)));
}

const originalHtml = fs.readFileSync(distIndexPath, 'utf8');
const sanitizedHtml = sanitizeHtml(originalHtml);

fs.writeFileSync(distIndexPath, sanitizedHtml, 'utf8');
console.log(`Electron renderer HTML prepared: ${distIndexPath}`);
