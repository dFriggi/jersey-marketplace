import mongoose, { model, Schema, type Model } from "mongoose";
import { USER_ROLES, type UserRole } from "./user.types";

export interface UserDoc {
  name: string;
  email: string;
  passwordHash: string;
  roles: UserRole[];
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<UserDoc>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    roles: { type: [String], enum: USER_ROLES, default: ["USER"] },
  },
  { collection: "users", timestamps: true, versionKey: false }
);

UserSchema.index({ email: 1 }, { unique: true });

export const UserModel: Model<UserDoc> = (mongoose.models.User as Model<UserDoc>) ?? model<UserDoc>("User", UserSchema);
