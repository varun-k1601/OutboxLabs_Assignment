import { closeDatabase } from '../src/db/client';
import { runMigrations } from '../src/db/migrate';

runMigrations()
  .then(() => closeDatabase())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
