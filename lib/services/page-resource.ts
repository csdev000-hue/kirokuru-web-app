import "server-only";
import { notFound } from "next/navigation";
import { AccessError } from "@/lib/permissions/errors";
export async function pageResource<T>(load: () => Promise<T>): Promise<T> {
  try { return await load(); } catch (error) { if (error instanceof AccessError && error.status === 404) notFound(); throw error; }
}
