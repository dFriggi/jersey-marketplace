export interface DomainEvent {
  type: string;
  payload: Record<string, unknown>;
}
