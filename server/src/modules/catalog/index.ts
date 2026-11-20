// porta única do catalog: outros módulos e o app importam daqui
export { getActiveSaleListing, getShirts, releaseShirts, reserveShirts, transferShirt } from "./catalog.service";
export type { ActiveSaleListing, ShirtSummary } from "./catalog.types";
