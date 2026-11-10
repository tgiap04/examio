import { api } from "@/apis/api";

export interface WalletInfo {
  balance: number;
}

/** The caller's wallet balance (`wallet:use`); the only place the balance comes from. */
export async function getWalletInfoApi(): Promise<WalletInfo> {
  const response = await api.get("/wallet/info");
  return { balance: Number(response.data?.balance ?? 0) };
}
