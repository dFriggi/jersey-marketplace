import { DomainError, type ErrorKind } from "../../core/errors";
import type { DealRejection, DealRejectionCode } from "./deal.rules";

// cada recusa das regras vira um DomainError com status HTTP e mensagem em português
const REJECTIONS: Record<DealRejectionCode, { kind: ErrorKind; message: string }> = {
  deal_not_active: { kind: "conflict", message: "O negócio já foi concluído ou cancelado" },
  not_sender: { kind: "forbidden", message: "Você não tem camisas para enviar neste negócio" },
  shipment_already_shipped: { kind: "conflict", message: "Esta remessa já foi enviada" },
  invalid_tracking_code: { kind: "validation", message: "Informe o código de rastreio" },
  not_receiver: { kind: "forbidden", message: "Você não tem camisas para receber neste negócio" },
  shipment_not_shipped: { kind: "conflict", message: "A remessa ainda não foi enviada" },
  shipment_already_received: { kind: "conflict", message: "Esta remessa já foi recebida" },
  deal_not_ready: { kind: "conflict", message: "Todas as remessas precisam ser recebidas antes de concluir" },
};

export function dealRejectionToError(rejection: DealRejection): DomainError {
  const { kind, message } = REJECTIONS[rejection.code];

  return new DomainError(kind, rejection.code, message);
}
