import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

test("offline app shell contains existing assets from one version", () => {
  const distUrl = new URL("../dist/", import.meta.url);
  const serviceWorker = readFileSync(new URL("sw.js", distUrl), "utf8");
  const version = serviceWorker.match(/floor-plan(?:-webgl)?-shell-v(\d+)/)?.[1];
  assert.ok(version);

  const shellBlock = serviceWorker.match(/const APP_SHELL = \[([\s\S]*?)\];/)?.[1] ?? "";
  const entries = [...shellBlock.matchAll(/"\.\/(.*?)"/g)].map((match) => match[1]);
  assert.ok(entries.length >= 9);
  for (const entry of entries) {
    const [pathname, query = ""] = entry.split("?");
    assert.equal(existsSync(fileURLToPath(new URL(pathname || "index.html", distUrl))), true, `${pathname} must exist`);
    if (query) assert.equal(query, `v=${version}`, `${entry} must match cache version ${version}`);
  }

  for (const filename of ["index.html", "app.js", "renderer.js", "three.js", "webgl-three.js"]) {
    const source = readFileSync(new URL(filename, distUrl), "utf8");
    for (const match of source.matchAll(/[?&]v=(\d+)/g)) {
      assert.equal(match[1], version, `${filename} must use cache version ${version}`);
    }
  }
});

test("the redundant current-plan summary stays out of the 2D layout", () => {
  const html = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");
  assert.match(html, /<section class="summary-card"[^>]*\bhidden\b/);
});

test("furniture details use one concise 2D action for both location and wall clearances", () => {
  const html = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../dist/app.js", import.meta.url), "utf8");
  assert.match(html, /2Dで位置を表示/);
  assert.doesNotMatch(html, /showFurnitureClearanceButton|2Dで壁までの距離を見る/);
  assert.doesNotMatch(app, /showFurnitureClearanceButton/);
});

test("furniture prices are optional and summarized in the furniture list", () => {
  const html = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../dist/app.js", import.meta.url), "utf8");
  assert.match(html, /id="furniturePrice"/);
  assert.match(html, /id="furnitureListPriceSummary"/);
  assert.match(app, /登録済み合計/);
  assert.match(app, /価格登録済み/);
  assert.match(app, /価格未登録/);
});

test("the furniture list can filter inspection findings without losing stack context", () => {
  const html = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../dist/app.js", import.meta.url), "utf8");
  assert.match(html, /id="furnitureListIssueFilter"/);
  for (const value of ["review", "outside", "overlap", "support"]) {
    assert.match(html, new RegExp(`option value="${value}"`));
  }
  assert.match(app, /statuses\.push\("関連家具"\)/);
  assert.match(app, /設置面超過:.*supportOverflowSummary/);
  assert.match(app, /重なり:.*conflicts\.map/);
  assert.match(app, /部屋外:.*placementOverflowSummary/);
  assert.match(app, /collapsedFurnitureIds\.clear\(\);\s*renderFurnitureList\(\);/);
});

test("the WebGL prototype stays local-first and isolated from the stable database", () => {
  const html = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../dist/app.js", import.meta.url), "utf8");
  const webgl = readFileSync(new URL("../dist/webgl-three.js", import.meta.url), "utf8");
  const database = readFileSync(new URL("../dist/db.js", import.meta.url), "utf8");

  assert.match(html, /<canvas[^>]+id="threeCanvas"/);
  assert.match(html, /id="threeSelectionStatus"/);
  assert.match(webgl, /from "\.\/vendor\/three\/three\.module\.js"/);
  assert.doesNotMatch(webgl, /https?:\/\//);
  assert.match(database, /floor-plan-webgl-private/);
  assert.doesNotMatch(database, /const DB_NAME = "floor-plan-private"/);
  assert.doesNotMatch(webgl, /new THREE\.Fog/);
  assert.match(html, /data-webgl-status/);
  assert.match(webgl, /threeSelectionStyle\(selectedTone\)/);
  assert.match(webgl, /relatedObjects\.forEach/);
  assert.match(app, /幅 .*奥行 .*高さ/);
  assert.match(app, /床置き/);
  assert.match(app, /support\.name.*床から/s);
});
