// porta única do catalog: outros módulos e o app importam daqui
export { catalogRouter } from "./catalog.routes";
export { getActiveSaleListing, getShirts } from "./catalog.service";
export type { ActiveSaleListing, ShirtSummary } from "./catalog.types";
