//porta única do users. Outros modulos e o app importam daqui
export { registerUsersHandlers } from "./users.handlers";
export { usersRouter } from "./users.routes";
export { getUser, type PublicUser } from "./users.service";
