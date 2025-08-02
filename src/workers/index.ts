// import { startEmailWorker } from "./email.worker";

import { emailConsumer } from "./email";

function initWorkers() {
	console.log("🚀 Initializing all workers...");
	emailConsumer();
	console.log("✅ All workers initialized");
}

export default initWorkers;
