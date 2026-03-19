import fs from 'fs';

// Patch email-messages.js
let emFile = fs.readFileSync('server/routes/email-messages.js', 'utf8');
if (!emFile.includes('allowVulnerableTags')) {
  emFile = emFile.replace(
    "allowedSchemes: ['http', 'https', 'mailto'],\n};",
    "allowedSchemes: ['http', 'https', 'mailto'],\n  allowVulnerableTags: true,\n};"
  );
  fs.writeFileSync('server/routes/email-messages.js', emFile);
  console.log('Patched email-messages.js');
} else {
  console.log('email-messages.js already patched');
}

// Patch email-inbound.js
let eiFile = fs.readFileSync('server/routes/email-inbound.js', 'utf8');
if (!eiFile.includes('allowVulnerableTags')) {
  eiFile = eiFile.replace(
    "allowedSchemes: ['http', 'https', 'mailto'],\n        });",
    "allowedSchemes: ['http', 'https', 'mailto'],\n          allowVulnerableTags: true,\n        });"
  );
  fs.writeFileSync('server/routes/email-inbound.js', eiFile);
  console.log('Patched email-inbound.js');
} else {
  console.log('email-inbound.js already patched');
}
