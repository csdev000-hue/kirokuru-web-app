import { TicketListPage } from "@/components/tickets/list-page";
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) { return <TicketListPage id={(await params).id} searchParams={await searchParams} board={true} />; }
