const fs = require('fs');
const path = require('path');

const type = process.argv[2];
if (!['patch', 'minor', 'major'].includes(type)) {
  console.error('Usage: node scripts/bump-version.js <patch|minor|major>');
  process.exit(1);
}

const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

let [major, minor, patch] = pkg.version.split('.').map(Number);
if (type === 'major') { major += 1; minor = 0; patch = 0; }
else if (type === 'minor') { minor += 1; patch = 0; }
else { patch += 1; }

const newVersion = `${major}.${minor}.${patch}`;
pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

console.log(newVersion);
