// API only, so it can be scaled separately from the workers
import { runMain } from './bootstrap';

runMain({ api: true, worker: false });
