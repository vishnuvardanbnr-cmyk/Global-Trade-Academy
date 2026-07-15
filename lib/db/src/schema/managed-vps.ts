import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";

export const managedVpsTable = pgTable("managed_vps", {
  id: serial("id").primaryKey(),
  copyAccountId: integer("copy_account_id").notNull(),
  userId: text("user_id").notNull(),
  provider: text("provider").notNull().default("vultr"),
  instanceId: text("instance_id"),          // Vultr instance UUID
  ipAddress: text("ip_address"),
  status: text("status").notNull().default("provisioning"),
  // provisioning | running | stopped | error | destroyed
  region: text("region").notNull().default("kul"),
  plan: text("plan").notNull().default("vc2-1c-1gb"),
  monthlyCost: numeric("monthly_cost", { precision: 10, scale: 2 }).default("6.00"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
