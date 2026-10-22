export type InboundMessage = Readonly<{
  id: string;
  received_at: string;
  channel: "email" | "web_form" | "sms";
  from: Readonly<{ name: string; email: string | null; phone: string | null }>;
  subject: string;
  body: string;
}>;

export type Category = "new_lead" | "follow_up" | "support";
