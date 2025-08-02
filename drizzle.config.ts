import { config } from "@/config";
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
	out: "./drizzle",
	schema: "./src/db",
	dialect: "postgresql",
	dbCredentials: {
		url: config.db.uri!
	}
});
