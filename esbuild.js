const esbuild = require('esbuild');
const { sassPlugin } = require('esbuild-sass-plugin');
const fs = require('fs');
const path = require('path');

const isProduction = process.argv.includes('--production');
const isWatch = process.argv.includes('--watch');

// Extension bundle (Node.js)
const extensionConfig = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: !isProduction,
  minify: isProduction,
};

// Webview bundle (browser)
const webviewConfig = {
  entryPoints: ['src/webview/webview.ts'],
  bundle: true,
  outfile: 'dist/webview.js',
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  sourcemap: !isProduction,
  minify: isProduction,
  plugins: [sassPlugin()],
};

function copyVendorAssets() {
  // KaTeX CSS + fonts
  fs.copyFileSync(
    path.join(__dirname, 'node_modules/katex/dist/katex.min.css'),
    path.join(__dirname, 'dist/katex.min.css')
  );
  const fontsDir = path.join(__dirname, 'dist/fonts');
  if (!fs.existsSync(fontsDir)) fs.mkdirSync(fontsDir, { recursive: true });
  for (const f of fs.readdirSync(path.join(__dirname, 'node_modules/katex/dist/fonts'))) {
    fs.copyFileSync(
      path.join(__dirname, 'node_modules/katex/dist/fonts', f),
      path.join(fontsDir, f)
    );
  }

  // highlight.js theme
  fs.copyFileSync(
    path.join(__dirname, 'node_modules/highlight.js/styles/night-owl.css'),
    path.join(__dirname, 'dist/night-owl.css')
  );
}

async function main() {
  if (isWatch) {
    const extCtx = await esbuild.context(extensionConfig);
    const webCtx = await esbuild.context(webviewConfig);
    await Promise.all([extCtx.watch(), webCtx.watch()]);
    copyVendorAssets();
    console.log('Watching for changes...');
  } else {
    await Promise.all([
      esbuild.build(extensionConfig),
      esbuild.build(webviewConfig),
    ]);
    copyVendorAssets();
    console.log('Build complete.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
