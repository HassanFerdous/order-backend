import { User } from "./domains/v1/user/service";
export type ExchangeType = "topic" | "direct" | "fanout" | "headers";
export type Session = {
	csrf: string;
	permissions: string;
	userId: number;
};

export type AuthTokenPayload = {
	user: User;
	sid: string;
};

export type EmailPayload = {
	to: string;
	subject: string;
	html?: string;
	text?: string;
	from?: string;
};
