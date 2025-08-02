import workerConfig from "@/config/worker-config";
import connectRabbitMQ from "@/lib/rabbitmq";
import { ConsumeMessage } from "amqplib";
import { EmailPayload } from "..";
import { sendEmail } from "@/lib/mailer";

type EmailJobType = "send-otp" | "send-welcome" | "send-password-reset";

export default class EmailWorker {
	connection: any;
	channel: any;
	constructor() {
		this.connection = null;
		this.channel = null;
	}
	async #init() {
		const { connection, channel } = await connectRabbitMQ();
		this.connection = connection;
		this.channel = channel;
		this.channel.assertExchange(
			workerConfig.email.exchange,
			workerConfig.email.type,
			{ durable: true }
		);
		console.log("📨 EmailWorker initialized");
	}

	/**
	 * Send email
	 */
	async send(jobType: EmailJobType, data: EmailPayload) {
		if (!this.channel) await this.#init();
		await this.channel.publish(
			workerConfig.email.exchange,
			`email.${jobType}`,
			Buffer.from(JSON.stringify({ jobType, ...data }))
		);
	}

	/**
	 * Consume the messages from the queue
	 */
	async #consumer() {
		if (!this.channel) await this.#init();
		this.channel.consume(
			workerConfig.email.queue,
			async (msg: ConsumeMessage | null) => {
				if (msg) {
					const data = JSON.parse(
						msg.content.toString()
					) as EmailPayload & {
						jobType: EmailJobType;
					};
					console.log("📧 Received email from Queue", data);
					await this.#handleJob(data.jobType, data);
					this.channel.ack(msg);
				}
			}
		);
	}

	/**
	 * Send OTP email
	 */
	async #sendOTP(data: EmailPayload) {
		await sendEmail(data);
	}

	/**
	 * Handle the job
	 */
	async #handleJob(
		jobType: EmailJobType,
		data: EmailPayload & { jobType: EmailJobType }
	) {
		switch (jobType) {
			case "send-otp":
				await this.#sendOTP(data);
				break;
			default:
				break;
		}
	}

	/**
	 * Start the worker
	 */
	static async start() {
		const worker = new EmailWorker();
		await worker.#init();
		await worker.#consumer();
	}
}
