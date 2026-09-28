import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
// Prisma's Windows schema engine can fail before creating a new SQLite file.
// Exclusive creation makes this safe to rerun without truncating an existing DB.
const url = process.env.DATABASE_URL;
if (url?.startsWith('file:')) {
  const filename = path.resolve('prisma', url.slice(5));
  await fs.mkdir(path.dirname(filename), { recursive: true });
  try {
    const file = await fs.open(filename, 'wx');
    await file.close();
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
  }
}
