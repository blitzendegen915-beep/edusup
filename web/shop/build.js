/**
 * 教材ストア 静的サイト生成スクリプト
 *
 * 使い方:
 *   node web/shop/build.js
 *
 * products.json と site.json を読み込み、dist/ 配下に
 * 公開用のHTML一式（トップページ・商品ページ・sitemap.xml など）を生成します。
 * Node.js の標準機能だけで動くので、npm install は不要です。
 */

const fs = require("fs");
const path = require("path");

const SHOP_DIR = __dirname;
const DIST_DIR = path.join(SHOP_DIR, "dist");

// ---------------------------------------------------------------------------
// 読み込みとチェック
// ---------------------------------------------------------------------------

function loadJson(fileName) {
  const filePath = path.join(SHOP_DIR, fileName);
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error(`エラー: ${fileName} を読み込めませんでした。JSONの書式を確認してください。`);
    console.error(err.message);
    process.exit(1);
  }
}

function validateProducts(products) {
  const seen = new Set();
  for (const p of products) {
    if (!p.id || !/^[a-z0-9-]+$/.test(p.id)) {
      console.error(`エラー: 商品ID "${p.id}" が不正です。半角英小文字・数字・ハイフンのみ使えます。`);
      process.exit(1);
    }
    if (seen.has(p.id)) {
      console.error(`エラー: 商品ID "${p.id}" が重複しています。`);
      process.exit(1);
    }
    seen.add(p.id);
    if (!p.title || typeof p.price !== "number") {
      console.error(`エラー: 商品 "${p.id}" に title または price（数値）がありません。`);
      process.exit(1);
    }
    if (p.audience && !Array.isArray(p.audience)) {
      console.error(`エラー: 商品 "${p.id}" の audience は配列で指定してください。例: ["高校生", "教員"]`);
      process.exit(1);
    }
  }
}

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

