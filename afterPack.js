// Ad-hoc sign the app (no Apple account needed). Apple Silicon refuses to open completely unsigned apps
// downloaded from the internet ("damaged and can't be opened"); an ad-hoc signature fixes that.
const { execFileSync } = require('child_process'), path = require('path');
exports.default = async ctx => {
  if (ctx.electronPlatformName !== 'darwin') return;
  const app = path.join(ctx.appOutDir, ctx.packager.appInfo.productFilename + '.app');
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
};
