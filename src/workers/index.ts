// import DeadLetterWorker from "./deadletter.worker";
import EmailWorker from "./email.worker";
import OrderWorker from "./order.worker";
import DeadLetterWorker from "./dlq-testing";

async function startWorkers() {
	console.log("🚀 Initializing all workers...");
	try {
		// await EmailWorker.start(); // Assuming start is an async method
		// await OrderWorker.start();
		// await DeadLetterWorker.start();
		DeadLetterWorker.start();
		console.log("✅ All workers initialized");
	} catch (error) {
		console.error("❌ Failed to start workers:", error);
		process.exit(1);
	}
}

export default startWorkers;