/** HTMLに埋め込む文字列をエスケープする（XSS・表示崩れ対策） */
function esc(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 価格の表示用文字列（0円は「無料」） */
function priceLabel(price) {
  return price === 0 ? "無料" : `¥${price.toLocaleString("ja-JP")}（税込）`;
}

function writeFile(relPath, content) {
  const filePath = path.join(DIST_DIR, relPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
  console.log(`  生成: ${relPath}`);
}

// ---------------------------------------------------------------------------
// ページの共通枠
// ---------------------------------------------------------------------------

/**
 * 全ページ共通のHTML枠を返す。
 * rootPath はそのページから見たサイトルートへの相対パス（例: "./" や "../../"）。
 */
function pageShell({ site, title, description, canonicalUrl, rootPath, jsonLd, bodyHtml }) {
  const jsonLdTag = jsonLd
    ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`
    : "";
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonicalUrl)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(canonicalUrl)}">
<meta property="og:site_name" content="${esc(site.siteName)}">
<meta name="twitter:card" content="summary">
<link rel="stylesheet" href="${rootPath}assets/style.css">
${jsonLdTag}
</head>
<body>
<header class="site-header">
  <a class="site-logo" href="${rootPath}index.html">${esc(site.siteName)}</a>
  <p class="site-tagline">${esc(site.tagline)}</p>
</header>
<main class="container">
${bodyHtml}
</main>
<footer class="site-footer">
  <nav>
    <a href="${rootPath}index.html">商品一覧</a>
    <a href="${rootPath}tokushoho.html">特定商取引法に基づく表記</a>
    <a href="mailto:${esc(site.contactEmail)}">お問い合わせ</a>
  </nav>
  <p class="payment-methods">対応決済: ${esc((site.paymentMethods || []).join(" / "))}</p>
  <p>&copy; ${new Date().getFullYear()} ${esc(site.authorName)}</p>
</footer>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// 各ページの生成
// ---------------------------------------------------------------------------

/** 購入ボタン。決済リンク → 無料DL → 準備中 の順で出し分ける */
function buyButtonHtml(site, product, rootPath) {
  const methods = (site.paymentMethods || []).join("・");
  if (product.paymentLink) {
    return `<a class="buy-button" href="${esc(product.paymentLink)}" rel="nofollow">購入する（${esc(priceLabel(product.price))}）</a>
<p class="buy-note">${esc(methods)}が使えます。Stripeの安全な決済ページに移動し、決済後すぐにダウンロードできます。</p>`;
  }
  if (product.price === 0 && product.downloadFile) {
    return `<a class="buy-button buy-button-free" href="${rootPath}files/${esc(product.downloadFile)}" download>無料ダウンロード</a>`;
  }
  return `<span class="buy-button buy-button-disabled">販売準備中</span>
<p class="buy-note">公開までもうしばらくお待ちください。</p>`;
}

function productCardHtml(product) {
  const audience = product.audience || [];
  const audienceHtml = audience.length
    ? `<p class="product-audience">対象: ${audience.map((a) => esc(a)).join("・")}</p>`
    : "";
  return `<article class="product-card" data-category="${esc(product.category)}" data-audience="${esc(audience.join(","))}">
  <p class="product-category">${esc(product.category)} / ${esc(product.fileType)}</p>
  <h2 class="product-title"><a href="products/${esc(product.id)}/index.html">${esc(product.title)}</a></h2>
  ${audienceHtml}
  <p class="product-summary">${esc(product.summary)}</p>
  <p class="product-price">${esc(priceLabel(product.price))}</p>
  <a class="product-link" href="products/${esc(product.id)}/index.html">詳細を見る →</a>
</article>`;
}

function buildIndexPage(site, products) {
  const categories = [...new Set(products.map((p) => p.category))];
  const audiences = [...new Set(products.flatMap((p) => p.audience || []))];
  const categoryButtons = ["すべて", ...categories]
    .map((c) => `<button class="filter-button" data-category-filter="${esc(c)}">${esc(c)}</button>`)
    .join("\n    ");
  const audienceButtons = ["すべて", ...audiences]
    .map((a) => `<button class="filter-button" data-audience-filter="${esc(a)}">${esc(a)}</button>`)
    .join("\n    ");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: site.siteName,
    itemListElement: products.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${site.baseUrl}/products/${p.id}/`,
    })),
  };

  const bodyHtml = `<section class="hero">
  <h1>${esc(site.tagline)}</h1>
  <p>${esc(site.description)}</p>
</section>
<section>
  <div class="filter-group">
    <span class="filter-label">対象で選ぶ</span>
    <div class="filter-bar">
    ${audienceButtons}
    </div>
  </div>
  <div class="filter-group">
    <span class="filter-label">種類で選ぶ</span>
    <div class="filter-bar">
    ${categoryButtons}
    </div>
  </div>
  <div class="product-grid">
${products.map(productCardHtml).join("\n")}
  </div>
</section>
<script>
// 「対象」×「種類」の2軸絞り込み（表示/非表示を切り替えるだけの簡易フィルタ）
var activeCategory = "すべて";
var activeAudience = "すべて";

function applyFilter() {
  document.querySelectorAll(".product-card").forEach(function (card) {
    var okCategory = activeCategory === "すべて" || card.dataset.category === activeCategory;
    var audiences = (card.dataset.audience || "").split(",");
    var okAudience = activeAudience === "すべて" || audiences.indexOf(activeAudience) !== -1;
    card.style.display = okCategory && okAudience ? "" : "none";
  });
}

document.querySelectorAll("[data-category-filter]").forEach(function (button) {
  button.addEventListener("click", function () {
    activeCategory = button.dataset.categoryFilter;
    document.querySelectorAll("[data-category-filter]").forEach(function (b) {
      b.classList.toggle("is-active", b === button);
    });
    applyFilter();
  });
});

document.querySelectorAll("[data-audience-filter]").forEach(function (button) {
  button.addEventListener("click", function () {
    activeAudience = button.dataset.audienceFilter;
    document.querySelectorAll("[data-audience-filter]").forEach(function (b) {
      b.classList.toggle("is-active", b === button);
    });
    applyFilter();
  });
});
</script>`;

  writeFile(
    "index.html",
    pageShell({
      site,
      title: `${site.siteName}｜${site.tagline}`,
      description: site.description,
      canonicalUrl: `${site.baseUrl}/`,
      rootPath: "./",
      jsonLd,
      bodyHtml,
    })
  );
}

function buildProductPage(site, product) {
  const rootPath = "../../";
  const url = `${site.baseUrl}/products/${product.id}/`;

  // Google検索のリッチリザルト用の構造化データ（Product + Offer）
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.summary,
    category: product.category,
    url: url,
    offers: {
      "@type": "Offer",
      price: String(product.price),
      priceCurrency: "JPY",
      availability: product.paymentLink || (product.price === 0 && product.downloadFile)
        ? "https://schema.org/InStock"
        : "https://schema.org/PreOrder",
      url: url,
    },
  };

  const detailItems = (product.details || []).map((d) => `<li>${esc(d)}</li>`).join("\n    ");
  const tagItems = (product.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join(" ");
  const audience = product.audience || [];
  const audienceHtml = audience.length
    ? `<p class="product-audience">こんな方におすすめ: ${audience.map((a) => esc(a)).join("・")}</p>`
    : "";

  const bodyHtml = `<nav class="breadcrumb"><a href="${rootPath}index.html">商品一覧</a> › ${esc(product.category)}</nav>
<article class="product-detail">
  <p class="product-category">${esc(product.category)} / ${esc(product.fileType)}</p>
  <h1>${esc(product.title)}</h1>
  ${audienceHtml}
  <p class="product-price product-price-large">${esc(priceLabel(product.price))}</p>
  <p class="product-summary">${esc(product.summary)}</p>
  <h2>内容</h2>
  <ul>
    ${detailItems}
  </ul>
  <div class="buy-area">
    ${buyButtonHtml(site, product, rootPath)}
  </div>
  <p class="product-meta">形式: ${esc(product.fileType)}｜最終更新: ${esc(product.updated || "")}</p>
  <p class="product-tags">${tagItems}</p>
</article>`;

  writeFile(
    `products/${product.id}/index.html`,
    pageShell({
      site,
      title: `${product.title}｜${site.siteName}`,
      description: product.summary,
      canonicalUrl: url,
      rootPath,
      jsonLd,
      bodyHtml,
    })
  );
}

