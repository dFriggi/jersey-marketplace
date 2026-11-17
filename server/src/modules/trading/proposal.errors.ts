import { DomainError, type ErrorKind } from "../../core/errors";
import type { Rejection, RejectionCode } from "./proposal.rules";

// cada recusa das regras vira um DomainError com status HTTP e mensagem em português
const REJECTIONS: Record<RejectionCode, { kind: ErrorKind; message: string }> = {
  empty_shirt_list: { kind: "validation", message: "A troca precisa oferecer e pedir ao menos uma camisa" },
  duplicate_shirt: { kind: "validation", message: "A mesma camisa aparece mais de uma vez na proposta" },
  not_shirt_owner: { kind: "forbidden", message: "Você só pode oferecer camisas do seu acervo" },
  multiple_recipients: { kind: "validation", message: "Todas as camisas pedidas precisam ser do mesmo dono" },
  self_proposal: { kind: "business_rule", message: "Você não pode fazer uma proposta para si mesmo" },
  shirt_not_open_to_trade: { kind: "conflict", message: "A camisa pedida não está disponível para troca" },
  shirt_unavailable: { kind: "conflict", message: "A camisa não está mais disponível" },
  listing_not_active: { kind: "conflict", message: "A camisa não tem um anúncio de venda ativo" },
  price_mismatch: { kind: "business_rule", message: "O valor precisa ser igual ao preço pedido no anúncio" },
  not_recipient: { kind: "forbidden", message: "Só quem recebeu a proposta pode responder a ela" },
  not_author: { kind: "forbidden", message: "Só quem fez a proposta pode cancelá-la" },
  proposal_not_pending: { kind: "conflict", message: "A proposta não está mais pendente" },
  proposal_expired: { kind: "business_rule", message: "O prazo da proposta já venceu" },
};

export function rejectionToError(rejection: Rejection): DomainError {
  const { kind, message } = REJECTIONS[rejection.code];

  return new DomainError(kind, rejection.code, message, rejection.details);
}
