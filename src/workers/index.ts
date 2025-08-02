import EmailWorker from "./email.worker";
import OrderWorker from "./order.worker";

async function startWorkers() {
	console.log("🚀 Initializing all workers...");
	try {
		await EmailWorker.start(); // Assuming start is an async method
		await OrderWorker.start();
		console.log("✅ All workers initialized");
	} catch (error) {
		console.error("❌ Failed to start workers:", error);
		process.exit(1);
	}
}

export default startWorkers;