function buildTokushohoPage(site) {
  const t = site.tokushoho;
  const rows = [
    ["販売者", t.sellerName],
    ["所在地", t.address],
    ["電話番号", t.phone],
    ["メールアドレス", t.email],
    ["販売価格", t.priceNote],
    ["商品代金以外の必要料金", t.extraFees],
    ["引き渡し時期", t.delivery],
    ["支払い方法", t.payment],
    ["返品・キャンセル", t.returns],
  ]
    .map(([label, value]) => `<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>`)
    .join("\n    ");

  const bodyHtml = `<h1>特定商取引法に基づく表記</h1>
<table class="tokushoho-table">
  <tbody>
    ${rows}
  </tbody>
</table>`;

  writeFile(
    "tokushoho.html",
    pageShell({
      site,
      title: `特定商取引法に基づく表記｜${site.siteName}`,
      description: `${site.siteName}の特定商取引法に基づく表記です。`,
      canonicalUrl: `${site.baseUrl}/tokushoho.html`,
      rootPath: "./",
      jsonLd: null,
      bodyHtml,
    })
  );
}

function build404Page(site) {
  const bodyHtml = `<h1>ページが見つかりません</h1>
<p>お探しのページは移動または削除された可能性があります。</p>
<p><a href="index.html">商品一覧に戻る</a></p>`;
  writeFile(
    "404.html",
    pageShell({
      site,
      title: `ページが見つかりません｜${site.siteName}`,
      description: site.description,
      canonicalUrl: `${site.baseUrl}/404.html`,
      rootPath: "./",
      jsonLd: null,
      bodyHtml,
    })
  );
}

function buildSitemapAndRobots(site, products) {
  const urls = [
    `${site.baseUrl}/`,
    `${site.baseUrl}/tokushoho.html`,
    ...products.map((p) => `${site.baseUrl}/products/${p.id}/`),
  ];
  const today = new Date().toISOString().slice(0, 10);
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u)}</loc><lastmod>${today}</lastmod></url>`).join("\n")}
</urlset>
`;
  writeFile("sitemap.xml", sitemap);

  const robots = `User-agent: *
Allow: /
Disallow: /admin/

Sitemap: ${site.baseUrl}/sitemap.xml
`;
  writeFile("robots.txt", robots);
}

/**
 * 管理画面（admin/index.html）を dist/ にコピーする。
 * リポジトリ情報などの設定は site.json から埋め込む。
 */
function buildAdminPage(site) {
  const srcPath = path.join(SHOP_DIR, "admin", "index.html");
  if (!fs.existsSync(srcPath)) {
    return;
  }
  const config = {
    owner: site.github.owner,
    repo: site.github.repo,
    branch: site.github.branch,
    productsPath: "web/shop/products.json",
    filesDir: "web/shop/files",
    siteName: site.siteName,
  };
  const html = fs
    .readFileSync(srcPath, "utf8")
    .replace("__SHOP_CONFIG__", JSON.stringify(config));
  writeFile("admin/index.html", html);
}

/** assets/（CSS）と files/（無料配布物）を dist/ にコピーする */
function copyStaticDirs() {
  for (const dir of ["assets", "files"]) {
    const src = path.join(SHOP_DIR, dir);
    if (fs.existsSync(src)) {
      fs.cpSync(src, path.join(DIST_DIR, dir), { recursive: true });
      console.log(`  コピー: ${dir}/`);
    }
  }
}

// ---------------------------------------------------------------------------
// メイン処理
// ---------------------------------------------------------------------------

function main() {
  console.log("教材ストアのサイトを生成します...");
  const site = loadJson("site.json");
  const products = loadJson("products.json");
  validateProducts(products);

  // 前回の生成結果を消してから作り直す（削除した商品のページが残らないように）
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });

  copyStaticDirs();
  buildIndexPage(site, products);
  for (const product of products) {
    buildProductPage(site, product);
  }
  buildTokushohoPage(site);
  build404Page(site);
  buildSitemapAndRobots(site, products);
  buildAdminPage(site);

  console.log(`完了: 商品${products.length}件のサイトを web/shop/dist/ に生成しました。`);
}

main();
