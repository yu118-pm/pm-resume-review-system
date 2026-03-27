import { Workbench } from "@/components/workbench";

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const tool = resolvedSearchParams.tool;
  const toolValue = Array.isArray(tool) ? tool[0] : tool;
  const initialTool = toolValue === "pm-review" ? "pmReview" : "optimize";

  return <Workbench initialTool={initialTool} />;
}
