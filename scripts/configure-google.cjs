const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),file=path.join(root,'manifest.json');
const clientId=process.argv[2];
if(!clientId||!/^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(clientId)){
  console.error('Usage: node scripts/configure-google.cjs YOUR_CLIENT_ID.apps.googleusercontent.com');process.exit(1);
}
const manifest=JSON.parse(fs.readFileSync(file,'utf8'));
manifest.oauth2={client_id:clientId,scopes:['https://www.googleapis.com/auth/drive.appdata']};
fs.writeFileSync(file,JSON.stringify(manifest,null,2)+'\n');
const id=crypto.createHash('sha256').update(Buffer.from(manifest.key,'base64')).digest('hex').slice(0,32).replace(/[0-9a-f]/g,c=>String.fromCharCode(97+parseInt(c,16)));
console.log('Configured OAuth client for extension '+id+'. Reload the sync extension in Chrome.');
