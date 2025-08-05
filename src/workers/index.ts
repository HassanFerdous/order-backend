import emailWorker from "./email.worker";
import orderWorker from "./order.worker";

async function startWorkers() {
	console.log("🚀 Initializing all workers...");
	try {
		await emailWorker.init();
		await orderWorker.init();
		console.log("✅ All workers initialized");
	} catch (error) {
		console.error("❌ Failed to start workers:", error);
		process.exit(1);
	}
}

export default startWorkers;
