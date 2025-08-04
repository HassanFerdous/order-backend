import workerConfig from "@/config/worker-config";
import BaseWorker from "./base-worker";
import { sendEmail } from "@/lib/mailer";
import { ExchangeType } from "..";

const emailWorker = new BaseWorker({
	queue: workerConfig.email.queue,
	exchange: workerConfig.email.exchange,
	routingKey: workerConfig.email.routingKey,
	exchangeType: workerConfig.email.type as ExchangeType,
	enableDLQ: true,
	enableRetry: true,
	maxRetries: 3,
	retryTtl: 5000, // 5 minutes
	onReceive: async (message, channel) => {
		const data = JSON.parse(message.content.toString());
		if (Math.random() > 0.5) {
			throw new Error("Simulation failed");
		}
		await sendEmail(data);
		channel.ack(message);
	},
	durable: true
});

export default emailWorker;
