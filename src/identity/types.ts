// 用户身份和项目空间类型定义

export interface UserProfile {
  preferredModel?: string;
  codingStyle?: string;
  preferences?: Record<string, unknown>;
}

export interface User {
  id: string;
  name: string;
  email?: string;
  profile: UserProfile;
  createdAt?: string;
}

export type RoomRole = "owner" | "admin" | "developer" | "viewer";

export interface Room {
  id: string;
  name: string;
  description: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RoomMember {
  roomId: string;
  userId: string;
  userName?: string;   // JOIN 填充
  role: RoomRole;
  joinedAt?: string;
}
