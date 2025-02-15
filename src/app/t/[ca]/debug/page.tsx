// Do not cache this page

// Set cache to 'no-store' to prevent Vercel from caching this page
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { getOrScrapeByCa } from "~/lib/clanker";
import { serverFetchCAStale } from "~/app/server";

type Params = Promise<{ca: string}>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ 
  params,
  searchParams
}: { 
  params: Params
  searchParams: SearchParams
}) {
  const { ca } = await params
  await getOrScrapeByCa(ca)
  const data = await serverFetchCAStale(ca)
  return (
    <pre>
      {JSON.stringify(data, null, 2)}
    </pre>
  )
}