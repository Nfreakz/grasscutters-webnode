#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const required = [
  'APP_STORAGE_DRIVER',
  'ARCHIVE_STORAGE_DRIVER',
  'MYSQL_HOST',
  'MYSQL_DATABASE',
  'MYSQL_USER',
  'MYSQL_PASSWORD',
  'ARCHIVE_DATA_PATH',
  'ARCHIVE_MEDIA_DIR',
  'ARCHIVE_MEDIA_PUBLIC_URL',
];

const recommended = {
  APP_STORAGE_DRIVER: 'mysql',
  ARCHIVE_STORAGE_DRIVER: 'mysql',
  ARCHIVE_MEDIA_PUBLIC_URL: '/archive-media',
};

console.log('\n[GC Hostinger] Validando variables de producción...\n');

let failed = false;

for (const key of required) {
  const value = process.env[key];
  if (!value || !String(value).trim()) {
    console.log(`❌ Falta ${key}`);
    failed = true;
  } else {
    const safe = /PASSWORD|SECRET|TOKEN/i.test(key) ? '***' : value;
    console.log(`✅ ${key}=${safe}`);
  }
}

for (const [key, expected] of Object.entries(recommended)) {
  const value = String(process.env[key] || '').trim();
  if (value && value !== expected) {
    console.log(`⚠️ ${key} está en "${value}". Recomendado: "${expected}"`);
  }
}

const mediaDir = process.env.ARCHIVE_MEDIA_DIR?.trim();
if (mediaDir) {
  try {
    fs.mkdirSync(mediaDir, { recursive: true });
    fs.accessSync(mediaDir, fs.constants.W_OK);
    console.log(`✅ ARCHIVE_MEDIA_DIR escribible: ${mediaDir}`);
  } catch (error) {
    console.log(`❌ ARCHIVE_MEDIA_DIR no es escribible: ${mediaDir}`);
    console.log(String(error?.message || error));
    failed = true;
  }
}

const dataPath = process.env.ARCHIVE_DATA_PATH?.trim();
if (dataPath) {
  try {
    fs.mkdirSync(path.dirname(dataPath), { recursive: true });
    console.log(`✅ Directorio de ARCHIVE_DATA_PATH preparado: ${path.dirname(dataPath)}`);
  } catch (error) {
    console.log(`❌ No se pudo preparar ARCHIVE_DATA_PATH: ${dataPath}`);
    console.log(String(error?.message || error));
    failed = true;
  }
}

if (failed) {
  console.log('\n[GC Hostinger] Configuración incompleta.\n');
  process.exit(1);
}

console.log('\n[GC Hostinger] Variables básicas OK.\n');
