import emailWorker from "./email.worker";

async function startWorkers() {
	console.log("🚀 Initializing all workers...");
	try {
		await emailWorker.init();
		console.log("✅ All workers initialized");
	} catch (error) {
		console.error("❌ Failed to start workers:", error);
		process.exit(1);
	}
}

export default startWorkers;
