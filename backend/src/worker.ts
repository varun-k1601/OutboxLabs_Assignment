// Worker only. You can run several, the limits and the send claim live in Redis/Postgres.
import { runMain } from './bootstrap';

runMain({ api: false, worker: true });
