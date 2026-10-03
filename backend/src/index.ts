// API + worker in one process (this is what npm run dev uses)
import { runMain } from './bootstrap';

runMain({ api: true, worker: true });
