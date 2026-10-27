import { model, models, Schema, type Model } from "mongoose";

export const DOMAIN_EVENT_STATUSES = ["PENDING", "PROCESSED", "FAILED"] as const;
export type DomainEventStatus = (typeof DOMAIN_EVENT_STATUSES)[number];

// evento de dominio é um fato que aconteceu, gravado na mesma transação para que não haja falhas
export interface DomainEventDoc {
  type: string;
  payload: Record<string, unknown>;
  status: DomainEventStatus;
  attempts: number;
  handledBy: string[];
  lastError?: string;
  occurredAt: Date;
  processedAt?: Date;
}

const DomainEventSchema = new Schema<DomainEventDoc>(
  {
    type: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, enum: DOMAIN_EVENT_STATUSES, default: "PENDING" },
    attempts: { type: Number, default: 0 },
    handledBy: { type: [String], default: [] },
    lastError: String,
    occurredAt: { type: Date, required: true },
    processedAt: Date,
  },
  //minimize:false -> mantém payload: {}
  { collection: "domain_events", versionKey: false, minimize: false }
);

DomainEventSchema.index({ status: 1, occurredAt: 1 });

export const DomainEventModel: Model<DomainEventDoc> =
  (models.DomainEvent as Model<DomainEventDoc>) ?? model<DomainEventDoc>("DomainEvent", DomainEventSchema);
