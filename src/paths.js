import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = process.env.GABEE_DATA || path.join(os.homedir(), 'Library', 'Application Support', 'GaBeeMac');
export const PROFILES_DIR = path.join(DATA_DIR, 'profiles');
export const USER_FLOWS_DIR = path.join(DATA_DIR, 'flows');
export const BUILTIN_FLOWS_DIR = path.join(APP_DIR, 'flows');
export const OUTPUT_DIR = path.join(os.homedir(), 'Downloads', 'GaBeeMac');
export const PORT = Number(process.env.GABEE_PORT || 4719);

for (const d of [DATA_DIR, PROFILES_DIR, USER_FLOWS_DIR, OUTPUT_DIR]) fs.mkdirSync(d, { recursive: true });
