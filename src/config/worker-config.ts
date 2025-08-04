type WorkerConfig = {
	queue: string;
	type: string;
	exchange: string;
	routingKey: string;
	maxRetries?: number;
};

const workerConfig = {
	email: {
		queue: "email.queue",
		exchange: "email.topic",
		routingKey: "email.#",
		type: "topic",
		maxRetries: 3
	},
	order: {
		queue: "order.queue",
		exchange: "order.topic",
		routingKey: "order.#",
		type: "topic",
		maxRetries: 3
	},
	payment: {
		queue: "payment.queue",
		exchange: "payment.topic",
		routingKey: "payment.#",
		type: "topic",
		maxRetries: 3
	},

	// Dead letter queue
	dead_letter: {
		queue: "dead-letter.queue",
		exchange: "dead-letter.direct",
		routingKey: "dead-letter",
		type: "direct",
		maxRetries: 3
	},
	// Retry queue
	retry: {
		queue: "retry.queue",
		exchange: "retry.direct",
		routingKey: "retry",
		type: "direct"
	}
};

export default workerConfig;
