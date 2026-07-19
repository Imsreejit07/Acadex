import * as path from 'path';
import { parseTimetableFromPath } from '../src/lib/timetable-parser';

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error(JSON.stringify({ error: 'Usage: parse-timetable-cli <pdf-path>' }));
    process.exit(1);
  }

  const resolvedPath = path.resolve(filePath);
  const result = await parseTimetableFromPath(resolvedPath);
  process.stdout.write(JSON.stringify(result));
}

main().catch((error: unknown) => {
  const errMsg = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ error: errMsg }));
  process.exit(1);
});
