import EmailWorker from "./email";

async function startWorkers() {
	console.log("🚀 Initializing all workers...");
	try {
		await EmailWorker.start(); // Assuming start is an async method
		console.log("✅ Email worker started and consuming");
		console.log("✅ All workers initialized");
	} catch (error) {
		console.error("❌ Failed to start Email worker:", error);
		process.exit(1);
	}
}

export default startWorkers;
