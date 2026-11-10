export enum USER_STATUS {
  ACTIVE = 1,
  INACTIVE = 0,
}

export interface User {
  id: string;
  username: string;
  email: string;
  name: string;
  avatar: string;
  banner: string;
  bio: string;
  role: "STUDENT" | "TEACHER";
  isSystemAdmin: boolean;
  isVerified: boolean;
  password?: string;
  createdAt: Date;
  updatedAt: Date;
}
