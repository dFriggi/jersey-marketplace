import { registerUsersHandlers } from "./modules/users";

//quem reage a cada evento de dominio
export function registerEventHandlers(): void {
  registerUsersHandlers();
}
