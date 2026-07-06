'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Transpiles the PostgreSQL schema.prisma into a SQLite-compatible schema.sqlite.prisma
 * for local development and testing.
 *
 * It does the following:
 * 1. Changes provider from "postgresql" to "sqlite".
 * 2. Replaces DATABASE_URL reference to point to a local SQLite file if not overridden.
 * 3. Strips PostgreSQL-specific type attributes like @db.Uuid and @db.Text.
 * 4. SQLite does not support native enums. It converts Prisma enum definitions to String.
 */

const inputPath = path.join(__dirname, '../prisma/schema.prisma');
const outputPath = path.join(__dirname, '../prisma/schema.sqlite.prisma');

console.log('🔄 Converting PostgreSQL schema.prisma to SQLite-compatible schema...');

if (!fs.existsSync(inputPath)) {
  console.error(`❌ Input schema not found at: ${inputPath}`);
  process.exit(1);
}

let content = fs.readFileSync(inputPath, 'utf8');

// 1. Swap the provider
content = content.replace(/provider\s*=\s*"postgresql"/g, 'provider = "sqlite"');

// 2. Strip Postgres-specific database attributes
content = content.replace(/@db\.Uuid/g, '');
content = content.replace(/@db\.Text/g, '');

// 3. Extract and parse all enum names
const enumRegex = /enum\s+(\w+)\s*\{([^}]+)\}/g;
const enumNames = [];
let match;
while ((match = enumRegex.exec(content)) !== null) {
  enumNames.push(match[1]);
}

// 4. Remove all enum blocks from the SQLite schema
content = content.replace(/enum\s+\w+\s*\{[^}]+\}/g, '');

// 5. Replace the enum fields in models with String type
for (const enumName of enumNames) {
  // Replace references like "role UserRole" with "role String"
  // Match the word exactly to avoid false replacements
  const fieldRegex = new RegExp(`(\\b\\w+\\b\\s+)${enumName}(\\b)`, 'g');
  content = content.replace(fieldRegex, '$1String$2');
}

// 6. Wrap any non-boolean, non-numeric, non-function default values in quotes
content = content.replace(/@default\((\w+)\)/g, (match, p1) => {
  if (['true', 'false', 'null', 'dbgenerated', 'autoincrement', 'now', 'uuid'].includes(p1) || !isNaN(p1)) {
    return match;
  }
  return `@default("${p1}")`;
});

// 7. Output to the SQLite schema file
fs.writeFileSync(outputPath, content, 'utf8');
console.log(`✅ SQLite schema generated at: ${outputPath}`);
